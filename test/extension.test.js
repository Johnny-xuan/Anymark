import test from 'node:test';
import assert from 'node:assert/strict';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('revocation prevents an in-flight startup from publishing a native connection', async t => {
  const previous = globalThis.chrome;
  const entered = deferred();
  const badge = deferred();
  const config = { profileId: '12345678-1234-4234-8234-123456789abc', enabled: true };
  let listener;
  let connections = 0;
  const event = { addListener() {} };
  globalThis.chrome = {
    bookmarks: { onRemoved: event },
    storage: { local: {
      get: async () => ({ ...config }),
      set: async value => { Object.assign(config, value); },
      remove: async () => {},
    } },
    action: {
      async setBadgeText({ text }) {
        if (text === '…') { entered.resolve(); await badge.promise; }
      },
      async setBadgeBackgroundColor() {},
    },
    runtime: {
      id: 'test-extension',
      onMessage: { addListener(value) { listener = value; } },
      onStartup: event, onInstalled: event,
      connectNative() {
        connections++;
        return { onDisconnect: event, onMessage: event, postMessage() {}, disconnect() {} };
      },
    },
  };
  t.after(() => { badge.resolve(); globalThis.chrome = previous; });
  await import(`../extension/background.js?revocation=${Date.now()}`);
  await entered.promise;
  const send = message => new Promise(resolve => listener(message, { id: 'test-extension' }, resolve));
  assert.equal((await send({ type: 'anymark.enable', enabled: false })).result.enabled, false);
  badge.resolve();
  await new Promise(setImmediate);
  assert.equal(connections, 0, 'A revoked startup must not create a native port.');
  const status = (await send({ type: 'anymark.status' })).result;
  assert.equal(status.enabled, false);
  assert.equal(status.state, 'disabled');
});
