import net from 'node:net';
import { chmod, link, lstat, unlink } from 'node:fs/promises';
import { endianness } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { BridgeError, errorPayload, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, OPERATIONS, PROTOCOL_VERSION, validateOperation } from './protocol.js';
import { ensureHome, inspectPrivate, socketPath, validateProfileId } from './paths.js';

const littleEndian = endianness() === 'LE';
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 256 || Number.isSafeInteger(id);
const unknown = () => new BridgeError('EUNKNOWN', 'The write was submitted, but its outcome is unknown. Do not replay it automatically.', { outcome: 'unknown' });

function encodeNative(message) {
  const body = Buffer.from(JSON.stringify(message));
  if (body.length > MAX_REQUEST_BYTES) throw new BridgeError('EMSGSIZE', 'Native message exceeds the size limit.');
  const header = Buffer.allocUnsafe(4);
  if (littleEndian) header.writeUInt32LE(body.length); else header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

async function removeStaleSocket(path) {
  let before;
  try { before = await inspectPrivate(path, 'socket'); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  await new Promise((resolve, reject) => {
    const probe = net.createConnection(path);
    probe.setTimeout(1000);
    probe.once('connect', () => { probe.destroy(); reject(new BridgeError('EADDRINUSE', 'This profile already has an active native host.')); });
    probe.once('timeout', () => { probe.destroy(); reject(new BridgeError('EADDRINUSE', 'The existing profile socket could not be confirmed stale.')); });
    probe.once('error', error => {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') resolve();
      else reject(error);
    });
  });
  try {
    const after = await inspectPrivate(path, 'socket');
    if (before.dev !== after.dev || before.ino !== after.ino) throw new BridgeError('EADDRINUSE', 'The profile socket changed while checking its owner.');
    await unlink(path);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function runNativeHost({ home } = {}) {
  const root = await ensureHome(home);
  const sockets = new Set();
  const pending = new Map();
  let server;
  let boundPath;
  let boundIdentity;
  let profile;
  let buffer = Buffer.alloc(0);
  let closing = false;
  let shutdownPromise;
  let settle;
  let fail;
  const finished = new Promise((resolve, reject) => { settle = resolve; fail = reject; });

  function reply(socket, message) {
    if (!socket.destroyed && socket.writable) socket.write(`${JSON.stringify(message)}\n`);
  }

  function sendNative(message) {
    if (closing || process.stdout.destroyed) throw new BridgeError('EOFFLINE', 'The browser connection is closed.');
    process.stdout.write(encodeNative(message));
  }

  function shutdown(error) {
    if (shutdownPromise) return shutdownPromise;
    closing = true;
    process.stdin.pause();
    process.stdin.off('data', onData);
    process.stdin.off('end', onEnd);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    shutdownPromise = (async () => {
      await processing;
      for (const { socket, callerId, operation } of pending.values()) {
        reply(socket, { id: callerId, ok: false, error: errorPayload(OPERATIONS[operation].readOnly ? new BridgeError('EOFFLINE', 'The browser disconnected.') : unknown()) });
      }
      pending.clear();
      const closed = server?.listening ? new Promise(resolve => server.close(resolve)) : Promise.resolve();
      for (const socket of sockets) {
        socket.end();
        // A local peer that stops reading must not keep a dead browser host alive.
        const timer = setTimeout(() => socket.destroy(), 1000);
        timer.unref();
        socket.once('close', () => clearTimeout(timer));
      }
      await closed;
      if (boundPath && boundIdentity) {
        try {
          const stat = await lstat(boundPath);
          if (stat.isSocket() && stat.uid === process.getuid() && stat.dev === boundIdentity.dev && stat.ino === boundIdentity.ino) await unlink(boundPath);
        } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') throw cleanupError; }
      }
      process.stdin.destroy();
      process.stdout.destroy();
    })();
    shutdownPromise.then(() => error ? fail(error) : settle(), fail);
    return shutdownPromise;
  }

  function handleClient(socket) {
    if (closing) { socket.destroy(); return; }
    sockets.add(socket);
    let input = Buffer.alloc(0);
    const owned = new Set();
    socket.on('error', () => {});
    socket.on('close', () => {
      sockets.delete(socket);
      for (const id of owned) pending.delete(id);
    });
    socket.on('data', chunk => {
      input = Buffer.concat([input, chunk]);
      while (input.length) {
        const newline = input.indexOf(10);
        if (newline < 0) {
          if (input.length > MAX_REQUEST_BYTES) socket.destroy();
          return;
        }
        const line = input.subarray(0, newline);
        input = input.subarray(newline + 1);
        let message;
        try {
          if (line.length > MAX_REQUEST_BYTES) throw new BridgeError('EMSGSIZE', 'IPC request exceeds the size limit.');
          try { message = JSON.parse(line.toString('utf8')); } catch { throw new BridgeError('EPROTOCOL', 'IPC request must be JSON.'); }
          if (!message || !validId(message.id) || message.version !== PROTOCOL_VERSION) throw new BridgeError('EPROTOCOL', 'IPC requires an ID and protocol version 1.');
          for (const id of owned) {
            if (pending.get(id)?.callerId === message.id) throw new BridgeError('EPROTOCOL', 'An outstanding request already uses this ID.');
          }
          if (message.operation === 'status') {
            if (message.args && (typeof message.args !== 'object' || Array.isArray(message.args) || Object.keys(message.args).length)) throw new BridgeError('EINVAL', 'status does not accept arguments.');
            reply(socket, { id: message.id, ok: true, profileId: profile.profileId, result: profile });
            continue;
          }
          if (!Object.hasOwn(OPERATIONS, message.operation)) throw new BridgeError('ENOSYS', `Unknown operation: ${message.operation}`);
          validateOperation(message.operation, message.args);
          const id = randomUUID();
          const forwarded = { type: 'request', id, operation: message.operation, args: message.args };
          // Encode before registering: a rejected oversized write was never submitted.
          const frame = encodeNative(forwarded);
          if (closing) throw new BridgeError('EOFFLINE', 'The browser connection is closed.');
          pending.set(id, { socket, callerId: message.id, operation: message.operation, owned });
          owned.add(id);
          try { process.stdout.write(frame); } catch (error) { void shutdown(error); return; }
        } catch (error) {
          reply(socket, { id: validId(message?.id) ? message.id : null, ok: false, error: errorPayload(error) });
        }
      }
    });
  }

  async function onMessage(message) {
    if (!profile) {
      if (!message || message.type !== 'hello' || message.version !== PROTOCOL_VERSION || message.access !== 'readwrite' || typeof message.label !== 'string') throw new BridgeError('EPROTOCOL', 'The first native message must be an authorized version 1 profile hello.');
      profile = { profileId: validateProfileId(message.profileId), label: message.label, access: message.access, version: PROTOCOL_VERSION };
      const path = socketPath(root, profile.profileId);
      await removeStaleSocket(path);
      if (closing) return;
      const staging = join(root, 'run', `.s-${randomUUID().replaceAll('-', '').slice(0, 16)}`);
      server = net.createServer(handleClient);
      const oldMask = process.umask(0o077);
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(staging, () => { server.off('error', reject); resolve(); });
        });
      } finally { process.umask(oldMask); }
      server.on('error', error => { void shutdown(error); });
      if (closing) return;
      await chmod(staging, 0o600);
      const identity = await lstat(staging);
      // libuv unlinks its original bind path on close. Publish with a hard link
      // so a replaced public path is cleaned only by our inode-checked unlink.
      // link() also refuses to overwrite a concurrent host's public socket.
      try { await link(staging, path); } catch (error) {
        if (error.code === 'EEXIST') throw new BridgeError('EADDRINUSE', 'This profile already has a native host.');
        throw error;
      }
      boundPath = path;
      boundIdentity = identity;
      await unlink(staging);
      if (closing) return;
      sendNative({ type: 'ready', profileId: profile.profileId });
      return;
    }
    if (!message || message.type !== 'response' || typeof message.id !== 'string') throw new BridgeError('EPROTOCOL', 'Expected a native response.');
    const request = pending.get(message.id);
    if (!request) return;
    if (Object.hasOwn(message, 'error')) {
      if (!message.error || typeof message.error.code !== 'string' || typeof message.error.message !== 'string') throw new BridgeError('EPROTOCOL', 'Malformed native error response.');
      reply(request.socket, { id: request.callerId, ok: false, error: message.error });
    } else if (Object.hasOwn(message, 'result')) {
      reply(request.socket, { id: request.callerId, ok: true, profileId: profile.profileId, result: message.result });
    } else throw new BridgeError('EPROTOCOL', 'A native response must contain a result or error.');
    pending.delete(message.id);
    request.owned.delete(message.id);
  }

  let processing = Promise.resolve();
  function onData(chunk) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = littleEndian ? buffer.readUInt32LE(0) : buffer.readUInt32BE(0);
      if (!length || length > MAX_RESPONSE_BYTES) { void shutdown(new BridgeError('EMSGSIZE', 'Invalid native message length.')); return; }
      if (buffer.length < length + 4) return;
      const body = buffer.subarray(4, length + 4);
      buffer = buffer.subarray(length + 4);
      processing = processing.then(async () => {
        if (closing) return;
        let message;
        try { message = JSON.parse(body.toString('utf8')); } catch { throw new BridgeError('EPROTOCOL', 'Native message must be JSON.'); }
        await onMessage(message);
      }).catch(error => { void shutdown(error); });
    }
  }
  function onEnd() {
    void processing.then(() => shutdown(buffer.length ? new BridgeError('EPROTOCOL', 'Native input ended in a partial frame.') : undefined));
  }
  function onInputError(error) { void shutdown(error); }
  function onOutputError(error) { void shutdown(error); }
  function onSignal() { void shutdown(); }
  process.stdin.on('data', onData);
  process.stdin.once('end', onEnd);
  process.stdin.once('error', onInputError);
  process.stdout.on('error', onOutputError);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  return finished;
}
