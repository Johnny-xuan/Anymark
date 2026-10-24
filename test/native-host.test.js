import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { endianness } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request, listProfiles, useProfile } from '../src/client.js';
import { ensureHome, readConfig, socketPath, writeConfig } from '../src/paths.js';
import { installHost } from '../src/install.js';
import { EXTENSION_ID, HOST_NAME, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES } from '../src/protocol.js';

const hostModule = new URL('../src/native-host.js', import.meta.url).href;
const littleEndian = endianness() === 'LE';

function frame(message) {
  const body = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  if (littleEndian) header.writeUInt32LE(body.length); else header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

function messages(stream, native = false) {
  let buffer = Buffer.alloc(0);
  const queue = [];
  const waiters = [];
  let ended = false;
  stream.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length) {
      let size;
      let start;
      let consumed;
      if (native) {
        if (buffer.length < 4) break;
        size = littleEndian ? buffer.readUInt32LE(0) : buffer.readUInt32BE(0);
        assert.ok(size > 0 && size <= MAX_REQUEST_BYTES, 'stdout contains only valid native frames');
        if (buffer.length < size + 4) break;
        start = 4;
        consumed = size + 4;
      } else {
        size = buffer.indexOf(10);
        if (size < 0) break;
        start = 0;
        consumed = size + 1;
      }
      const value = JSON.parse(buffer.subarray(start, start + size).toString('utf8'));
      buffer = buffer.subarray(consumed);
      if (waiters.length) waiters.shift().resolve(value); else queue.push(value);
    }
  });
  stream.on('end', () => {
    ended = true;
    for (const waiter of waiters.splice(0)) waiter.reject(new Error('Stream ended before a message arrived.'));
  });
  return () => {
    if (queue.length) return Promise.resolve(queue.shift());
    if (ended) return Promise.reject(new Error('Message stream has ended.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for a protocol message.')), 5000);
      waiters.push({ resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    });
  };
}

