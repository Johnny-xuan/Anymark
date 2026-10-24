import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { installHost } from '../src/install.js';
import { request } from '../src/client.js';
import { NOTE_PREFIX } from '../src/metadata.js';
import { EXTENSION_ID } from '../src/protocol.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp('/tmp/am-web-');
const home = join(temporary, 'state');
const userDataDir = join(temporary, 'chrome');
const evidence = process.env.ANYMARK_EVIDENCE_DIR || join(tmpdir(), 'anymark-workspace-evidence');
const webURL = `chrome-extension://${EXTENSION_ID}/web/index.html`;
const checks = [], screenshots = [], layouts = [], errors = [];
const pending = new Map();
let context, controller, browserSession, popupSession, mcp, profileId;
let sequence = 0;
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>Field notes — Inbox workflow</title><h1>A page captured only in the isolated test profile</h1>');
});

async function cli(args) {
  const output = await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [join(root, 'bin/anymark.js'), '--home', home, '--profile', profileId, ...args], {
      env: { ...process.env, ANYMARK_HOME: home, ANYMARK_PROFILE: '' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`CLI timed out: ${args[0]}`)); }, 35000);
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolveResult({ code, stdout, stderr }); });
  });
  assert.equal(output.code, 0, `${args.join(' ')}: ${output.stderr}`);
  return JSON.parse(output.stdout).result;
}
const operation = (name, args = {}) => request(name, args, { home, profileId }).then(response => response.result);
async function tool(name, args) {
  const response = await mcp.callTool({ name: `anymark_${name}`, arguments: args });
  assert.notEqual(response.isError, true, JSON.stringify(response));
  return response.structuredContent.result;
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#bookmark-list')?.getAttribute('aria-busy') === 'false' && !document.querySelector('#add-link').disabled);
}
async function navigate(page, id) {
  await page.goto(`${webURL}#${id === 'inbox' ? 'inbox' : `folder/${encodeURIComponent(id)}`}`);
  await ready(page);
}
async function popupState(state) {
  await controller.waitForFunction(expected => {
    const view = chrome.extension.getViews({ type: 'popup' })[0];
    return view?.document.querySelector('#status')?.dataset.state === expected && !view.document.querySelector('#enabled').disabled;
  }, state, { timeout: 15000 });
}
async function popupClick(selector) {
  await controller.evaluate(selector => chrome.extension.getViews({ type: 'popup' })[0].document.querySelector(selector).click(), selector);
}
async function popupProtocol(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolveResult, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Popup CDP timed out: ${method}`)); }, 10000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolveResult(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    browserSession.send('Target.sendMessageToTarget', { sessionId: popupSession, message: JSON.stringify({ id, method, params }) }).catch(error => {
      pending.delete(id); clearTimeout(timer); reject(error);
    });
  });
}
async function inspectPopup(label) {
  const layout = await controller.evaluate(() => {
    const view = chrome.extension.getViews({ type: 'popup' })[0];
    if (!view) throw new Error('No actual action popup exists.');
    const document = view.document, input = document.querySelector('#profile');
    const style = view.getComputedStyle(input), visible = document.querySelector('#connection').open && input.checkVisibility();
    const measurement = document.createElement('canvas').getContext('2d');
    measurement.font = style.font;
    return {
      width: view.innerWidth, height: view.innerHeight, scrollWidth: document.documentElement.scrollWidth,
      contentHeight: document.body.scrollHeight, profileVisible: visible,
      profileFits: !visible || measurement.measureText(input.value).width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) + 1,
      controlsFit: ['h1', '#open-web', '#page-url', '#note', '#save-inbox', '#profile', '#command'].every(selector => {
        const element = document.querySelector(selector), rect = element.getBoundingClientRect();
        return !element.checkVisibility() || rect.left >= 0 && rect.right <= view.innerWidth + 1;
      }),
      profileId: input.value, state: document.querySelector('#status').dataset.state,
      reconnectHidden: document.querySelector('#reconnect').hidden, helpHidden: document.querySelector('#setup').hidden,
    };
  });
  assert.ok(layout.width >= 380 && layout.width <= 800, `${label}: unreadable width ${layout.width}`);
  assert.ok(layout.height <= 600, `${label}: excessive popup height`);
  assert.ok(layout.scrollWidth <= layout.width + 1, `${label}: horizontal overflow`);
  assert.equal(layout.profileFits, true, `${label}: clipped Profile ID`);
  assert.equal(layout.controlsFit, true, `${label}: clipped controls`);
  layouts.push({ label, ...layout });
  return layout;
}
async function screenshotPopup(name, theme) {
  await popupProtocol('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await popupProtocol('Runtime.evaluate', { expression: 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))', awaitPromise: true });
  const { data } = await popupProtocol('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const path = join(evidence, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  screenshots.push(path);
}
async function screenshotWeb(page, name, theme) {
  await page.emulateMedia({ colorScheme: theme });
  if (await page.locator('#add-link').isVisible()) await page.locator('#add-link').hover();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: horizontal overflow`);
  const pairs = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const channels = color => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const rootBackground = getComputedStyle(document.documentElement).backgroundColor;
    const search = document.querySelector('#search'), primary = document.querySelector('#add-link');
    return [
      ['body', getComputedStyle(document.body).color, rootBackground],
      ['secondary', getComputedStyle(document.querySelector('.list-heading')).color, rootBackground],
      ['placeholder', getComputedStyle(search, '::placeholder').color, getComputedStyle(document.querySelector('.search-field')).backgroundColor],
      ['primary', getComputedStyle(primary).color, getComputedStyle(primary).backgroundColor],
    ].map(([name, foreground, background]) => ({ name, foreground: channels(foreground), background: channels(background) }));
  });
  const luminance = channels => channels.map(value => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = pairs.map(pair => {
    const values = [luminance(pair.foreground), luminance(pair.background)].sort((a, b) => a - b);
    const ratio = (values[1] + 0.05) / (values[0] + 0.05);
    assert.ok(ratio >= 4.5, `${name}: ${pair.name} contrast is ${ratio.toFixed(2)}:1`);
    return { name: pair.name, ratio: Number(ratio.toFixed(2)) };
  });
  layouts.push({ label: name, width: page.viewportSize().width, theme, contrast });
  const path = join(evidence, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
async function choose(page, chain) {
  await page.locator('#chooser-list[aria-busy="false"]').waitFor();
  while (await page.locator('#chooser-location').getAttribute('title') !== '/') {
    await page.locator('#chooser-up').click();
    await page.locator('#chooser-list[aria-busy="false"]').waitFor();
  }
  for (const entry of chain) {
    await page.locator('#chooser-list').getByRole('button', { name: entry.title || entry.name, exact: true }).click();
    await page.locator('#chooser-list[aria-busy="false"]').waitFor();
  }
  await page.locator('#choose-folder').click();
  await page.locator('#chooser-dialog').waitFor({ state: 'hidden' });
}
async function create(page, type, title, { url, note = '', destination } = {}) {
  await page.locator(type === 'file' ? '#add-link' : '#add-folder').click();
  await page.locator('#create-title').fill(title);
  if (type === 'file') await page.locator('#create-url').fill(url);
  await page.locator('#create-note').fill(note);
  if (destination) { await page.locator('#create-destination').click(); await choose(page, destination); }
  await page.locator('#submit-create').click();
  await page.locator('#create-dialog').waitFor({ state: 'hidden' });
  await ready(page);
  await page.waitForFunction(() => !document.querySelector('#detail').hidden && document.querySelector('#entry-id').textContent !== '');
  return (await operation('stat', { path: `id:${await page.locator('#entry-id').textContent()}` })).entry;
}

try {
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const installed = await installHost({ home, userDataDir, browser: 'chrome-for-testing' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const captureURL = `http://127.0.0.1:${server.address().port}/field-notes`;
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: process.env.ANYMARK_CHROME || chromium.executablePath(), headless: true,
    viewport: { width: 1440, height: 960 }, ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${join(root, 'dist/extension')}`, `--load-extension=${join(root, 'dist/extension')}`],
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  assert.ok(worker.url().includes(EXTENSION_ID));
  controller = await context.newPage();
  await controller.goto(`chrome-extension://${EXTENSION_ID}/extension/popup.html`);
  const before = await worker.evaluate(() => chrome.bookmarks.getTree());
  const empty = await context.newPage();
  await empty.goto(webURL); await ready(empty);
  assert.equal(await empty.locator('#scope-title').textContent(), 'Inbox');
  assert.deepEqual(await worker.evaluate(() => chrome.bookmarks.getTree()), before);
  await screenshotWeb(empty, 'workspace-empty-light', 'light');
  await empty.close();
  checks.push('Opening Inbox workspace is read-only and needs no Agent authorization');

  const fixture = await context.newPage();
  await fixture.goto(captureURL); await fixture.bringToFront();
  browserSession = await context.browser().newBrowserCDPSession();
  browserSession.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== popupSession) return;
    const message = JSON.parse(event.message), item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
  });
  const { targetInfos: tabTargets } = await browserSession.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tabTarget = tabTargets.find(item => item.url === captureURL);
  assert.ok(tabTarget, `No tab target for the fixture: ${JSON.stringify(tabTargets)}`);
  await browserSession.send('Extensions.triggerAction', { id: EXTENSION_ID, targetId: tabTarget.targetId });
  await popupState('disabled');
  const controllerSession = await context.newCDPSession(controller);
  const { targetInfo: controllerTarget } = await controllerSession.send('Target.getTargetInfo');
  await controllerSession.detach();
  const { targetInfos } = await browserSession.send('Target.getTargets');
  const popupTarget = targetInfos.find(item => item.targetId !== controllerTarget.targetId && item.url.endsWith('/extension/popup.html'));
  assert.ok(popupTarget, 'Action activation must create a separate actual popup renderer.');
  ({ sessionId: popupSession } = await browserSession.send('Target.attachToTarget', { targetId: popupTarget.targetId, flatten: false }));
  await popupProtocol('Page.enable');
  await controller.waitForFunction(() => !chrome.extension.getViews({ type: 'popup' })[0].document.querySelector('#save-inbox').disabled);
  const initial = await inspectPopup('capture-ready-agent-disabled');
  profileId = initial.profileId;
  assert.deepEqual(await worker.evaluate(() => chrome.bookmarks.getTree()), before);
  assert.equal(await controller.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.querySelector('#page-url').value), captureURL);
  await screenshotPopup('popup-capture-light', 'light');
  await screenshotPopup('popup-capture-dark', 'dark');

  const captureNote = 'Review this workflow; <em>this is plain note text</em>.';
  await controller.evaluate(value => {
    const view = chrome.extension.getViews({ type: 'popup' })[0], input = view.document.querySelector('#note');
    input.value = value; input.dispatchEvent(new view.Event('input', { bubbles: true }));
    view.document.querySelector('#save-inbox').click();
  }, captureNote);
  await controller.waitForFunction(() => {
    const doc = chrome.extension.getViews({ type: 'popup' })[0].document;
    return doc.querySelector('#save-inbox').disabled && !doc.querySelector('#note').disabled;
  });
  const inboxRead = await controller.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'anymark.operation', operation: 'inbox', args: {} })).result);
  const captured = inboxRead.entries[0], inbox = inboxRead.entry;
  assert.equal(captured.url, captureURL); assert.equal(captured.note, captureNote);
  assert.equal(inboxRead.entries.length, 1);
  checks.push('Actual action grants activeTab and captures current page with a local note while Agent access is disabled');

  await popupClick('#connection > summary'); await popupClick('#enabled'); await popupState('connected');
  const connected = await inspectPopup('connected-details-open');
  assert.equal(connected.profileVisible, true);
  assert.equal((await operation('cat', { path: `id:${captured.id}` })).content.note, captureNote);
  await screenshotPopup('popup-connected-dark', 'dark');
  await controller.evaluate(() => { const input = chrome.extension.getViews({ type: 'popup' })[0].document.querySelector('#profile'); input.focus(); input.select(); });
  await controller.waitForTimeout(1200);
  assert.deepEqual(await controller.evaluate(() => { const input = chrome.extension.getViews({ type: 'popup' })[0].document.querySelector('#profile'); return [input.selectionStart, input.selectionEnd, input.value]; }), [0, profileId.length, profileId]);
  await popupClick('#enabled'); await popupState('disabled');
  await rename(installed.hostPath, `${installed.hostPath}.disabled`);
  try {
    await popupClick('#enabled'); await popupState('disconnected');
    const offline = await inspectPopup('disconnected-details-open');
    assert.equal(offline.reconnectHidden, false); assert.equal(offline.helpHidden, false);
    await screenshotPopup('popup-offline-light', 'light');
  } finally { await rename(`${installed.hostPath}.disabled`, installed.hostPath); }
  await popupClick('#reconnect'); await popupState('connected');
  assert.equal((await inspectPopup('reconnected')).profileId, profileId);
  checks.push('Native popup is readable, keeps Profile ID selection, and recovers from missing host without changing identity');

  const opened = context.waitForEvent('page');
  await popupClick('#open-web');
  const page = await opened; await page.waitForURL(`${webURL}#inbox`); await ready(page);
  const cliOpened = context.waitForEvent('page');
  assert.equal((await cli(['web'])).url, webURL);
  const cliPage = await cliOpened; await cliPage.waitForURL(`${webURL}#inbox`); await ready(cliPage); await cliPage.close();
  assert.equal(await page.getByRole('button', { name: `查看链接详情：${captured.title}`, exact: true }).count(), 1);
  await page.getByRole('button', { name: `查看链接详情：${captured.title}`, exact: true }).click();
  assert.equal(await page.locator('#edit-note').inputValue(), captureNote);
  assert.equal(await page.locator('.row-note em').count(), 0);
  checks.push('Popup Web icon and anymark web open the same live extension workspace; note HTML is inert');

  const duplicate = await cli(['capture', captureURL]);
  assert.equal(duplicate.created, false); assert.equal(duplicate.entry.id, captured.id); assert.equal(duplicate.entry.note, captureNote);
  const roots = await operation('ls', { path: '/' }), destination = roots.entries.find(entry => entry.childrenWritable);
  assert.ok(destination);
  const research = await create(page, 'directory', 'Research', { note: 'Sources about browsers, agents, and local-first tools.', destination: [destination] });
  assert.equal((await cli(['stat', `id:${research.id}`])).entry.note, research.note);
  await page.getByRole('button', { name: '进入文件夹：Research', exact: true }).click(); await ready(page);
  const api = await create(page, 'file', 'Browser APIs', { url: 'https://developer.chrome.com/docs/extensions/reference/api/bookmarks', note: 'Bookmark ownership, folder IDs, and mutation rules.' });
  await page.locator('#add-link').click();
  await page.locator('#create-title').fill('Browser APIs'); await page.locator('#create-url').fill('https://wrong.example/overwrite');
  await page.locator('#submit-create').click(); await page.locator('#create-error').waitFor({ state: 'visible' });
  assert.equal((await cli(['cat', `id:${api.id}`])).content.url, api.url);
  await page.locator('#create-title').fill('Storage model'); await page.locator('#create-url').fill('https://developer.chrome.com/docs/extensions/reference/api/storage');
  await page.locator('#create-note').fill('Notes stay in chrome.storage.local for this profile.');
  await page.locator('#submit-create').click(); await page.locator('#create-dialog').waitFor({ state: 'hidden' }); await ready(page);
  const later = await create(page, 'directory', 'Later', { note: 'A short review queue.' });
  checks.push('Web creates folders and annotated bookmarks; duplicate-title creation fails without overwriting and can be corrected');

  await navigate(page, inbox.id);
  await page.getByRole('button', { name: `查看链接详情：${captured.title}`, exact: true }).click();
  const revisedNote = 'Useful capture workflow. Keep this context when moving or copying.';
  await page.locator('#edit-note').fill(revisedNote); await page.locator('#save-detail').click(); await ready(page);
  mcp = new Client({ name: 'anymark-workspace-smoke', version: '1.0.0' });
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'bin/anymark.js'), 'mcp', '--home', home, '--profile', profileId] }));
  assert.equal((await tool('cat', { path: `id:${captured.id}` })).content.note, revisedNote);
  await tool('edit', { path: `id:${later.id}`, changes: { note: 'Agent triage queue' } });
  assert.equal((await cli(['stat', `id:${later.id}`])).entry.note, 'Agent triage queue');
  await page.locator('#copy-entry').click(); await choose(page, [destination, research]); await ready(page);
  const copied = (await cli(['ls', `id:${research.id}`])).entries.find(entry => entry.title === captured.title);
  assert.notEqual(copied.id, captured.id); assert.equal(copied.note, revisedNote);
  await page.getByRole('button', { name: `查看链接详情：${captured.title}`, exact: true }).click();
  await page.locator('#move-entry').click(); await choose(page, [destination, research, later]); await ready(page);
  assert.equal((await cli(['stat', `id:${captured.id}`])).entry.parentId, later.id);
  await tool('edit', { path: `id:${captured.id}`, changes: { note: 'Changed after moving' } });
  assert.equal((await tool('cat', { path: `id:${copied.id}` })).content.note, revisedNote);
  checks.push('Standard MCP reads/edits file and folder notes; Web moves retain IDs and copies clone notes independently');

  await navigate(page, research.id);
  await page.getByRole('button', { name: `查看链接详情：${captured.title}`, exact: true }).click();
  await page.locator('#delete-entry').click(); await page.locator('#confirm-cancel').click();
  assert.equal((await cli(['stat', `id:${copied.id}`])).entry.id, copied.id);
  await page.locator('#delete-entry').click(); await page.locator('#confirm-accept').click(); await page.locator('#confirm-dialog').waitFor({ state: 'hidden' }); await ready(page);
  assert.deepEqual(await worker.evaluate(key => chrome.storage.local.get(key), NOTE_PREFIX + copied.id), {});
  await page.getByRole('button', { name: '查看文件夹详情：Later', exact: true }).click();
  await page.locator('#delete-entry').click(); await page.locator('#confirm-accept').click(); await page.locator('#confirm-dialog').waitFor({ state: 'hidden' }); await ready(page);
  assert.deepEqual(await worker.evaluate(ids => chrome.storage.local.get(ids), [NOTE_PREFIX + later.id, NOTE_PREFIX + captured.id]), {});
  const external = (await tool('write', { path: `${research.path}/External removal`, content: { url: 'https://example.org/external', note: 'Remove with Chrome' }, exclusive: true })).entry;
  await worker.evaluate(id => chrome.bookmarks.remove(id), external.id);
  await controller.waitForFunction(async key => !Object.hasOwn(await chrome.storage.local.get(key), key), NOTE_PREFIX + external.id);
  checks.push('Permanent deletion requires confirmation and cleans subtree notes; outside Chrome deletion also cleans metadata');

  for (const [title, url, note] of [
    ['Local-first software', 'https://www.inkandswitch.com/local-first/', 'Ownership and offline availability.'],
    ['Model Context Protocol', 'https://modelcontextprotocol.io/', 'A standard interface for tools, not an embedded Agent.'],
    ['URL semantics', 'https://url.spec.whatwg.org/', 'Normalize URLs without removing meaningful query parameters.'],
  ]) await cli(['write', `${research.path}/${encodeURIComponent(title)}`, '--url', url, '--note', note, '--exclusive']);
  await page.locator('#refresh').click(); await ready(page);
  await page.locator('#scope-title').focus();
  await page.keyboard.press('/');
  assert.equal(await page.locator('#search').evaluate(element => element === document.activeElement), true);
  await page.locator('#search').fill('offline'); await page.locator('#search').press('Enter'); await ready(page);
  assert.equal(await page.locator('.bookmark-row').count(), 1);
  assert.equal(await page.locator('.row-title').textContent(), 'Local-first software');
  await page.locator('#search').fill(''); await page.locator('#search').press('Enter'); await ready(page);
  await page.getByRole('button', { name: '查看链接详情：Browser APIs', exact: true }).click();
  await page.locator('#edit-note').fill('Unsaved context must not disappear silently.');
  await page.locator('#close-detail').click();
  assert.equal(await page.locator('#inspector').isVisible(), false);
  assert.equal(await page.locator('#confirm-dialog').isVisible(), false, 'Folding must preserve the draft instead of asking to discard it');
  assert.equal(await page.locator('#toggle-inspector').getAttribute('aria-expanded'), 'false');
  await page.getByRole('button', { name: '查看链接详情：Browser APIs', exact: true }).click();
  assert.equal(await page.locator('#edit-note').inputValue(), 'Unsaved context must not disappear silently.');
  await page.locator('#toggle-inspector').click(); await page.locator('#toggle-inspector').click();
  assert.equal(await page.locator('#edit-note').inputValue(), 'Unsaved context must not disappear silently.');
  await page.getByRole('button', { name: '查看链接详情：Local-first software', exact: true }).click();
  await page.locator('#confirm-cancel').click();
  assert.equal(await page.locator('#edit-note').inputValue(), 'Unsaved context must not disappear silently.');
  await page.getByRole('button', { name: '查看链接详情：Local-first software', exact: true }).click();
  await page.locator('#confirm-accept').click();
  await page.getByRole('button', { name: '查看链接详情：Browser APIs', exact: true }).click();
  assert.equal(await page.locator('#edit-note').inputValue(), api.note);
  const beforeDialog = await worker.evaluate(() => chrome.bookmarks.getTree());
  await page.locator('#add-link').click(); await page.keyboard.press('Escape');
  await page.locator('#create-dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(await worker.evaluate(() => chrome.bookmarks.getTree()), beforeDialog);
  assert.equal(await page.locator('#add-link').evaluate(element => element === document.activeElement), true);
  checks.push('Folding and reopening preserve the unsaved draft; switching entries still requires explicit discard/cancel; keyboard search and dialog focus work');
  await screenshotWeb(page, 'workspace-desktop-light', 'light');
  await screenshotWeb(page, 'workspace-desktop-dark', 'dark');
  await page.setViewportSize({ width: 1024, height: 800 });
  await screenshotWeb(page, 'workspace-medium-dark', 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#sidebar').isVisible(), false, 'Closed navigation must not cover detail when changing viewport.');
  assert.equal(await page.evaluate(() => !!document.elementFromPoint(20, 180)?.closest('#inspector')), true, 'Mobile detail must remain unobstructed.');
  await screenshotWeb(page, 'workspace-mobile-detail-dark', 'dark');
  await page.locator('#close-detail').click();
  await screenshotWeb(page, 'workspace-mobile-list-light', 'light');
  await page.locator('#open-nav').click();
  assert.equal(await page.locator('#open-nav').getAttribute('aria-expanded'), 'true');
  await page.locator('#close-nav').click();
  assert.equal(await page.locator('#open-nav').getAttribute('aria-expanded'), 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '查看链接详情：Browser APIs', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#detail').hidden);
  assert.equal(await page.evaluate(() => document.querySelector('#detail').getAnimations().some(animation => animation.playState === 'running')), false);
  await page.locator('#close-detail').click(); await page.locator('#open-nav').click();
  assert.equal(await page.evaluate(() => document.querySelector('#sidebar').getAnimations().some(animation => animation.playState === 'running')), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#open-nav').getAttribute('aria-expanded'), 'false');
  checks.push('Reduced-motion stops detail and navigation animation; Escape closes narrow navigation');
  checks.push('Note search and real workspace render at 1440px/390px in light/dark, including mobile detail and navigation');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, browserVersion: context.browser().version(), realActionPopup: true, isolatedProfileOnly: true, checks, layouts, screenshots }, null, 2));
} finally {
  await mcp?.close();
  for (const item of pending.values()) item.reject(new Error('Workspace smoke closed.'));
  if (popupSession) await browserSession?.send('Target.detachFromTarget', { sessionId: popupSession }).catch(() => {});
  await context?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
