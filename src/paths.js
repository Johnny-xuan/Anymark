import { lstat, mkdir, open, readFile, readlink, realpath, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BridgeError } from './protocol.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getHome(home) {
  const value = home ?? process.env.ANYMARK_HOME ?? join(homedir(), '.anymark');
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new BridgeError('EINVAL', 'AnyMark home must be a nonempty path.');
  return resolve(value);
}

export function validateProfileId(profileId) {
  if (typeof profileId !== 'string' || !UUID.test(profileId)) throw new BridgeError('EPROFILE', 'A UUID profile ID is required.');
  return profileId.toLowerCase();
}

export function socketPath(home, profileId) {
  const path = join(getHome(home), 'run', `${validateProfileId(profileId)}.sock`);
  const limit = process.platform === 'darwin' ? 103 : 107;
  if (Buffer.byteLength(path) > limit) throw new BridgeError('ENAMETOOLONG', `AnyMark socket path is too long; choose a shorter ANYMARK_HOME (maximum ${limit} bytes).`);
  return path;
}

export async function inspectAncestors(path) {
  const trimTrailingSeparators = value => value.replace(/\/+$/, '') || sep;
  const pending = [dirname(resolve(path))];
  const seen = new Set();
  while (pending.length) {
    let current = trimTrailingSeparators(pending.pop());
    while (!seen.has(current)) {
      seen.add(current);
      const stat = await lstat(current);
      if (stat.uid !== 0 && stat.uid !== process.getuid()) {
        throw new BridgeError('EACCES', `Untrusted path ancestor: ${current}`);
      }
      if (stat.isSymbolicLink()) {
        const target = await readlink(current);
        pending.push(await realpath(current));
        // Preserve "..": lexical normalization can hide a replaceable link on the route.
        pending.push(isAbsolute(target) ? target : `${dirname(current)}${sep}${target}`);
      } else if (!stat.isDirectory() || (stat.mode & 0o022) && !(stat.mode & 0o1000)) {
        throw new BridgeError('EACCES', `A path ancestor can be replaced by another user: ${current}`);
      }
      const parent = trimTrailingSeparators(dirname(current));
      if (parent === current) break;
      current = parent;
    }
  }
}

export async function inspectPrivate(path, kind) {
  await inspectAncestors(path);
  const stat = await lstat(path);
  const expected = kind === 'directory' ? stat.isDirectory() : kind === 'socket' ? stat.isSocket() : stat.isFile();
  if (stat.isSymbolicLink() || !expected || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
    throw new BridgeError('EACCES', `Unsafe ${kind}: ${path}. Expected an owned, private ${kind} without symlinks.`);
  }
  return stat;
}

export async function ensurePrivateDirectory(path) {
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await inspectPrivate(path, 'directory');
  return path;
}

export async function ensureHome(home) {
  const path = getHome(home);
  await ensurePrivateDirectory(path);
  await ensurePrivateDirectory(join(path, 'run'));
  return path;
}

export async function readConfig(home) {
  const root = getHome(home);
  try {
    await inspectPrivate(root, 'directory');
    const path = join(root, 'config.json');
    await inspectPrivate(path, 'file');
    const config = JSON.parse(await readFile(path, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Expected an object.');
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    if (error instanceof SyntaxError || !error.code) throw new BridgeError('ECONFIG', `Invalid AnyMark config: ${error.message}`);
    throw error;
  }
}

export async function writeConfig(home, config) {
  const root = await ensureHome(home);
  const path = join(root, 'config.json');
  try { await inspectPrivate(path, 'file'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = join(dirname(path), `.config-${randomUUID()}.tmp`);
  let file;
  try {
    file = await open(temporary, 'wx', 0o600);
    await file.writeFile(`${JSON.stringify(config, null, 2)}\n`);
    await file.close();
    file = undefined;
    await rename(temporary, path);
  } finally {
    await file?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
