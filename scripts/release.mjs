import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExtension } from './build.mjs';
import { VERSION } from '../src/protocol.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(root, 'extension/manifest.json'), 'utf8'));
if (![metadata.version, lock.version, lock.packages[''].version, manifest.version].every(version => version === VERSION)
    || lock.name !== metadata.name || lock.packages[''].name !== metadata.name) {
  throw new Error('Package, lockfile, extension, and protocol product versions must agree before packaging.');
}
if (!/^\d+\.\d+\.\d+$/.test(VERSION) || !Array.isArray(metadata.files)) {
  throw new Error('A stable semantic version and explicit source-file allowlist are required.');
}

const output = join(root, 'dist/releases', `v${VERSION}`);
const temporary = await mkdtemp(join(tmpdir(), 'anymark-release-'));
const extensionName = `anymark-v${VERSION}-chrome-extension`;
const sourceName = `anymark-v${VERSION}-agent-connector-source`;
const extensionDirectory = join(temporary, extensionName);
const sourceDirectory = join(temporary, sourceName);

function archive(directory, filename) {
  const result = spawnSync('zip', ['-q', '-r', '-X', filename, basename(directory)], {
    cwd: dirname(directory), encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'ZIP creation failed; install the zip command.');
}

async function copySource(relative) {
  if (relative.split(/[\\/]/).some(part => part === '..') || relative.startsWith('/')) {
    throw new Error(`Release paths must stay within the repository: ${relative}`);
  }
  if (/(^|\/)(?:\.git|\.TreeWork|node_modules|__pycache__)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:pem|key|log)$/i.test(relative)) {
    throw new Error(`Private or generated content is not allowed in a release: ${relative}`);
  }
  const source = join(root, relative);
  const destination = join(sourceDirectory, relative);
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Release source must not contain symbolic links: ${relative}`);
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const name of (await readdir(source)).sort()) await copySource(join(relative, name));
  } else if (info.isFile()) {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  } else {
    throw new Error(`Unsupported release input: ${relative}`);
  }
}

async function thirdPartyNotices(inputs) {
  const packages = new Set();
  for (const input of Object.keys(inputs)) {
    const match = input.replaceAll('\\', '/').match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (match) packages.add(match[1]);
  }
  const notices = ['Third-party software bundled with the AnyMark Chrome extension.'];
  for (const name of [...packages].sort()) {
    const directory = join(root, 'node_modules', name);
    const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    const licenses = (await readdir(directory)).filter(filename => /^(?:licen[cs]e|copying)(?:[.-].*)?$/i.test(filename));
    if (!licenses.length) throw new Error(`No bundled dependency license found for ${name}.`);
    notices.push(`\n${name}@${pkg.version} (${pkg.license || 'see license below'})\n${'='.repeat(60)}`);
    for (const filename of licenses.sort()) notices.push(await readFile(join(directory, filename), 'utf8'));
  }
  return `${notices.join('\n')}\n`;
}

try {
  await mkdir(output, { recursive: true });
  const built = await buildExtension(extensionDirectory);
  await copyFile(join(root, 'LICENSE'), join(extensionDirectory, 'LICENSE'));
  await writeFile(join(extensionDirectory, 'THIRD-PARTY-NOTICES.txt'), await thirdPartyNotices(built.metafile.inputs));
  for (const relative of ['package.json', 'package-lock.json', ...metadata.files]) await copySource(relative);
  await writeFile(join(sourceDirectory, 'CONNECTOR-INSTALL.md'), `# AnyMark ${VERSION}: optional CLI / MCP connector\n\nThis archive contains reviewed source code, not a standalone binary.\nThe Chrome extension is distributed separately as ${extensionName}.zip.\n\nRequirements: Node.js 22+ and npm; macOS or Linux for the native connector.\nExtract this directory to a permanent location, then run:\n\n\x60\x60\x60bash\nnpm ci --omit=dev\nnode bin/anymark.js install\n# Optional: register the anymark command globally.\nnpm link\n\x60\x60\x60\n\nLoad the extension separately, enable local agent access, and select a profile.\nUse node bin/anymark.js instead of anymark if you skip npm link.\nRe-run install after moving the directory or changing the Node executable.\nThe included READMEs cover profile selection, MCP setup, and building from source.\n\n## 中文安装说明\n\n此包是 CLI／MCP 连接器源码，不是独立可执行程序，也不是 Chrome 扩展。\n请先下载并加载单独的 Chrome 扩展包。连接器需要 Node.js 22+，支持 macOS 与 Linux。\n将本目录放在固定位置，运行上面的安装命令，然后开启扩展的本机 Agent 访问并选择 Profile。\n移动目录或更换 Node 路径后，需要重新运行 install。\n`);
  const artifacts = [];
  for (const [directory, name] of [[extensionDirectory, extensionName], [sourceDirectory, sourceName]]) {
    const filename = `${name}.zip`;
    const staged = join(temporary, filename);
    archive(directory, staged);
    await copyFile(staged, join(output, filename));
    artifacts.push(filename);
  }
  const sums = [];
  for (const filename of artifacts) {
    const bytes = await readFile(join(output, filename));
    sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${filename}`);
    console.log(`${filename}: ${bytes.length.toLocaleString('en-US')} bytes`);
  }
  const checksumName = `anymark-v${VERSION}-SHA256SUMS.txt`;
  await writeFile(join(output, checksumName), `${sums.join('\n')}\n`);
  console.log(`Release assets: ${output}`);
  console.log(`Checksums: ${checksumName}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
