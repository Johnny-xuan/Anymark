import { chmod, lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { BridgeError, EXTENSION_ID, HOST_NAME } from './protocol.js';
import { ensureHome, inspectAncestors } from './paths.js';

const quote = value => `'${value.replace(/'/g, `'"'"'`)}'`;

function browserDirectory(browser) {
  if (process.platform === 'darwin') {
    const directories = { chrome: ['Google', 'Chrome'], chromium: ['Chromium'], 'chrome-for-testing': ['Google', 'ChromeForTesting'] };
    return join(homedir(), 'Library', 'Application Support', ...directories[browser]);
  }
  const directories = { chrome: 'google-chrome', chromium: 'chromium', 'chrome-for-testing': 'google-chrome-for-testing' };
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), directories[browser]);
}

async function writableTarget(path) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()) throw new BridgeError('EACCES', `Refusing to replace unsafe install target: ${path}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function atomicInstall(path, content, mode) {
  await writableTarget(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  let file;
  try {
    file = await open(temporary, 'wx', mode);
    await file.writeFile(content);
    await file.close();
    file = undefined;
    await chmod(temporary, mode);
    await rename(temporary, path);
  } finally {
    await file?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function installHost({ browser = 'chrome', userDataDir, home, extensionId = EXTENSION_ID } = {}) {
  if (!['darwin', 'linux'].includes(process.platform)) throw new BridgeError('ENOTSUP', 'Native host installation supports macOS and Linux only.');
  if (!['chrome', 'chromium', 'chrome-for-testing'].includes(browser)) throw new BridgeError('EINVAL', `Unsupported browser: ${browser}`);
  if (typeof extensionId !== 'string' || !/^[a-p]{32}$/.test(extensionId)) throw new BridgeError('EINVAL', 'Extension ID must contain exactly 32 letters a-p.');
  if (userDataDir !== undefined && (typeof userDataDir !== 'string' || !userDataDir || userDataDir.includes('\0'))) throw new BridgeError('EINVAL', 'userDataDir must be a nonempty directory path.');
  const root = await ensureHome(home);
  const directory = join(resolve(userDataDir === undefined ? browserDirectory(browser) : userDataDir), 'NativeMessagingHosts');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await inspectAncestors(directory);
  const stat = await lstat(directory);
  // Existing browser registration directories may be readable, but never writable by another user.
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o022)) throw new BridgeError('EACCES', `Unsafe native host registration directory: ${directory}`);
  const hostPath = join(root, 'native-host');
  const entry = fileURLToPath(new URL('../bin/anymark.js', import.meta.url));
  await atomicInstall(hostPath, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(entry)} native-host --home ${quote(root)} "$@"\n`, 0o700);
  const manifestPath = join(directory, `${HOST_NAME}.json`);
  await atomicInstall(manifestPath, `${JSON.stringify({ name: HOST_NAME, description: 'AnyMark local bookmark filesystem bridge', path: hostPath, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`] }, null, 2)}\n`, 0o600);
  return { manifestPath, hostPath, extensionId };
}
