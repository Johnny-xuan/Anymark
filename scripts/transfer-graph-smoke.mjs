import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { installHost } from '../src/install.js';
import { request } from '../src/client.js';
import { EXTENSION_ID } from '../src/protocol.js';
import { parseBookmarkHTML, serializeBookmarkHTML } from '../src/transfer.js';
import { NOTE_PREFIX, INBOX_KEY } from '../src/metadata.js';
import { exerciseGraph } from './graph-smoke-scenarios.mjs';
import { ensurePrivateDirectory } from '../src/paths.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp('/tmp/am-transfer-');
const home = join(temporary, 'state');
const evidence = process.env.ANYMARK_EVIDENCE_DIR ? resolve(process.env.ANYMARK_EVIDENCE_DIR) : await mkdtemp(join(tmpdir(), 'anymark-transfer-evidence-'));
const webURL = `chrome-extension://${EXTENSION_ID}/web/index.html`;
const checks = [], screenshots = [], errors = [], profiles = [];
let mcp;

async function launch(name) {
  const userDataDir = join(temporary, name);
  await installHost({ home, userDataDir, browser: 'chrome-for-testing' });
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: process.env.ANYMARK_CHROME || chromium.executablePath(), headless: true,
    viewport: { width: 1440, height: 960 }, ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${join(root, 'dist/extension')}`, `--load-extension=${join(root, 'dist/extension')}`],
  });
  const profile = { context, name };
  profiles.push(profile);
  context.on('page', page => page.on('pageerror', error => errors.push(`${name}: ${error.message}`)));
  profile.worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  profile.controller = await context.newPage();
  await profile.controller.goto(`chrome-extension://${EXTENSION_ID}/extension/popup.html`);
  await profile.controller.locator('#connection > summary').click();
  await profile.controller.locator('#enabled').check();
  await profile.controller.locator('#status[data-state="connected"]').waitFor({ timeout: 15000 });
  profile.id = await profile.controller.locator('#profile').inputValue();
  assert.ok(profile.id);
  profile.operation = (operation, args = {}) => request(operation, args, { home, profileId: profile.id }).then(response => response.result);
  const roots = await profile.operation('ls', { path: '/' });
  profile.bar = roots.entries.find(entry => entry.childrenWritable);
  assert.ok(profile.bar, 'An isolated Chrome root must accept children');
  return profile;
}
async function cli(profile, args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [join(root, 'bin/anymark.js'), '--home', home, '--profile', profile.id, ...args], {
      env: { ...process.env, ANYMARK_HOME: home, ANYMARK_PROFILE: '' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`CLI timed out: ${args[0]}`)); }, 35000);
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolveResult({ code, stdout, stderr }); });
  });
}
async function nativeState(profile) {
  return profile.worker.evaluate(async () => ({ tree: await chrome.bookmarks.getTree(), storage: await chrome.storage.local.get(null) }));
}
function transferNodes(state) {
  const convert = node => ({ title: node.title, ...(node.url === undefined ? { children: (node.children || []).map(convert) } : { url: node.url }),
    ...(state.storage[NOTE_PREFIX + node.id] ? { note: JSON.parse(state.storage[NOTE_PREFIX + node.id]) } : {}),
    ...(node.id === state.storage[INBOX_KEY] ? { inbox: true } : {}) });
  return state.tree[0].children.map(convert);
}
function descendants(node) { return [node, ...(node.children || []).flatMap(descendants)]; }
async function ready(page) { await page.waitForFunction(() => !document.querySelector('#add-link').disabled); }
async function screenshotWeb(page, name, theme = 'light') {
  await page.emulateMedia({ colorScheme: theme });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: horizontal overflow`);
  const path = join(evidence, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
async function chooseDestination(page, bar) {
  await page.locator('#transfer-destination').click();
  await page.locator('#chooser-list[aria-busy="false"]').waitFor();
  while (await page.locator('#chooser-location').getAttribute('title') !== '/') {
    await page.locator('#chooser-up').click();
    await page.locator('#chooser-list[aria-busy="false"]').waitFor();
  }
  await page.locator('#chooser-list').getByRole('button', { name: bar.title, exact: true }).click();
  await page.locator('#chooser-list[aria-busy="false"]').waitFor();
  await page.locator('#choose-folder').click();
  await page.locator('#chooser-dialog').waitFor({ state: 'hidden' });
}

try {
  await ensurePrivateDirectory(evidence);
  let source = await launch('source');
  const originalProfileId = source.id;
  const legacy = await source.worker.evaluate(async parentId => {
    const node = await chrome.bookmarks.create({ parentId, title: 'Legacy metadata', url: 'https://legacy.example/' });
    await chrome.storage.local.set({ [`anymark.note.v1:${node.id}`]: '\"Old quoted note\"\\n雪' });
    return node;
  }, source.bar.id);
  await source.context.close();
  profiles.pop();
  source = await launch('source');
  assert.equal(source.id, originalProfileId);
  assert.equal((await source.operation('stat', { path: `id:${legacy.id}` })).entry.note, '\"Old quoted note\"\\n雪');
  assert.equal(Object.keys((await nativeState(source)).storage).some(key => key.startsWith('anymark.note.v1:')), false);
  checks.push('Real extension restart migrates existing v1 notes losslessly into the UTF-16-safe store without changing Chrome identities');
  const arbitrary = '任意备注\u0000\ud800\r\n<script>inert note</script> & "';
  const fixtureHTML = serializeBookmarkHTML({ rootNote: 'Import container note', nodes: [
    { title: '科研入口', note: 'Folder graph-needle context', children: [
      { title: 'Same title', url: 'https://same.example/?a=1&b=2', note: 'First independent note' },
      { title: 'Same title', url: 'https://same.example/?a=1&b=2', note: arbitrary },
      { title: '', children: [] },
      { title: '', url: 'mailto:hello@example.org' },
    ] },
    { title: 'AnyMark Inbox', inbox: true, note: 'Inbox notebook', children: [
      { title: 'Inbox item', url: 'https://inbox.example/', note: 'Capture later' },
    ] },
  ] });
  const seeded = await source.operation('import', { html: fixtureHTML, to: `id:${source.bar.id}`, title: '迁移源' });
  assert.equal(seeded.inbox.restored, true);
  const sourceTree = await source.operation('tree', { path: `id:${seeded.entry.id}`, depth: 12 });
  const sameFolder = sourceTree.children.find(node => node.title === '科研入口');
  const duplicateA = sameFolder.children[0], duplicateB = sameFolder.children[1];
  assert.equal(duplicateB.note, arbitrary, 'Real Chrome metadata must preserve arbitrary imported note strings');
  assert.notEqual(duplicateA.id, duplicateB.id);
  await source.operation('edit', { path: '/', changes: { note: 'Profile notebook · root context' } });
  await source.operation('edit', { path: `id:${source.bar.id}`, changes: { note: 'Browser root note' } });
  const beforeExport = await nativeState(source);
  const exported = await source.operation('export');
  assert.deepEqual(parseBookmarkHTML(exported.html).nodes, transferNodes(beforeExport));
  assert.equal(parseBookmarkHTML(exported.html).rootNote, 'Profile notebook · root context');
  assert.deepEqual(await nativeState(source), beforeExport, 'Export must not create Inbox or write metadata/bookmarks');
  checks.push('Real Chrome export includes complete hierarchy, independent duplicate notes, empty items, non-HTTP URLs, root/folder notes and Inbox without mutation');

  const backup = join(evidence, 'AnyMark-roundtrip.html');
  await rm(backup, { force: true });
  const exportedCLI = await cli(source, ['export', backup]);
  assert.equal(exportedCLI.code, 0, exportedCLI.stderr);
  assert.deepEqual(JSON.parse(exportedCLI.stdout).result.summary, exported.summary);
  assert.equal((await stat(backup)).mode & 0o777, 0o600);
  assert.equal(await readFile(backup, 'utf8'), exported.html);
  const collision = await cli(source, ['export', backup]);
  assert.notEqual(collision.code, 0);
  assert.equal(JSON.parse(collision.stderr).error.code, 'EEXIST');
  assert.equal(await readFile(backup, 'utf8'), exported.html);
  const inspected = await cli(source, ['import', backup, '--dry-run']);
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.deepEqual(JSON.parse(inspected.stdout).result.summary, exported.summary);
  const stdoutExport = await cli(source, ['export', '-']);
  assert.equal(stdoutExport.code, 0, stdoutExport.stderr);
  assert.equal(stdoutExport.stdout, exported.html);
  assert.deepEqual(await nativeState(source), beforeExport);
  checks.push('CLI exports a private real HTML file/stdout, refuses overwriting OS files, and previews imports without Chrome mutations');

  const destination = await launch('destination');
  assert.notEqual(source.id, destination.id);
  const existing = (await destination.operation('write', { path: `${destination.bar.path}/Existing`, content: { url: duplicateA.url, note: 'Destination-only existing note' }, exclusive: true })).entry;
  const importedCLI = await cli(destination, ['import', backup, '--to', `id:${destination.bar.id}`, '--title', '跨 Profile 迁移']);
  assert.equal(importedCLI.code, 0, importedCLI.stderr);
  const imported = JSON.parse(importedCLI.stdout).result;
  assert.equal(imported.inbox.restored, true);
  const importedTree = await destination.operation('tree', { path: `id:${imported.entry.id}`, depth: 12 });
  assert.equal(importedTree.entry.note, 'Profile notebook · root context');
  const expectedRoots = parseBookmarkHTML(exported.html).nodes;
  const normalize = node => ({ title: node.title, ...(node.type === 'directory' ? { children: (node.children || []).map(normalize) } : { url: node.url }), ...(node.note ? { note: node.note } : {}), ...(node.id === imported.inbox.importedId ? { inbox: true } : {}) });
  assert.deepEqual(importedTree.children.map(normalize), expectedRoots);
  assert.equal((await destination.operation('cat', { path: `id:${existing.id}` })).content.note, 'Destination-only existing note');
  const importedDuplicates = importedTree.children.flatMap(descendants).filter(node => node.title === 'Same title');
  assert.equal(importedDuplicates.length, 2);
  assert.notEqual(importedDuplicates[0].id, importedDuplicates[1].id);
  await destination.operation('edit', { path: `id:${importedDuplicates[0].id}`, changes: { note: 'Edited destination note only' } });
  assert.equal((await source.operation('cat', { path: `id:${duplicateA.id}` })).content.note, 'First independent note');
  assert.equal((await destination.operation('cat', { path: `id:${importedDuplicates[1].id}` })).content.note, arbitrary);
  const second = await destination.operation('import', { html: fixtureHTML, to: `id:${destination.bar.id}`, title: 'Second independent container' });
  assert.equal(second.inbox.restored, false);
  assert.equal(second.inbox.activeId, imported.inbox.activeId);
  assert.notEqual(second.inbox.importedId, imported.inbox.activeId);
  checks.push('Two actual isolated profiles round-trip structural notes into new IDs; duplicate URLs stay independent, existing entries survive, and an existing Inbox association wins');

  const malformed = '<META NAME="anymark-export-version" CONTENT="1"><DL><A HREF="https://good.example/">Good</A><A HREF="https://lost.example/" DATA-ANYMARK-NOTE="!';
  const beforeMalformed = await nativeState(destination);
  await assert.rejects(destination.operation('import', { html: malformed, to: `id:${destination.bar.id}` }), error => error.code === 'EINVAL');
  assert.deepEqual(await nativeState(destination), beforeMalformed);
  const page = await destination.context.newPage();
  await page.goto(webURL + '#all'); await ready(page);
  await page.locator('#open-transfer').click();
  await page.locator('#transfer-file').setInputFiles({ name: 'broken.html', mimeType: 'text/html', buffer: Buffer.from(malformed) });
  await page.locator('#transfer-import-error:not([hidden])').waitFor();
  assert.equal(await page.locator('#transfer-submit').isDisabled(), true);
  assert.deepEqual(await nativeState(destination), beforeMalformed);
  await screenshotWeb(page, 'transfer-invalid-light');
  await page.locator('#transfer-close').click();
  checks.push('Truncated HTML fails Native preflight and Web preview with zero bookmark or metadata mutation');

  const plainHTML = '<!DOCTYPE NETSCAPE-Bookmark-file-1><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8"><TITLE>Bookmarks</TITLE><H1>Bookmarks</H1><DL><p><DT><H3>Chrome-style 雪 &amp; Work</H3><DL><p><DT><A HREF="https://plain.example/?a=1&amp;b=2">Plain link</A></DL><p></DL><p>';
  await page.locator('#open-transfer').click();
  await page.locator('#transfer-file').setInputFiles({ name: 'Chrome-style.html', mimeType: 'text/html', buffer: Buffer.from(plainHTML) });
  await page.waitForFunction(() => document.querySelector('#transfer-preview').textContent.includes('尚未导入'));
  const beforePreview = await nativeState(destination);
  await chooseDestination(page, destination.bar);
  assert.deepEqual(await nativeState(destination), beforePreview);
  await page.locator('#transfer-title').fill('Web Chrome-format import');
  await screenshotWeb(page, 'transfer-preview-light');
  await page.locator('#transfer-submit').click();
  await page.locator('#transfer-dialog').waitFor({ state: 'hidden' }); await ready(page);
  assert.equal(await page.locator('#scope-title').textContent(), 'Web Chrome-format import');
  checks.push('Web previews Chrome-format Unicode/entities, chooses an existing destination without writes, then explicitly creates and opens a new import container');

  const largeNote = 'Large portable note · '.repeat(70000);
  const largeHTML = serializeBookmarkHTML({ nodes: [{ title: 'Large Web-only import', url: 'https://large.example/', note: largeNote }] });
  const largeFile = join(temporary, 'large.html');
  await writeFile(largeFile, largeHTML);
  const beforeLarge = await nativeState(destination);
  const nativeLarge = await cli(destination, ['import', largeFile, '--to', `id:${destination.bar.id}`]);
  assert.notEqual(nativeLarge.code, 0);
  assert.equal(JSON.parse(nativeLarge.stderr).error.code, 'EMSGSIZE');
  assert.deepEqual(await nativeState(destination), beforeLarge);
  await page.locator('#open-transfer').click();
  await page.locator('#transfer-file').setInputFiles(largeFile);
  await page.waitForFunction(() => document.querySelector('#transfer-preview').textContent.includes('尚未导入'));
  await page.locator('#transfer-title').fill('Large file via Web');
  await page.locator('#transfer-submit').click();
  await page.locator('#transfer-dialog').waitFor({ state: 'hidden' }); await ready(page);
  const importedLarge = (await destination.operation('find', { path: '/', query: 'Large Web-only import' })).entries.find(node => node.title === 'Large Web-only import');
  assert.equal(importedLarge.note, largeNote);
  checks.push('Native CLI rejects >1 MiB imports without mutation while Web imports the same real file with its entire note intact');

  await page.locator('#open-transfer').click();
  await page.locator('#transfer-export-tab').click();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#transfer-export').click();
  const download = await downloadEvent;
  const downloaded = join(evidence, 'Web-download.html');
  await download.saveAs(downloaded);
  assert.equal(await download.failure(), null);
  assert.deepEqual(parseBookmarkHTML(await readFile(downloaded, 'utf8')).summary, (await destination.operation('export')).summary);
  await screenshotWeb(page, 'transfer-export-dark', 'dark');
  await page.locator('#transfer-close').click();
  checks.push('Web export produces an actual browser-downloaded, parseable HTML backup without downloads permission');

  mcp = new Client({ name: 'anymark-transfer-smoke', version: '1.0.0' });
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'bin/anymark.js'), '--home', home, '--profile', source.id, 'mcp'], stderr: 'pipe' }));
  const tools = await mcp.listTools();
  assert.equal(tools.tools.find(tool => tool.name === 'anymark_import').annotations.destructiveHint, false);
  const mcpExport = await mcp.callTool({ name: 'anymark_export', arguments: { path: `id:${seeded.entry.id}` } });
  assert.notEqual(mcpExport.isError, true);
  const mcpImported = await mcp.callTool({ name: 'anymark_import', arguments: { html: mcpExport.structuredContent.result.html, to: `id:${source.bar.id}`, title: 'MCP transfer' } });
  assert.notEqual(mcpImported.isError, true);
  const mcpTree = await source.operation('tree', { path: `id:${mcpImported.structuredContent.result.entry.id}`, depth: 12 });
  assert.equal(mcpTree.entry.note, '');
  assert.equal(mcpTree.children[0].note, 'Import container note');
  assert.notEqual(mcpTree.children[0].id, seeded.entry.id);
  checks.push('Real MCP exposes additive import annotations and round-trips selected-folder HTML and folder notes through the Native bridge');

  const graphFolder = (await destination.operation('mkdir', { path: `${destination.bar.path}/Graph navigation`, note: 'graph-needle folder note' })).entry;
  const graphBookmark = (await destination.operation('write', { path: `${graphFolder.path}/Graph bookmark`, content: { url: 'https://graph.example/real-node', note: 'graph-needle bookmark note' }, exclusive: true })).entry;
  let deep = graphFolder;
  for (let index = 0; index < 15; index++) deep = (await destination.operation('mkdir', { path: `${deep.path}/Depth-${index}` })).entry;
  await destination.operation('write', { path: `${deep.path}/Deep leaf`, content: { url: 'https://deep.example/', note: 'Beyond tree depth 12' }, exclusive: true });
  const graphChunk = (await readdir(join(root, 'dist/extension/chunks'))).find(name => /^graph-.*\.js$/.test(name));
  assert.ok(graphChunk, 'Build must emit a locally bundled graph ESM chunk');
  await exerciseGraph({ page, webURL, graphModuleURL: `chrome-extension://${EXTENSION_ID}/chunks/${graphChunk}`, fixture: { folder: graphFolder, bookmark: graphBookmark }, checks, screenshotWeb });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, isolatedProfilesOnly: true, browserVersion: source.context.browser().version(), profiles: profiles.length, checks, screenshots }, null, 2));
} finally {
  await mcp?.close();
  for (const profile of profiles.reverse()) await profile.context.close();
  await rm(temporary, { recursive: true, force: true });
}
