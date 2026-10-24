import { BookmarkFilesystem } from '../src/filesystem.js';
import { MetadataStore } from '../src/metadata.js';
import { HOST_NAME, PROTOCOL_VERSION, MAX_RESPONSE_BYTES, OPERATIONS, errorPayload, BridgeError, validateOperation } from '../src/protocol.js';

const metadata = new MetadataStore(chrome.storage.local);
const metadataReady = metadata.migrate();
const filesystem = new BookmarkFilesystem(chrome.bookmarks, metadata);
let port = null;
let opening = null;
let connectionGeneration = 0;
let settingsPromise;
let state = { state: 'disabled', error: null };
let queue = metadataReady.catch(() => {});

async function settings() {
  if (!settingsPromise) {
    settingsPromise = (async () => {
      const stored = await chrome.storage.local.get(['profileId', 'enabled']);
      if (!stored.profileId) {
        stored.profileId = crypto.randomUUID();
        await chrome.storage.local.set({ profileId: stored.profileId });
      }
      return { profileId: stored.profileId, enabled: stored.enabled === true };
    })();
  }
  return settingsPromise;
}

async function setState(next) {
  state = next;
  await chrome.action.setBadgeText({ text: next.state === 'connected' ? 'ON' : next.state === 'connecting' ? '…' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#245B3D' });
}

async function status() {
  return { ...(await settings()), ...state };
}

function enqueue(operation, args, authorize) {
  const execute = async () => {
    if (authorize) await authorize();
    validateOperation(operation, args);
    if (operation === 'web') {
      const url = chrome.runtime.getURL('web/index.html');
      const tab = await chrome.tabs.create({ url });
      return { url, tabId: tab.id };
    }
    await metadataReady;
    return filesystem.execute(operation, args);
  };
  const result = queue.then(execute, execute);
  queue = result.catch(() => {});
  return result;
}

async function connect() {
  if (port || opening) return opening;
  const generation = connectionGeneration;
  opening = (async () => {
    const config = await settings();
    if (!config.enabled || generation !== connectionGeneration) return;
    await setState({ state: 'connecting', error: null });
    if (!(await settings()).enabled || generation !== connectionGeneration) return;
    try {
      const current = chrome.runtime.connectNative(HOST_NAME);
      port = current;
      current.onDisconnect.addListener(() => {
        const message = chrome.runtime.lastError?.message;
        if (port !== current) return;
        port = null;
        void setState({ state: 'disconnected', error: message || '本地连接已断开。请检查安装后重新连接。' });
      });
      current.onMessage.addListener(message => {
        if (port !== current || generation !== connectionGeneration) return;
        if (message.type === 'ready') {
          void setState({ state: 'connected', error: null });
          return;
        }
        if (message.type === 'error') {
          void setState({ state: 'disconnected', error: message.error?.message || '本地连接失败。' });
          current.disconnect();
          port = null;
          return;
        }
        if (message.type !== 'request' || typeof message.id !== 'string') return;
        const pending = enqueue(message.operation, message.args, async () => {
          if (!(await settings()).enabled || port !== current) throw new BridgeError('EACCES', 'Local bookmark access is disabled.');
        });
        void pending.then(
          result => respond(current, { type: 'response', id: message.id, result }, message.operation),
          error => respond(current, { type: 'response', id: message.id, error: errorPayload(error) }, message.operation),
        );
      });
      current.postMessage({ type: 'hello', version: PROTOCOL_VERSION, profileId: config.profileId, label: `Chrome ${config.profileId.slice(0, 8)}`, access: 'readwrite' });
    } catch (error) {
      if (generation === connectionGeneration) {
        port = null;
        await setState({ state: 'disconnected', error: error.message });
      }
    }
  })();
  try { await opening; } finally { opening = null; }
}

function respond(current, message, operation) {
  if (port !== current) return;
  const serialized = JSON.stringify(message);
  const limit = MAX_RESPONSE_BYTES - 1024;
  if (serialized.length > limit || serialized.length > limit / 3 && new TextEncoder().encode(serialized).length > limit) {
    const writing = !OPERATIONS[operation].readOnly;
    message = {
      type: 'response', id: message.id,
      error: {
        code: writing ? 'ERESULTTOOLARGE' : 'EMSGSIZE',
        message: writing
          ? 'The operation may have changed bookmarks, but its result is too large. Inspect current state; do not repeat the write.'
          : 'The result is too large. Use a narrower directory, tree depth, or find limit.',
        ...(writing ? { details: { outcome: Object.hasOwn(message, 'result') ? 'completed' : 'partial-or-unknown' } } : {}),
      },
    };
  }
  try { current.postMessage(message); } catch (error) {
    if (port === current) {
      port = null;
      current.disconnect();
      void setState({ state: 'disconnected', error: error.message });
    }
  }
}

async function setEnabled(enabled) {
  if (typeof enabled !== 'boolean') throw new BridgeError('EINVAL', 'enabled must be boolean.');
  if (!enabled) {
    connectionGeneration++;
    const current = port;
    port = null;
    current?.disconnect();
  }
  const config = await settings();
  await chrome.storage.local.set({ enabled });
  settingsPromise = Promise.resolve({ ...config, enabled });
  if (enabled) {
    if (opening) await opening;
    await connect();
  } else {
    await setState({ state: 'disabled', error: null });
  }
  return status();
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !message?.type?.startsWith('anymark.')) return;
  const action = message.type === 'anymark.status' ? status()
    : message.type === 'anymark.enable' ? setEnabled(message.enabled)
    : message.type === 'anymark.reconnect' ? connect().then(status)
    : message.type === 'anymark.operation' ? enqueue(message.operation, message.args)
    : Promise.reject(new BridgeError('ENOSYS', 'Unknown extension action.'));
  action.then(result => reply({ ok: true, result }), error => reply({ ok: false, error: errorPayload(error) }));
  return true;
});

async function boot() {
  if ((await settings()).enabled) await connect();
  else await setState({ state: 'disabled', error: null });
}
chrome.runtime.onStartup.addListener(() => { void boot(); });
chrome.runtime.onInstalled.addListener(() => { void boot(); });
chrome.bookmarks.onRemoved.addListener((id, info) => {
  const ids = [];
  const collect = node => { ids.push(node.id); (node.children || []).forEach(collect); };
  collect(info.node || { id });
  const cleanup = queue.then(async () => { await metadataReady; await metadata.removeNotes(ids); });
  queue = cleanup.catch(error => { console.error('[AnyMark] Local metadata cleanup failed:', error.message); });
});
void boot();
