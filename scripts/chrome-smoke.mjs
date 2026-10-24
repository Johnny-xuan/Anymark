import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { installHost } from '../src/install.js';
import { EXTENSION_ID } from '../src/protocol.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp('/tmp/am-');
const home = join(temporary, 'state');
const userDataDir = join(temporary, 'chrome');
const evidence = process.env.ANYMARK_EVIDENCE_DIR || join(tmpdir(), 'anymark-evidence');
const checks = [];
let context;
let page;
let mcp;

async function cli(args, { input, failure = false } = {}) {
  const output = await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [join(root, 'bin/anymark.js'), '--home', home, ...args], {
      env: { ...process.env, ANYMARK_HOME: home, ANYMARK_PROFILE: '' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`CLI timed out: ${args[0]}`)); }, 35000);
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolveResult({ code, stdout, stderr }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
  if (failure) {
    assert.notEqual(output.code, 0, `Unexpected success: ${args.join(' ')}`);
    return JSON.parse(output.stderr.trim());
  }
  assert.equal(output.code, 0, `${args.join(' ')}: ${output.stderr}`);
  return JSON.parse(output.stdout);
}

async function connected() {
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'connected', undefined, { timeout: 15000 });
}

try {
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  await installHost({ home, userDataDir, browser: 'chrome-for-testing' });
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: process.env.ANYMARK_CHROME || chromium.executablePath(),
    headless: true,
    viewport: { width: 380, height: 620 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${join(root, 'dist/extension')}`, `--load-extension=${join(root, 'dist/extension')}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  assert.ok(worker.url().includes(EXTENSION_ID));
  page = await context.newPage();
  await page.goto(`chrome-extension://${EXTENSION_ID}/extension/popup.html`);
  await page.locator('#connection > summary').click();
  await page.locator('#enabled').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#enabled').disabled);
  assert.equal(await page.locator('#enabled').isChecked(), false);
  assert.deepEqual((await cli(['profiles'])).profiles, []);
  checks.push('Access is disabled until explicitly enabled');

  await page.locator('#enabled').check();
  await connected();
  const profileId = await page.locator('#profile').inputValue();
  const profiles = (await cli(['profiles'])).profiles;
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].profileId, profileId);
  assert.equal((await cli(['ls', '/'], { failure: true })).error.code, 'EPROFILE');
  await cli(['use', profileId]);
  checks.push('Native host, explicit profile selection and default binding');

  const roots = (await cli(['ls', '/'])).result.entries;
  const destination = roots.find(entry => entry.type === 'directory' && entry.childrenWritable);
  assert.ok(destination, 'A writable browser-owned directory is required.');
  const folder = (await cli(['mkdir', `${destination.path}/AnyMark smoke`])).result.entry;
  const subfolder = (await cli(['mkdir', `${folder.path}/Research`])).result.entry;
  const saved = (await cli(['write', `${folder.path}/paper`, '--url', 'https://example.com/paper', '--title', 'Paper / draft'])).result.entry;
  assert.equal((await cli(['cat', `id:${saved.id}`])).result.content.url, 'https://example.com/paper');
  const stdin = (await cli(['write', `${folder.path}/stdin`, '-'], { input: JSON.stringify({ title: 'stdin link', url: 'https://example.org/input' }) })).result.entry;
  assert.equal((await cli(['cat', `id:${stdin.id}`])).result.content.title, 'stdin link');
  checks.push('Real Chrome mkdir, bookmark write, JSON stdin and cat');

  const edited = (await cli(['write', `id:${saved.id}`, '--url', 'https://example.com/revised', '--title', 'Revised paper'])).result.entry;
  assert.equal(edited.id, saved.id);
  const moved = (await cli(['mv', `id:${saved.id}`, `id:${subfolder.id}`])).result.entry;
  assert.ok(moved.path.startsWith(`${subfolder.path}/`));
  const copy = (await cli(['cp', `id:${saved.id}`, `${folder.path}/Copy`])).result.entry;
  assert.notEqual(copy.id, saved.id);
  assert.equal((await cli(['cat', `id:${copy.id}`])).result.content.url, 'https://example.com/revised');
  const copiedFolder = (await cli(['cp', `id:${subfolder.id}`, `${folder.path}/Research copy`, '--recursive'])).result.entry;
  const copiedChildren = (await cli(['ls', `id:${copiedFolder.id}`])).result.entries;
  assert.equal(copiedChildren.length, 1);
  assert.notEqual(copiedChildren[0].id, saved.id);
  checks.push('Edit and move preserve identity; copies receive new IDs');

  assert.equal((await cli(['find', `id:${folder.id}`, 'revised'])).result.entries.length, 3);
  assert.equal((await cli(['tree', `id:${folder.id}`, '--depth', '2'])).result.entry.id, folder.id);
  const nonempty = await cli(['rm', `id:${folder.id}`], { failure: true });
  assert.equal(nonempty.error.code, 'ENOTEMPTY');
  const protectedRoot = await cli(['rm', destination.path, '--recursive'], { failure: true });
  assert.ok(['EPERM', 'EACCES', 'EROFS'].includes(protectedRoot.error.code));
  checks.push('Find/tree, nonempty-directory guard and browser-root protection');

  const duplicates = await worker.evaluate(async parentId => {
    const first = await chrome.bookmarks.create({ parentId, title: 'duplicate', url: 'https://example.org/a' });
    const second = await chrome.bookmarks.create({ parentId, title: 'duplicate', url: 'https://example.org/b' });
    return [first.id, second.id];
  }, folder.id);
  const ambiguity = await cli(['cat', `${folder.path}/duplicate`], { failure: true });
  assert.equal(ambiguity.error.code, 'EAMBIGUOUS');
  assert.equal((await cli(['cat', `id:${duplicates[1]}`])).result.content.url, 'https://example.org/b');
  checks.push('Chrome duplicate titles are unambiguous by stable ID');

  mcp = new Client({ name: 'anymark-real-smoke', version: '1.0.0' });
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'bin/anymark.js'), 'mcp', '--home', home, '--profile', profileId] }));
  const tools = await mcp.listTools();
  assert.ok(tools.tools.some(tool => tool.name === 'anymark_write'));
  const createdByMcp = await mcp.callTool({ name: 'anymark_write', arguments: { path: `${folder.path}/MCP`, content: { title: 'MCP created', url: 'https://example.org/mcp' } } });
  assert.notEqual(createdByMcp.isError, true, JSON.stringify(createdByMcp));
  const mcpEntry = createdByMcp.structuredContent.result.entry;
  const chromeTruth = await worker.evaluate(id => chrome.bookmarks.get(id), mcpEntry.id);
  assert.equal(chromeTruth[0].title, 'MCP created');
  assert.equal(chromeTruth[0].url, 'https://example.org/mcp');
  const mcpRead = await mcp.callTool({ name: 'anymark_cat', arguments: { path: `id:${mcpEntry.id}` } });
  assert.equal(mcpRead.structuredContent.result.content.url, chromeTruth[0].url);
  checks.push('A standard MCP client modifies actual Chrome data');
  await mcp.close();
  mcp = null;

  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(evidence, 'panel-light.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: join(evidence, 'panel-dark.png'), fullPage: true });
  checks.push('Connection panel rendered and exercised in light/dark mode');

  await page.locator('#enabled').uncheck();
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'disabled');
  assert.equal((await cli(['stat', `id:${saved.id}`], { failure: true })).error.code, 'EOFFLINE');
  await page.locator('#enabled').check();
  await connected();
  assert.equal(await page.locator('#profile').inputValue(), profileId);
  assert.equal((await cli(['stat', `id:${saved.id}`])).result.entry.id, saved.id);
  checks.push('Revocation disconnects access; reconnect preserves profile and data');

  await cli(['rm', `id:${folder.id}`, '--recursive']);
  const removed = await worker.evaluate(id => chrome.bookmarks.get(id).then(() => false, () => true), folder.id);
  assert.equal(removed, true);
  checks.push('Recursive deletion is reflected in actual Chrome state');
  const browserVersion = context.browser().version();
  await context.close();
  context = null;
  assert.equal((await cli(['ls', '/'], { failure: true })).error.code, 'EOFFLINE');
  checks.push('Closing the isolated browser reports offline without switching profiles');
  console.log(JSON.stringify({ ok: true, browserVersion, profileId, checks, screenshots: [join(evidence, 'panel-light.png'), join(evidence, 'panel-dark.png')] }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) console.error('Panel state:', await page.locator('body').innerText().catch(() => 'unavailable'));
  throw error;
} finally {
  await mcp?.close();
  await context?.close();
  await rm(temporary, { recursive: true, force: true });
}
