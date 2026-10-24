import test from 'node:test';
import assert from 'node:assert/strict';
import { InboxService } from '../src/inbox.js';
import { MetadataStore, NOTE_PREFIX, INBOX_KEY } from '../src/metadata.js';
import { BridgeError } from '../src/protocol.js';

function fixture({ inbox = false, initial = {} } = {}) {
  const root = { id: 'dynamic-root', title: '', children: [
    { id: 'account-bar', title: 'My account bar', folderType: 'bookmarks-bar', children: [] },
    { id: 'chrome-default', title: 'Localized default folder', folderType: 'other', children: [] },
    { id: 'organized', title: 'Organized', children: [] },
    { id: 'managed', title: 'Policy', unmodifiable: 'managed', children: [
      { id: 'managed-child', title: 'Locked by ancestor', children: [] },
    ] },
  ] };
  const data = { ...initial };
  if (inbox) {
    root.children[1].children.push({ id: 'inbox-id', title: 'Renamed Inbox', children: [] });
    data[INBOX_KEY] = 'inbox-id';
  }
  const calls = [];
  let nextId = 100;
  let before;
  const invoke = (api, method, args) => {
    calls.push({ api, method, args: structuredClone(args) });
    before?.(api, method, args);
  };
  const locate = (id, node = root) => {
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const match = locate(id, child);
      if (match) return match;
    }
  };
  const parentOf = (id, node = root) => {
    for (const child of node.children || []) {
      if (child.id === id) return node;
      const parent = parentOf(id, child);
      if (parent) return parent;
    }
  };
  const bookmarks = {
    async getTree() {
      invoke('bookmarks', 'getTree', []);
      return [structuredClone(root)];
    },
    async create(details) {
      invoke('bookmarks', 'create', [details]);
      const parent = locate(details.parentId ?? 'chrome-default');
      if (!parent || !parent.children) throw new Error('Cannot add to missing folder');
      const node = {
        id: String(nextId++), parentId: parent.id, title: details.title ?? '',
        ...(details.url === undefined ? { children: [] } : { url: details.url }),
      };
      parent.children.push(node);
      // Chrome create returns a BookmarkTreeNode without a populated children list.
      const { children, ...result } = node;
      return structuredClone(result);
    },
  };
  const storage = {
    async get(keys) {
      invoke('storage', 'get', [keys]);
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys])
        .filter(key => Object.hasOwn(data, key)).map(key => [key, structuredClone(data[key])]));
    },
    async set(values) {
      invoke('storage', 'set', [values]);
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      invoke('storage', 'remove', [keys]);
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
  const metadata = new MetadataStore(storage);
  return {
    service: new InboxService(bookmarks, metadata), bookmarks, metadata, root, data, calls, locate,
    failWith(callback) { before = callback; },
    writes() { return calls.filter(call => call.method !== 'get' && call.method !== 'getTree'); },
    move(id, parentId) {
      const node = locate(id);
      const parent = parentOf(id);
      parent.children.splice(parent.children.indexOf(node), 1);
      locate(parentId).children.push(node);
      node.parentId = parentId;
    },
    delete(id) {
      const parent = parentOf(id);
      parent.children.splice(parent.children.findIndex(node => node.id === id), 1);
    },
  };
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

test('constructing InboxService and reading metadata do not create an Inbox', async () => {
  const f = fixture();
  assert.deepEqual(f.calls, []);
  assert.equal(await f.metadata.getInboxId(), undefined);
  assert.deepEqual(f.writes(), []);
  assert.deepEqual(f.locate('chrome-default').children, []);
});

test('first capture uses Chrome default parent, persists its real IDs and saves the note', async () => {
  const f = fixture();
  const result = await f.service.capture({ url: 'https://EXAMPLE.com:443', title: 'Example', note: 'Read later' });
  assert.deepEqual(result, { bookmarkId: '101', inboxId: '100', created: true });
  assert.equal(f.locate('100').parentId, 'chrome-default');
  assert.equal(f.locate('100').title, 'AnyMark Inbox');
  assert.equal(f.locate('101').url, 'https://example.com/');
  assert.equal(f.locate('101').title, 'Example');
  assert.equal(f.data[INBOX_KEY], '100');
  assert.equal((await f.metadata.getNotes(['101'])).get('101'), 'Read later');
});

test('new title defaults to normalized URL and an explicitly empty title remains empty', async () => {
  const f = fixture({ inbox: true });
  const first = await f.service.capture({ url: 'http://EXAMPLE.com:80' });
  assert.equal(f.locate(first.bookmarkId).title, 'http://example.com/');
  const second = await f.service.capture({ url: 'https://another.example/', title: '' });
  assert.equal(f.locate(second.bookmarkId).title, '');
  assert.ok(f.writes().every(call => call.api === 'bookmarks'));
});

test('equivalent URLs already directly in Inbox return the same ID without changing title or omitted note', async () => {
  const f = fixture({ inbox: true });
  f.locate('inbox-id').children.push({ id: 'old', title: 'Original title', url: 'https://EXAMPLE.com:443/a', parentId: 'inbox-id' });
  await f.metadata.setNote('old', 'Do not overwrite');
  const result = await f.service.capture({ url: 'https://example.com/a', title: 'New tab title' });
  assert.deepEqual(result, { bookmarkId: 'old', inboxId: 'inbox-id', created: false });
  assert.equal(f.locate('old').title, 'Original title');
  assert.equal((await f.metadata.getNotes(['old'])).get('old'), 'Do not overwrite');
});

test('only explicitly supplied notes update duplicate bookmarks, including an explicit clear', async () => {
  const f = fixture({ inbox: true });
  const first = await f.service.capture({ url: 'https://example.com/', note: 'Original' });
  const result = await f.service.capture({ url: 'https://example.com/', note: 'Updated' });
  assert.equal(result.created, false);
  assert.equal(result.bookmarkId, first.bookmarkId);
  assert.equal((await f.metadata.getNotes([first.bookmarkId])).get(first.bookmarkId), 'Updated');
  await f.service.capture({ url: 'https://example.com/', note: '' });
  assert.equal((await f.metadata.getNotes([first.bookmarkId])).get(first.bookmarkId), '');
  assert.equal(f.locate('inbox-id').children.length, 1);
});

test('repeated capture with omitted note preserves both existing note and bookmark count', async () => {
  const f = fixture();
  const first = await f.service.capture({ url: 'https://example.com/', note: 'Keep' });
  const second = await f.service.capture({ url: 'https://EXAMPLE.com:443/' });
  assert.deepEqual(second, { ...first, created: false });
  assert.equal((await f.metadata.getNotes([first.bookmarkId])).get(first.bookmarkId), 'Keep');
  assert.equal(f.locate(first.inboxId).children.length, 1);
});

test('an explicit move into Inbox is recognized by the next snapshot and deduplicated', async () => {
  const f = fixture({ inbox: true });
  f.locate('organized').children.push({ id: 'moved', parentId: 'organized', title: 'Moved', url: 'https://example.com/' });
  await f.metadata.setNote('moved', 'Stable-ID note');
  f.move('moved', 'inbox-id');
  assert.deepEqual(await f.service.capture({ url: 'https://example.com/' }), { bookmarkId: 'moved', inboxId: 'inbox-id', created: false });
  assert.equal((await f.metadata.getNotes(['moved'])).get('moved'), 'Stable-ID note');
});

test('organized links are not moved back and nested links do not count as direct Inbox duplicates', async () => {
  const f = fixture({ inbox: true });
  f.locate('organized').children.push({ id: 'elsewhere', parentId: 'organized', title: 'Organized', url: 'https://example.com/' });
  f.locate('inbox-id').children.push({ id: 'nested-folder', title: 'Nested', children: [
    { id: 'nested', title: 'Nested link', url: 'https://nested.example/' },
  ] });
  const first = await f.service.capture({ url: 'https://example.com/' });
  assert.notEqual(first.bookmarkId, 'elsewhere');
  assert.equal(f.locate('organized').children[0].id, 'elsewhere');
  const second = await f.service.capture({ url: 'https://nested.example/' });
  assert.notEqual(second.bookmarkId, 'nested');
  assert.equal(first.created, true);
  assert.equal(second.created, true);
});

test('moving a captured bookmark out permits a new capture without moving or editing the original', async () => {
  const f = fixture({ inbox: true });
  const first = await f.service.capture({ url: 'https://example.com/', note: 'Organized note' });
  f.move(first.bookmarkId, 'organized');
  const next = await f.service.capture({ url: 'https://example.com/', note: 'Inbox note' });
  assert.equal(next.created, true);
  assert.notEqual(next.bookmarkId, first.bookmarkId);
  assert.equal(f.locate(first.bookmarkId).parentId, 'organized');
  assert.equal((await f.metadata.getNotes([first.bookmarkId])).get(first.bookmarkId), 'Organized note');
  assert.equal((await f.metadata.getNotes([next.bookmarkId])).get(next.bookmarkId), 'Inbox note');
});

test('moving or renaming the Inbox folder preserves its ID association', async () => {
  const f = fixture({ inbox: true });
  f.move('inbox-id', 'organized');
  f.locate('inbox-id').title = 'My renamed collection';
  const result = await f.service.capture({ url: 'https://example.com/' });
  assert.equal(result.inboxId, 'inbox-id');
  assert.equal(f.locate('inbox-id').title, 'My renamed collection');
  assert.equal(f.writes().filter(call => call.method === 'create').length, 1);
});

test('deleting a bookmark or the Inbox is reflected on the next capture, without a stale cache', async () => {
  const f = fixture();
  const first = await f.service.capture({ url: 'https://example.com/' });
  f.delete(first.bookmarkId);
  const second = await f.service.capture({ url: 'https://example.com/' });
  assert.notEqual(second.bookmarkId, first.bookmarkId);
  assert.equal(second.inboxId, first.inboxId);
  f.delete(first.inboxId);
  const third = await f.service.capture({ url: 'https://example.com/' });
  assert.notEqual(third.inboxId, first.inboxId);
  assert.equal(f.data[INBOX_KEY], third.inboxId);
  assert.equal(third.created, true);
});

test('an unrelated folder with the Inbox title is not adopted without an ID association', async () => {
  const f = fixture();
  f.locate('organized').title = 'AnyMark Inbox';
  const result = await f.service.capture({ url: 'https://example.com/' });
  assert.notEqual(result.inboxId, 'organized');
  assert.equal(f.locate('organized').children.length, 0);
});

test('missing, file, root and policy-protected associations are not used as writable Inbox folders', async () => {
  for (const id of ['deleted-id', 'file-id', 'dynamic-root', 'managed', 'managed-child']) {
    const f = fixture({ initial: { [INBOX_KEY]: id } });
    f.locate('organized').children.push({ id: 'file-id', title: 'Not a folder', url: 'https://file.example/' });
    const result = await f.service.capture({ url: 'https://example.com/' });
    assert.notEqual(result.inboxId, id);
    assert.equal(f.locate(result.inboxId).parentId, 'chrome-default');
    assert.equal(f.data[INBOX_KEY], result.inboxId);
  }
});

test('URL identity preserves query strings, fragments, path case and tracking parameters', async () => {
  const f = fixture({ inbox: true });
  const urls = [
    'https://example.com/a?utm_source=one',
    'https://example.com/a?utm_source=two',
    'https://example.com/a#one',
    'https://example.com/a#two',
    'https://example.com/A',
    'https://example.com/a',
  ];
  const results = [];
  for (const url of urls) results.push(await f.service.capture({ url }));
  assert.equal(new Set(results.map(result => result.bookmarkId)).size, urls.length);
  assert.deepEqual(f.locate('inbox-id').children.map(node => node.url), urls);
});

test('invalid input rejects before reads or writes and non-HTTP bookmarks cannot be captured', async () => {
  const f = fixture();
  for (const url of ['', '/relative', 'not a URL', 'file:///tmp/page', 'chrome://bookmarks/', 'javascript:alert(1)', 'data:text/html,hello', 'ftp://example.com/']) {
    await rejectsCode(f.service.capture({ url }), 'EINVAL');
  }
  for (const args of [null, {}, { url: 1 }, { url: 'https://example.com/', note: undefined }, { url: 'https://example.com/', title: 3 }]) {
    await rejectsCode(f.service.capture(args), 'EINVAL');
  }
  assert.deepEqual(f.calls, []);
});

test('malformed URLs in old bookmarks do not prevent a valid capture', async () => {
  const f = fixture({ inbox: true });
  f.locate('inbox-id').children.push({ id: 'bad-old', title: 'Invalid old URL', url: 'not-an-absolute-url' });
  const result = await f.service.capture({ url: 'https://example.com/' });
  assert.equal(result.created, true);
  assert.notEqual(result.bookmarkId, 'bad-old');
});

test('tree read failures and malformed responses never masquerade as a missing Inbox', async () => {
  const f = fixture({ inbox: true });
  f.failWith((api, method) => { if (api === 'bookmarks' && method === 'getTree') throw new Error('Chrome temporarily unavailable'); });
  const error = await rejectsCode(f.service.capture({ url: 'https://example.com/' }), 'EIO');
  assert.deepEqual(error.details, { method: 'getTree' });
  assert.deepEqual(f.writes(), []);
  for (const tree of [[], null, [{}], [{ id: 'root', children: {} }]]) {
    f.bookmarks.getTree = async () => tree;
    await rejectsCode(f.service.capture({ url: 'https://example.com/' }), 'EIO');
  }
  assert.deepEqual(f.writes(), []);
});

test('association read failures do not trigger a replacement folder or any Chrome writes', async () => {
  const f = fixture();
  f.failWith((api, method) => { if (api === 'storage' && method === 'get') throw new Error('Storage unavailable'); });
  await rejectsCode(f.service.capture({ url: 'https://example.com/' }), 'EIO');
  assert.deepEqual(f.writes(), []);
  assert.ok(f.calls.every(call => call.api === 'storage'));
});

test('folder creation failures report an ordinary error when no Chrome changes succeeded', async () => {
  const f = fixture();
  f.failWith((api, method) => { if (api === 'bookmarks' && method === 'create') throw new Error('Chrome create denied'); });
  const error = await rejectsCode(f.service.capture({ url: 'https://example.com/' }), 'EIO');
  assert.equal(error.message, 'Chrome create denied');
  assert.equal(f.data[INBOX_KEY], undefined);
  assert.equal(f.locate('chrome-default').children.length, 0);
});

test('failed association persistence reports the created folder and does not pretend to roll it back', async () => {
  const f = fixture();
  f.failWith((api, method, [values]) => {
    if (api === 'storage' && method === 'set' && Object.hasOwn(values, INBOX_KEY)) throw new Error('Association write failed');
  });
  const error = await rejectsCode(f.service.capture({ url: 'https://example.com/', note: 'Unwritten' }), 'EPARTIAL');
  assert.deepEqual(error.details, {
    created: ['100'], inboxId: '100',
    cause: { code: 'EIO', message: 'Association write failed', details: { method: 'storage.local.set' } },
  });
  assert.equal(f.locate('100').title, 'AnyMark Inbox');
  assert.equal(f.locate('100').children.length, 0);
  assert.equal(f.data[INBOX_KEY], undefined);
  assert.equal(f.writes().filter(call => call.api === 'bookmarks').length, 1);
});

test('bookmark creation failure after new folder creation exposes the persisted partial folder', async () => {
  const f = fixture();
  f.failWith((api, method, [details]) => {
    if (api === 'bookmarks' && method === 'create' && details.url) throw new Error('Bookmark create failed');
  });
  const error = await rejectsCode(f.service.capture({ url: 'https://example.com/' }), 'EPARTIAL');
  assert.deepEqual(error.details, {
    created: ['100'], inboxId: '100',
    cause: { code: 'EIO', message: 'Bookmark create failed', details: { method: 'create' } },
  });
  assert.equal(f.data[INBOX_KEY], '100');
  assert.equal(f.locate('100').children.length, 0);
  f.failWith(undefined);
  const next = await f.service.capture({ url: 'https://example.com/' });
  assert.deepEqual(next, { bookmarkId: '101', inboxId: '100', created: true });
});

test('bookmark create failures in an existing Inbox are not mislabeled as partial creation', async () => {
  const f = fixture({ inbox: true });
  f.failWith((api, method) => { if (api === 'bookmarks' && method === 'create') throw new Error('Bookmark create failed'); });
  await rejectsCode(f.service.capture({ url: 'https://example.com/' }), 'EIO');
  assert.equal(f.locate('inbox-id').children.length, 0);
});

test('failed note persistence after new folder and bookmark creation reports both real created IDs', async () => {
  const f = fixture();
  f.failWith((api, method, [values]) => {
    if (api === 'storage' && method === 'set' && Object.keys(values).some(key => key.startsWith(NOTE_PREFIX))) throw new Error('Note quota exceeded');
  });
  const error = await rejectsCode(f.service.capture({ url: 'https://example.com/', note: 'Not saved' }), 'EPARTIAL');
  assert.deepEqual(error.details, {
    created: ['100', '101'], inboxId: '100', bookmarkId: '101',
    cause: { code: 'EIO', message: 'Note quota exceeded', details: { method: 'storage.local.set' } },
  });
  assert.equal(f.locate('101').url, 'https://example.com/');
  assert.equal(f.data[INBOX_KEY], '100');
  assert.equal(f.data[NOTE_PREFIX + '101'], undefined);
  f.failWith(undefined);
  assert.deepEqual(await f.service.capture({ url: 'https://example.com/', note: 'Retry explicitly' }), { bookmarkId: '101', inboxId: '100', created: false });
  assert.equal((await f.metadata.getNotes(['101'])).get('101'), 'Retry explicitly');
});

test('failed note persistence with an existing Inbox reports only the newly created bookmark', async () => {
  const f = fixture({ inbox: true });
  f.failWith((api, method) => { if (api === 'storage' && method === 'set') throw new Error('Note failed'); });
  const error = await rejectsCode(f.service.capture({ url: 'https://example.com/', note: 'Not saved' }), 'EPARTIAL');
  assert.deepEqual(error.details.created, ['100']);
  assert.equal(error.details.inboxId, 'inbox-id');
  assert.equal(error.details.bookmarkId, '100');
  assert.ok(f.locate('100'));
});

test('failed duplicate note updates reject honestly without claiming new bookmarks or altering existing notes', async () => {
  const f = fixture({ inbox: true });
  const first = await f.service.capture({ url: 'https://example.com/', note: 'Original' });
  f.failWith((api, method) => { if (api === 'storage' && ['set', 'remove'].includes(method)) throw new Error('Note write failed'); });
  await rejectsCode(f.service.capture({ url: 'https://example.com/', note: 'Unsaved' }), 'EIO');
  await rejectsCode(f.service.capture({ url: 'https://example.com/', note: '' }), 'EIO');
  assert.equal(f.locate('inbox-id').children.length, 1);
  assert.equal((await f.metadata.getNotes([first.bookmarkId])).get(first.bookmarkId), 'Original');
});
