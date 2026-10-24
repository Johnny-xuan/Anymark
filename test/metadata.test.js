import test from 'node:test';
import assert from 'node:assert/strict';
import { MetadataStore, NOTE_PREFIX, INBOX_KEY } from '../src/metadata.js';
import { BridgeError } from '../src/protocol.js';

function fixture(initial = {}) {
  const data = structuredClone(initial);
  const calls = [];
  let before;
  const invoke = (method, args) => {
    calls.push({ method, args: structuredClone(args) });
    before?.(method, args);
  };
  const storage = {
    async get(keys) {
      invoke('get', [keys]);
      const selected = keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(selected.filter(key => Object.hasOwn(data, key)).map(key => [key, structuredClone(data[key])]));
    },
    async set(values) {
      invoke('set', [values]);
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      invoke('remove', [keys]);
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
  return { store: new MetadataStore(storage), storage, data, calls, failWith(callback) { before = callback; } };
}

async function rejectsCode(promise, code) {
  let failure;
  await assert.rejects(promise, error => {
    assert.ok(error instanceof BridgeError);
    assert.equal(error.code, code);
    failure = error;
    return true;
  });
  return failure;
}

test('construction and reads never initialize or repair metadata', async () => {
  const { store, calls, data } = fixture();
  assert.deepEqual(calls, []);
  assert.equal(await store.getInboxId(), undefined);
  assert.deepEqual(await store.getNotes(['folder', 'bookmark']), new Map([['folder', ''], ['bookmark', '']]));
  assert.ok(calls.every(call => call.method === 'get'));
  assert.deepEqual(data, {});
});


test('folder and bookmark notes preserve whitespace and clear independently', async () => {
  const { store, data } = fixture({ unrelated: true });
  await store.setNote('folder', '  a folder\n');
  await store.setNote('bookmark', 'a bookmark');
  assert.deepEqual(await store.getNotes(['folder', 'bookmark']), new Map([['folder', '  a folder\n'], ['bookmark', 'a bookmark']]));
  await store.setNote('folder', '');
  assert.deepEqual(await store.getNotes(['folder', 'bookmark']), new Map([['folder', ''], ['bookmark', 'a bookmark']]));
  assert.equal(data.unrelated, true);
});

test('separate Chrome profile storage areas never share notes or Inbox IDs', async () => {
  const a = fixture();
  const b = fixture();
  await a.store.setNote('same-id', 'Profile A');
  await a.store.setInboxId('folder-a');
  await b.store.setNote('same-id', 'Profile B');
  await b.store.setInboxId('folder-b');
  assert.equal((await a.store.getNotes(['same-id'])).get('same-id'), 'Profile A');
  assert.equal((await b.store.getNotes(['same-id'])).get('same-id'), 'Profile B');
  assert.equal(await a.store.getInboxId(), 'folder-a');
  assert.equal(await b.store.getInboxId(), 'folder-b');
});

test('independent store instances see external metadata changes without a cache', async () => {
  const { store, storage } = fixture();
  const second = new MetadataStore(storage);
  await store.setNote('stable-id', 'Before moving');
  assert.equal((await second.getNotes(['stable-id'])).get('stable-id'), 'Before moving');
  await second.setNote('stable-id', 'Edited elsewhere');
  await second.setInboxId('new-inbox');
  assert.equal((await store.getNotes(['stable-id'])).get('stable-id'), 'Edited elsewhere');
  assert.equal(await store.getInboxId(), 'new-inbox');
  await second.setNote('stable-id', '');
  assert.equal((await store.getNotes(['stable-id'])).get('stable-id'), '');
});

test('removing a subtree cleans explicit IDs and its Inbox association together', async () => {
  const { store, data } = fixture({ [INBOX_KEY]: 'inbox', unrelated: 1 });
  await store.setNote('inbox', 'Inbox context');
  await store.setNote('child', 'Child context');
  await store.setNote('elsewhere', 'Keep');
  await store.removeNotes(['inbox', 'child', 'inbox', 'missing']);
  assert.deepEqual(await store.getNotes(['inbox', 'child', 'elsewhere']), new Map([['inbox', ''], ['child', ''], ['elsewhere', 'Keep']]));
  assert.equal(data.unrelated, 1);
  assert.equal(await store.getInboxId(), undefined);
});

test('deleting unrelated IDs retains the association and notes for other IDs', async () => {
  const { store } = fixture({ [INBOX_KEY]: 'inbox' });
  await store.setNote('inbox', 'Keep');
  await store.setNote('gone', 'Remove');
  await store.removeNotes(['gone']);
  assert.equal(await store.getInboxId(), 'inbox');
  assert.deepEqual(await store.getNotes(['inbox', 'gone']), new Map([['inbox', 'Keep'], ['gone', '']]));
});

test('empty ID collections do not call storage', async () => {
  const { store, calls } = fixture();
  assert.deepEqual(await store.getNotes([]), new Map());
  assert.equal(await store.removeNotes([]), undefined);
  assert.deepEqual(calls, []);
});


test('invalid IDs and nonstring notes reject before touching storage', async () => {
  const { store, calls } = fixture();
  for (const id of ['', null, 1, undefined]) {
    await rejectsCode(store.setNote(id, 'note'), 'EINVAL');
    await rejectsCode(store.setInboxId(id), 'EINVAL');
    await rejectsCode(store.getNotes([id]), 'EINVAL');
    await rejectsCode(store.removeNotes([id]), 'EINVAL');
  }
  for (const value of [null, undefined, 1, {}]) await rejectsCode(store.setNote('id', value), 'EINVAL');
  await rejectsCode(store.getNotes('id'), 'EINVAL');
  await rejectsCode(store.removeNotes(null), 'EINVAL');
  assert.deepEqual(calls, []);
});

test('storage read failures are visible and do not trigger cleanup or fallback writes', async () => {
  const { store, data, calls, failWith } = fixture({ [INBOX_KEY]: 'inbox' });
  await store.setNote('inbox', 'Keep');
  const initial = structuredClone(data);
  calls.length = 0;
  failWith(method => { if (method === 'get') throw new Error('Storage unavailable'); });
  const error = await rejectsCode(store.getNotes(['inbox']), 'EIO');
  assert.equal(error.message, 'Storage unavailable');
  assert.deepEqual(error.details, { method: 'storage.local.get' });
  await rejectsCode(store.getInboxId(), 'EIO');
  await rejectsCode(store.removeNotes(['inbox']), 'EIO');
  assert.ok(calls.every(call => call.method === 'get'));
  assert.deepEqual(data, initial);
});

test('failed note or Inbox persistence is never reported as successful', async () => {
  const { store, data, failWith } = fixture({ [INBOX_KEY]: 'old-inbox' });
  await store.setNote('id', 'Original');
  const initial = structuredClone(data);
  failWith(method => { if (method === 'set') throw new Error('Quota exceeded'); });
  const error = await rejectsCode(store.setNote('id', 'New'), 'EIO');
  assert.deepEqual(error.details, { method: 'storage.local.set' });
  await rejectsCode(store.setInboxId('new-inbox'), 'EIO');
  assert.deepEqual(data, initial);
});

test('failed deletion rejects without claiming that notes or association were cleared', async () => {
  const { store, data, failWith } = fixture({ [INBOX_KEY]: 'inbox' });
  await store.setNote('inbox', 'Original');
  const initial = structuredClone(data);
  failWith(method => { if (method === 'remove') throw new Error('Storage is locked'); });
  const error = await rejectsCode(store.removeNotes(['inbox']), 'EIO');
  assert.deepEqual(error.details, { method: 'storage.local.remove' });
  await rejectsCode(store.setNote('inbox', ''), 'EIO');
  assert.deepEqual(data, initial);
});

test('structured storage errors retain their codes and details', async () => {
  const { store, failWith } = fixture();
  const failure = new BridgeError('EACCES', 'Storage denied', { policy: true });
  failWith(() => { throw failure; });
  await assert.rejects(store.setNote('id', 'Note'), error => error === failure);
});

test('notes survive UTF-8 storage even with lone UTF-16 surrogates, controls and markup', async () => {
  const backing = {};
  const store = new MetadataStore({
    async set(values) { for (const [key, value] of Object.entries(values)) backing[key] = Buffer.from(value, 'utf8').toString('utf8'); },
    async get(keys) { return Object.fromEntries(keys.filter(key => Object.hasOwn(backing, key)).map(key => [key, backing[key]])); },
    async remove(key) { delete backing[key]; },
  });
  const content = '雪 😀 \ud800 lone high; \udfff lone low\u0000\r\n<script>inert</script>';
  await store.setNote('bookmark', content);
  assert.equal((await store.getNotes(['bookmark'])).get('bookmark'), content);
});

test('explicit migration preserves old notes and Inbox while removing only the obsolete namespace', async () => {
  const legacy = 'anymark.note.v1:';
  const { store, data } = fixture({ [legacy + 'folder']: '  Old folder\n', [legacy + 'bookmark']: '\"quoted\"', [INBOX_KEY]: 'folder', unrelated: true });
  await store.migrate();
  assert.deepEqual(await store.getNotes(['folder', 'bookmark']), new Map([['folder', '  Old folder\n'], ['bookmark', '\"quoted\"']]));
  assert.equal(await store.getInboxId(), 'folder');
  assert.equal(data.unrelated, true);
  assert.equal(Object.keys(data).some(key => key.startsWith(legacy)), false);
  const after = structuredClone(data);
  await store.migrate();
  assert.deepEqual(data, after);
});

test('migration retains originals until replacement persistence succeeds and never overwrites newer notes', async () => {
  const key = 'anymark.note.v1:id';
  const f = fixture({ [key]: 'Original' });
  f.failWith(method => { if (method === 'set') throw new Error('Disk full'); });
  await rejectsCode(f.store.migrate(), 'EIO');
  assert.deepEqual(f.data, { [key]: 'Original' });
  f.failWith(undefined);
  await f.store.setNote('id', 'Newer note');
  f.failWith(method => { if (method === 'remove') throw new Error('Cleanup failed'); });
  await rejectsCode(f.store.migrate(), 'EIO');
  assert.equal(f.data[key], 'Original');
  assert.equal((await f.store.getNotes(['id'])).get('id'), 'Newer note');
  f.failWith(undefined);
  await f.store.migrate();
  assert.equal((await f.store.getNotes(['id'])).get('id'), 'Newer note');
  assert.equal(Object.hasOwn(f.data, key), false);
});

test('corrupt current notes fail visibly without erasing the current or legacy data', async () => {
  const initial = { [NOTE_PREFIX + 'id']: 'not valid JSON', 'anymark.note.v1:id': 'Recoverable original' };
  const { store, data } = fixture(initial);
  await rejectsCode(store.getNotes(['id']), 'EIO');
  await rejectsCode(store.migrate(), 'EIO');
  assert.deepEqual(data, initial);
});