async function fixture(t) {
  // Keep Unix socket names short on macOS, independent of the test runner's TMPDIR.
  const home = await mkdtemp('/tmp/am-');
  const children = [];
  t.after(async () => {
    for (const peer of children) {
      if (peer.child.exitCode === null && peer.child.signalCode === null) peer.child.kill('SIGTERM');
      await peer.exited;
    }
    await rm(home, { recursive: true, force: true });
  });
  function spawnPeer(profileId = randomUUID()) {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import { runNativeHost } from ${JSON.stringify(hostModule)}; try { await runNativeHost({ home: ${JSON.stringify(home)} }); } catch (error) { console.error(error.code, error.message); process.exitCode = 1; }`], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.on('error', () => {});
    const exited = once(child, 'exit').then(([code, signal]) => ({ code, signal }));
    const peer = { child, profileId, read: messages(child.stdout, true), exited, diagnostics: () => stderr, send: message => child.stdin.write(frame(message)) };
    children.push(peer);
    return peer;
  }
  async function start(profileId = randomUUID(), fragmented = false) {
    const peer = spawnPeer(profileId);
    const hello = frame({ type: 'hello', version: 1, profileId, label: 'Test profile', access: 'readwrite' });
    if (fragmented) {
      peer.child.stdin.write(hello.subarray(0, 2));
      peer.child.stdin.write(hello.subarray(2, 7));
      peer.child.stdin.write(hello.subarray(7));
    } else peer.child.stdin.write(hello);
    assert.deepEqual(await peer.read(), { type: 'ready', profileId });
    return peer;
  }
  return { home, start, spawnPeer };
}

async function connect(t, path) {
  const socket = net.createConnection(path);
  socket.on('error', () => {});
  const read = messages(socket);
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  return { socket, read, send: value => socket.write(`${JSON.stringify(value)}\n`) };
}

const ipc = (id, operation, args = {}) => ({ id, version: 1, operation, args });

test('fragmented native frames, private permissions, local status and strict profile selection', async t => {
  const { home, start } = await fixture(t);
  const peer = await start(randomUUID(), true);
  const options = { home, profileId: peer.profileId };
  assert.equal((await lstat(home)).mode & 0o777, 0o700);
  assert.equal((await lstat(join(home, 'run'))).mode & 0o777, 0o700);
  assert.equal((await lstat(socketPath(home, peer.profileId))).mode & 0o777, 0o600);
  assert.deepEqual(await listProfiles({ home }), [{ profileId: peer.profileId, label: 'Test profile', access: 'readwrite', version: 1 }]);
  assert.equal((await request('status', {}, options)).profileId, peer.profileId);
  const previous = process.env.ANYMARK_PROFILE;
  delete process.env.ANYMARK_PROFILE;
  t.after(() => { if (previous === undefined) delete process.env.ANYMARK_PROFILE; else process.env.ANYMARK_PROFILE = previous; });
  await assert.rejects(request('status', {}, { home }), { code: 'EPROFILE' });
  await useProfile(peer.profileId, { home });
  assert.equal((await request('status', {}, { home })).profileId, peer.profileId);
  assert.equal((await lstat(join(home, 'config.json'))).mode & 0o777, 0o600);
  const offline = randomUUID();
  await useProfile(offline, { home });
  await assert.rejects(request('status', {}, { home }), { code: 'EOFFLINE' });
  process.env.ANYMARK_PROFILE = peer.profileId;
  assert.equal((await request('status', {}, { home })).profileId, peer.profileId);
  await assert.rejects(request('status', {}, { home, profileId: offline }), { code: 'EOFFLINE' });
});

test('caller IDs are remapped and responses belong only to their originating connection', async t => {
  const { home, start } = await fixture(t);
  const peer = await start();
  const a = await connect(t, socketPath(home, peer.profileId));
  const b = await connect(t, socketPath(home, peer.profileId));
  a.send(ipc('same', 'stat', { path: '/' }));
  const first = await peer.read();
  b.send(ipc('same', 'ls', { path: '/' }));
  const second = await peer.read();
  assert.equal(first.type, 'request');
  assert.notEqual(first.id, 'same');
  assert.notEqual(first.id, second.id);
  peer.send({ type: 'response', id: second.id, result: { source: 'b' } });
  peer.send({ type: 'response', id: first.id, error: { code: 'ENOENT', message: 'Missing', details: { path: '/' } } });
  assert.deepEqual(await b.read(), { id: 'same', ok: true, profileId: peer.profileId, result: { source: 'b' } });
  assert.deepEqual(await a.read(), { id: 'same', ok: false, error: { code: 'ENOENT', message: 'Missing', details: { path: '/' } } });
  a.send(ipc('bad', 'constructor'));
  assert.equal((await a.read()).error.code, 'ENOSYS');
  a.send({ id: 'version', version: 2, operation: 'status', args: {} });
  assert.equal((await a.read()).error.code, 'EPROTOCOL');
  a.send(ipc('next', 'cat', { path: 'id:8' }));
  const next = await peer.read();
  assert.equal(next.operation, 'cat', 'invalid requests and status are never forwarded to Chrome');
  peer.send({ type: 'response', id: next.id, result: { title: 'x', url: 'https://example.com' } });
  assert.equal((await a.read()).id, 'next');
});

test('native EOF reports submitted writes as unknown and reads as offline, then removes its socket', async t => {
  const { home, start } = await fixture(t);
  const peer = await start();
  const options = { home, profileId: peer.profileId };
  const writeResult = request('mkdir', { path: '/new' }, options).catch(error => error);
  assert.equal((await peer.read()).operation, 'mkdir');
  const readResult = request('stat', { path: '/' }, options).catch(error => error);
  assert.equal((await peer.read()).operation, 'stat');
  peer.child.stdin.end();
  assert.equal((await writeResult).code, 'EUNKNOWN');
  assert.equal((await readResult).code, 'EOFFLINE');
  assert.deepEqual(await peer.exited, { code: 0, signal: null });
  await assert.rejects(lstat(socketPath(home, peer.profileId)), { code: 'ENOENT' });
  await assert.rejects(request('mkdir', { path: '/never-sent' }, options), { code: 'EOFFLINE' });
});

test('write timeout is unknown, does not cancel or replay, and a late result cannot leak to another caller', async t => {
  const { home, start } = await fixture(t);
  const peer = await start();
  const options = { home, profileId: peer.profileId };
  const timed = request('write', { path: '/new', content: { url: 'https://example.com' } }, { ...options, timeoutMs: 100 }).catch(error => error);
  const original = await peer.read();
  const error = await timed;
  assert.equal(error.code, 'EUNKNOWN');
  assert.equal(error.details.outcome, 'unknown');
  peer.send({ type: 'response', id: original.id, result: { created: true } });
  const next = request('stat', { path: '/' }, options);
  const nextMessage = await peer.read();
  assert.equal(nextMessage.operation, 'stat');
  assert.notEqual(nextMessage.id, original.id);
  peer.send({ type: 'response', id: nextMessage.id, result: { current: true } });
  assert.deepEqual((await next).result, { current: true });
  const readTimeout = request('stat', { path: '/' }, { ...options, timeoutMs: 100 }).catch(error => error);
  await peer.read();
  assert.equal((await readTimeout).code, 'ETIMEDOUT');
});

test('active duplicate hosts are rejected; a confirmed stale owned socket is reclaimed', async t => {
  const { home, start, spawnPeer } = await fixture(t);
  const peer = await start();
  const path = socketPath(home, peer.profileId);
  const before = await lstat(path);
  const duplicate = spawnPeer(peer.profileId);
  duplicate.send({ type: 'hello', version: 1, profileId: peer.profileId, label: 'Duplicate', access: 'readwrite' });
  assert.equal((await duplicate.exited).code, 1);
  assert.match(duplicate.diagnostics(), /EADDRINUSE/);
  assert.equal((await lstat(path)).ino, before.ino);
  peer.child.kill('SIGKILL');
  await peer.exited;
  assert.ok((await lstat(path)).isSocket());
  const replacement = await start(peer.profileId);
  assert.equal((await request('status', {}, { home, profileId: peer.profileId })).result.label, 'Test profile');
  replacement.child.kill('SIGTERM');
  await replacement.exited;
  await assert.rejects(lstat(path), { code: 'ENOENT' });
});

test('unsafe directories, socket substitutions and malformed profile IDs are rejected without deletion', async t => {
  const { home, spawnPeer } = await fixture(t);
  await chmod(home, 0o755);
  await assert.rejects(ensureHome(home), { code: 'EACCES' });
  await chmod(home, 0o700);
  await ensureHome(home);
  const profileId = randomUUID();
  const path = socketPath(home, profileId);
  await writeFile(path, 'do not delete', { mode: 0o600 });
  const peer = spawnPeer(profileId);
  peer.send({ type: 'hello', version: 1, profileId, label: 'Unsafe', access: 'readwrite' });
  assert.equal((await peer.exited).code, 1);
  assert.match(peer.diagnostics(), /EACCES/);
  assert.equal(await readFile(path, 'utf8'), 'do not delete');
  await assert.rejects(request('status', {}, { home, profileId }), { code: 'EACCES' });
  await assert.rejects(useProfile('../escape', { home }), { code: 'EPROFILE' });
  await rm(path);
  await symlink(join(home, 'elsewhere'), path);
  await assert.rejects(request('status', {}, { home, profileId }), { code: 'EACCES' });
  assert.ok((await lstat(path)).isSymbolicLink());
});

test('writable ancestors cannot contain the private native host or registration directory', async t => {
  const { home } = await fixture(t);
  await chmod(home, 0o777);
  await assert.rejects(ensureHome(join(home, 'private-state')), { code: 'EACCES' });
  const safeHome = await mkdtemp('/tmp/am-');
  t.after(() => rm(safeHome, { recursive: true, force: true }));
  await assert.rejects(installHost({ home: safeHome, userDataDir: join(home, 'browser') }), { code: 'EACCES' });
});

test('installer rejects unsafe intermediate symlink routes hidden by parent traversal', async t => {
  const { home } = await fixture(t);
  const safe = join(home, 'safe');
  await mkdir(join(safe, 'child'), { recursive: true, mode: 0o700 });
  await mkdir(join(safe, 'state'), { mode: 0o700 });
  const shared = join(home, 'shared');
  await mkdir(shared, { mode: 0o700 });
  await chmod(shared, 0o777);
  await symlink(join(safe, 'child'), join(shared, 'relay'));
  await symlink(join(shared, 'relay'), join(home, 'trusted-hop'));
  await symlink('trusted-hop/../state', join(home, 'selected'));
  const userDataDir = join(home, 'browser');
  await assert.rejects(installHost({ home: join(home, 'selected', '.anymark'), userDataDir }), { code: 'EACCES' });
  await assert.rejects(lstat(join(userDataDir, 'NativeMessagingHosts', `${HOST_NAME}.json`)), { code: 'ENOENT' });
});

test('installer inspects symlink targets that end with a directory separator', async t => {
  const { home } = await fixture(t);
  const safe = join(home, 'safe');
  const shared = join(home, 'shared');
  await mkdir(safe, { mode: 0o700 });
  await mkdir(shared, { mode: 0o700 });
  await chmod(shared, 0o777);
  await symlink(safe, join(shared, 'relay'));
  await symlink(join(shared, 'relay'), join(home, 'trusted-hop'));
  await symlink('trusted-hop/', join(home, 'selected'));
  await assert.rejects(ensureHome(join(home, 'selected', '.anymark')), { code: 'EACCES' });
});

test('private relative symlink routes retain configuration access', async t => {
  const { home } = await fixture(t);
  const safe = join(home, 'safe');
  await mkdir(join(safe, 'child'), { recursive: true, mode: 0o700 });
  await mkdir(join(safe, 'state'), { mode: 0o700 });
  await symlink('safe/child', join(home, 'trusted-hop'));
  await symlink('trusted-hop/../state', join(home, 'selected'));
  const root = await ensureHome(join(home, 'selected', '.anymark'));
  const config = { defaultProfileId: randomUUID() };
  await writeConfig(root, config);
  assert.deepEqual(JSON.parse(await readFile(join(safe, 'state', '.anymark', 'config.json'), 'utf8')), config);
  assert.deepEqual(await readConfig(root), config);
});

test('shutdown never removes a replacement at the former public socket path', async t => {
  const { home, start } = await fixture(t);
  const peer = await start();
  const path = socketPath(home, peer.profileId);
  await rm(path);
  await writeFile(path, 'replacement owned by another component', { mode: 0o600 });
  peer.child.stdin.end();
  assert.equal((await peer.exited).code, 0);
  assert.equal(await readFile(path, 'utf8'), 'replacement owned by another component');
});

test('malformed and truncated native frames fail without emitting non-protocol stdout', async t => {
  const { spawnPeer } = await fixture(t);
  const oversized = spawnPeer();
  const header = Buffer.alloc(4);
  if (littleEndian) header.writeUInt32LE(MAX_RESPONSE_BYTES + 1); else header.writeUInt32BE(MAX_RESPONSE_BYTES + 1);
  oversized.child.stdin.end(header);
  assert.equal((await oversized.exited).code, 1);
  assert.match(oversized.diagnostics(), /EMSGSIZE/);
  const truncated = spawnPeer();
  truncated.child.stdin.end(frame({ type: 'hello' }).subarray(0, 6));
  assert.equal((await truncated.exited).code, 1);
  assert.match(truncated.diagnostics(), /EPROTOCOL/);
});

test('installer writes a private executable launcher and exact-origin manifest in an isolated browser directory', async t => {
  const { home } = await fixture(t);
  const userDataDir = join(home, "browser's profile");
  const installed = await installHost({ home: join(home, "host's home"), userDataDir, browser: 'chrome-for-testing' });
  assert.equal(installed.manifestPath, join(userDataDir, 'NativeMessagingHosts', `${HOST_NAME}.json`));
  assert.equal(installed.extensionId, EXTENSION_ID);
  assert.equal((await lstat(installed.hostPath)).mode & 0o777, 0o700);
  const manifest = JSON.parse(await readFile(installed.manifestPath, 'utf8'));
  assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${EXTENSION_ID}/`]);
  assert.equal(manifest.path, installed.hostPath);
  assert.equal(manifest.type, 'stdio');
  assert.match(await readFile(installed.hostPath, 'utf8'), /"\$@"/);
  const child = spawn(installed.hostPath, ['chrome-extension://example/', '--parent-window=0'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); });
  let diagnostics = '';
  child.stderr.on('data', chunk => { diagnostics += chunk; });
  const read = messages(child.stdout, true);
  const profileId = randomUUID();
  child.stdin.write(frame({ type: 'hello', version: 1, profileId, label: 'Installed launcher', access: 'readwrite' }));
  assert.deepEqual(await read(), { type: 'ready', profileId });
  child.stdin.end();
  const [code] = await exited;
  assert.equal(code, 0, diagnostics);
  await assert.rejects(installHost({ home, userDataDir, extensionId: '*' }), { code: 'EINVAL' });
  await assert.rejects(installHost({ home, userDataDir, browser: 'unknown' }), { code: 'EINVAL' });
});

test('empty profile environment uses the explicit saved default, while offline selections never fall back', async t => {
  const { home, start } = await fixture(t);
  const peer = await start();
  await useProfile(peer.profileId, { home });
  const previous = process.env.ANYMARK_PROFILE;
  t.after(() => {
    if (previous === undefined) delete process.env.ANYMARK_PROFILE;
    else process.env.ANYMARK_PROFILE = previous;
  });
  process.env.ANYMARK_PROFILE = '';
  assert.equal((await request('status', {}, { home })).profileId, peer.profileId);
  process.env.ANYMARK_PROFILE = randomUUID();
  await assert.rejects(request('status', {}, { home }), { code: 'EOFFLINE' });
});
