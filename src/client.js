import net from 'node:net';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BridgeError, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, OPERATIONS, PROTOCOL_VERSION, validateOperation } from './protocol.js';
import { getHome, inspectPrivate, readConfig, socketPath, validateProfileId, writeConfig } from './paths.js';

async function selectedProfile(profileId, home) {
  const selected = profileId ?? (process.env.ANYMARK_PROFILE || undefined) ?? (await readConfig(home)).defaultProfileId;
  if (!selected) throw new BridgeError('EPROFILE', 'Choose a profile explicitly with --profile, ANYMARK_PROFILE, or anymark use.');
  return validateProfileId(selected);
}

function validateRequest(operation, args) {
  if (operation === 'status') {
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) throw new BridgeError('EINVAL', 'status does not accept arguments.');
  } else {
    if (!Object.hasOwn(OPERATIONS, operation)) throw new BridgeError('ENOSYS', `Unknown operation: ${operation}`);
    validateOperation(operation, args);
  }
}

export async function request(operation, args = {}, { home, profileId, timeoutMs = 30_000 } = {}) {
  validateRequest(operation, args);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new BridgeError('EINVAL', 'timeoutMs must be a positive finite timer duration.');
  const root = getHome(home);
  const selected = await selectedProfile(profileId, root);
  const path = socketPath(root, selected);
  try {
    await inspectPrivate(root, 'directory');
    await inspectPrivate(join(root, 'run'), 'directory');
    await inspectPrivate(path, 'socket');
  } catch (error) {
    if (error.code === 'ENOENT') throw new BridgeError('EOFFLINE', `Profile ${selected} is offline.`, { profileId: selected });
    throw error;
  }
  const id = randomUUID();
  const body = Buffer.from(`${JSON.stringify({ id, version: PROTOCOL_VERSION, operation, args })}\n`);
  if (body.length - 1 > MAX_REQUEST_BYTES) throw new BridgeError('EMSGSIZE', 'IPC request exceeds the size limit.');
  const writing = operation !== 'status' && !OPERATIONS[operation].readOnly;
  return new Promise((resolve, reject) => {
    let sent = false;
    let settled = false;
    let input = Buffer.alloc(0);
    const socket = net.createConnection(path);
    const uncertain = cause => new BridgeError('EUNKNOWN', 'The write was submitted, but its outcome is unknown. Do not replay it automatically.', { outcome: 'unknown', cause });
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(result);
    };
    const lost = (code, message) => sent && writing ? uncertain(code) : new BridgeError(code, message, { profileId: selected });
    const timer = setTimeout(() => finish(lost(sent ? 'ETIMEDOUT' : 'EOFFLINE', sent ? 'Request timed out; timeout does not cancel a browser operation.' : `Profile ${selected} did not connect.`)), timeoutMs);
    socket.once('connect', () => {
      sent = true;
      socket.write(body);
    });
    socket.on('error', error => finish(lost('EOFFLINE', `Profile ${selected} disconnected: ${error.message}`)));
    socket.once('close', () => finish(lost('EOFFLINE', `Profile ${selected} disconnected before replying.`)));
    socket.on('data', chunk => {
      input = Buffer.concat([input, chunk]);
      const newline = input.indexOf(10);
      if (input.length > MAX_RESPONSE_BYTES && (newline < 0 || newline > MAX_RESPONSE_BYTES)) {
        finish(lost('EPROTOCOL', 'IPC response exceeds the size limit.'));
        return;
      }
      if (newline < 0) return;
      let message;
      try { message = JSON.parse(input.subarray(0, newline).toString('utf8')); }
      catch { finish(lost('EPROTOCOL', 'Host returned invalid JSON.')); return; }
      if (!message || message.id !== id || typeof message.ok !== 'boolean') {
        finish(lost('EPROTOCOL', 'Host returned an invalid response envelope.'));
      } else if (!message.ok) {
        if (!message.error || typeof message.error.code !== 'string' || typeof message.error.message !== 'string') finish(lost('EPROTOCOL', 'Host returned an invalid error.'));
        else finish(new BridgeError(message.error.code, message.error.message, message.error.details));
      } else if (message.profileId !== selected || !Object.hasOwn(message, 'result')) {
        finish(lost('EPROTOCOL', 'Host response does not match the selected profile.'));
      } else finish(undefined, { profileId: selected, result: message.result });
    });
  });
}

export async function listProfiles({ home } = {}) {
  const root = getHome(home);
  let entries;
  try {
    await inspectPrivate(root, 'directory');
    await inspectPrivate(join(root, 'run'), 'directory');
    entries = await readdir(join(root, 'run'));
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const profiles = await Promise.all(entries.sort().filter(name => /^[0-9a-f-]+\.sock$/i.test(name)).map(async name => {
    let profileId;
    try { profileId = validateProfileId(name.slice(0, -5)); } catch { return undefined; }
    try {
      const { result } = await request('status', {}, { home: root, profileId, timeoutMs: 1000 });
      if (!result || result.profileId !== profileId || result.version !== PROTOCOL_VERSION || typeof result.label !== 'string' || result.access !== 'readwrite') throw new BridgeError('EPROTOCOL', 'Host returned invalid profile metadata.');
      return result;
    } catch (error) {
      if (error.code === 'EOFFLINE' || error.code === 'ETIMEDOUT') return undefined;
      throw error;
    }
  }));
  return profiles.filter(Boolean);
}

export async function useProfile(profileId, { home } = {}) {
  const selected = validateProfileId(profileId);
  // Selection is explicit and remains valid while the browser is offline.
  const config = await readConfig(home);
  await writeConfig(home, { ...config, defaultProfileId: selected });
  return { profileId: selected };
}
