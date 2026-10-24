import test from 'node:test';
import assert from 'node:assert/strict';
import { BookmarkFilesystem } from '../src/filesystem.js';
import { BridgeError, OPERATIONS, validateOperation } from '../src/protocol.js';
import { MetadataStore } from '../src/metadata.js';
import { parseBookmarkHTML, serializeBookmarkHTML } from '../src/transfer.js';

function fixture() {
  const root = {
    id: 'profile-root', title: '', children: [
      { id: 'bar-local', title: 'Bar', folderType: 'bookmarks-bar', children: [
        { id: 'twin-a', title: 'Twin', url: 'https://a.example/' },
        { id: 'twin-b', title: 'Twin', url: 'https://b.example/' },
        { id: 'empty', title: '', url: 'https://empty.example/' },
        { id: 'odd', title: '/~雪', url: 'https://odd.example/' },
        { id: 'work', title: 'Work', children: [
          { id: 'alpha', title: 'Alpha', url: 'https://example.org/Needle' },
          { id: 'sub', title: 'Sub', children: [
            { id: 'deep', title: 'Needle', url: 'https://deep.example/' },
          ] },
        ] },
        { id: 'dot', title: '.', url: 'https://dot.example/' },
      ] },
      { id: 'bar-account', title: 'Account Bar', folderType: 'bookmarks-bar', children: [] },
      { id: 'other', title: 'Other', children: [] },
      { id: 'policy', title: 'Policy', folderType: 'managed', unmodifiable: 'managed', children: [
        { id: 'policy-folder', title: 'Nested', children: [
          { id: 'locked', title: 'Locked', url: 'https://locked.example/' },
        ] },
      ] },
    ],
  };
  let nextId = 100;
  const calls = [];
  let before;
  const locate = (id, node = root) => {
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const result = locate(id, child);
      if (result) return result;
    }
  };
  const reindex = node => {
    (node.children || []).forEach((child, index) => {
      child.parentId = node.id;
      child.index = index;
      reindex(child);
    });
  };
  const copyNode = node => {
    const { children, ...value } = node;
    return structuredClone(value);
  };
  const invoke = (method, args) => {
    calls.push({ method, args: structuredClone(args) });
    before?.(method, args);
  };
  reindex(root);
  const api = {
    async getTree() {
      invoke('getTree', []);
      return [structuredClone(root)];
    },
    async create(details) {
      invoke('create', [details]);
      const parent = locate(details.parentId ?? 'other');
      if (!parent?.children) throw new Error('Missing parent');
      const node = { id: String(nextId++), title: details.title ?? '', ...(details.url === undefined ? { children: [] } : { url: details.url }) };
      parent.children.splice(details.index ?? parent.children.length, 0, node);
      reindex(root);
      return copyNode(node);
    },
    async update(id, changes) {
      invoke('update', [id, changes]);
      const node = locate(id);
      if (!node) throw new Error('Missing bookmark');
      Object.assign(node, changes);
      return copyNode(node);
    },
    async move(id, destination) {
      invoke('move', [id, destination]);
      const node = locate(id);
      const oldParent = locate(node.parentId);
      const parent = locate(destination.parentId);
      oldParent.children.splice(oldParent.children.indexOf(node), 1);
      parent.children.splice(destination.index ?? parent.children.length, 0, node);
      reindex(root);
      return copyNode(node);
    },
    async remove(id) {
      invoke('remove', [id]);
      const node = locate(id);
      if (node.children?.length) throw new Error('Folder is not empty');
      const parent = locate(node.parentId);
      parent.children.splice(parent.children.indexOf(node), 1);
      reindex(root);
    },
    async removeTree(id) {
      invoke('removeTree', [id]);
      const node = locate(id);
      const parent = locate(node.parentId);
      parent.children.splice(parent.children.indexOf(node), 1);
      reindex(root);
    },
  };
  const stored = {};
  let beforeStorage;
  const storage = {
    async get(keys) {
      beforeStorage?.('get');
      if (keys == null) return structuredClone(stored);
      const requested = typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(requested.filter(key => Object.hasOwn(stored, key)).map(key => [key, structuredClone(stored[key])]));
    },
    async set(values) { beforeStorage?.('set'); Object.assign(stored, structuredClone(values)); },
    async remove(keys) {
      beforeStorage?.('remove');
      for (const key of typeof keys === 'string' ? [keys] : keys) delete stored[key];
    },
  };
  const metadata = new MetadataStore(storage);
  return {
    fs: new BookmarkFilesystem(api, metadata), api, calls, locate, metadata,
    failWith(callback) { before = callback; },
    failMetadata(callback) { beforeStorage = callback; },
    writes: () => calls.filter(call => call.method !== 'getTree'),
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

const canonical = (title, id) => `${encodeURIComponent(title).replace(/~/g, '%7E')}~${id}`;

test('root and duplicate system folder types are discovered without fixed Chrome IDs', async () => {
  const { fs } = fixture();
  const result = await fs.execute('ls', { path: '/' });
  assert.equal(result.entry.id, 'profile-root');
  assert.equal(result.entry.path, '/');
  assert.equal(result.entry.readonly, true);
  assert.equal(result.entry.childrenWritable, false);
  assert.deepEqual(result.entries.map(entry => entry.id), ['bar-local', 'bar-account', 'other', 'policy']);
  assert.deepEqual(result.entries.map(entry => [entry.readonly, entry.childrenWritable]), [[true, true], [true, true], [true, true], [true, false]]);
});

test('canonical paths round-trip duplicates, empty titles, slash, tilde and Unicode', async () => {
  const { fs } = fixture();
  const { entries } = await fs.execute('ls', { path: 'id:bar-local' });
  for (const expected of entries) {
    const { entry } = await fs.execute('stat', { path: expected.path });
    assert.deepEqual(entry, expected);
  }
  assert.equal(entries.find(entry => entry.id === 'empty').path, '/Bar~bar-local/~empty');
  assert.equal(entries.find(entry => entry.id === 'odd').path, `/Bar~bar-local/${canonical('/~雪', 'odd')}`);
  const error = await rejectsCode(fs.execute('cat', { path: '/Bar/Twin' }), 'EAMBIGUOUS');
  assert.deepEqual(error.details.candidates.map(entry => entry.id), ['twin-a', 'twin-b']);
  assert.deepEqual((await fs.execute('cat', { path: 'id:twin-b' })).content, { title: 'Twin', url: 'https://b.example/', note: '' });
});

test('explicitly addressed duplicate bookmarks can change URL without changing siblings', async () => {
  const { fs, locate } = fixture();
  const first = await fs.execute('write', { path: 'id:twin-a', content: { url: 'https://changed-a.example/' } });
  assert.equal(first.entry.id, 'twin-a');
  assert.equal(locate('twin-b').url, 'https://b.example/');
  const secondPath = (await fs.execute('stat', { path: 'id:twin-b' })).entry.path;
  await fs.execute('write', { path: secondPath, content: { title: 'Twin', url: 'https://changed-b.example/' } });
  assert.equal(locate('twin-a').url, 'https://changed-a.example/');
  assert.equal(locate('twin-b').url, 'https://changed-b.example/');
  assert.equal(locate('twin-a').title, 'Twin');
  assert.equal(locate('twin-b').title, 'Twin');
});

test('a URL-only write preserves a title concurrently changed in Chrome', async () => {
  const { fs, locate, failWith } = fixture();
  failWith(method => { if (method === 'update') locate('alpha').title = 'Renamed in Chrome'; });
  const result = await fs.execute('write', { path: 'id:alpha', content: { url: 'https://changed.example/' } });
  assert.equal(result.entry.title, 'Renamed in Chrome');
  assert.equal(locate('alpha').title, 'Renamed in Chrome');
  assert.equal(locate('alpha').url, 'https://changed.example/');
});

test('existing duplicate names do not prevent reordering by stable ID', async () => {
  const { fs } = fixture();
  await fs.execute('mv', { path: 'id:twin-b', to: 'id:bar-local', index: 0 });
  const entries = (await fs.execute('ls', { path: 'id:bar-local' })).entries;
  assert.deepEqual(entries.slice(0, 2).map(entry => entry.id), ['twin-b', 'twin-a']);
});

test('lexical normalization precedes decoding and malformed or relative paths fail', async () => {
  const { fs } = fixture();
  assert.equal((await fs.execute('stat', { path: '/Bar//Work/../%2E' })).entry.id, 'dot');
  assert.equal((await fs.execute('stat', { path: '/../../Bar/./Work/' })).entry.id, 'work');
  for (const path of ['Bar/Work', '/Bar/%zz', 'id:', '/Bar/name~']) {
    await rejectsCode(fs.execute('stat', { path }), 'EINVAL');
  }
  await rejectsCode(fs.execute('stat', { path: '/Bar/%2E/' }), 'ENOTDIR');
  await rejectsCode(fs.execute('stat', { path: '/Bar/%2E/child' }), 'ENOTDIR');
});

test('canonical identities require the current title and parent while ID addresses remain stable', async () => {
  const { fs, api } = fixture();
  const oldPath = (await fs.execute('stat', { path: 'id:alpha' })).entry.path;
  await api.update('alpha', { title: 'Renamed' });
  await rejectsCode(fs.execute('stat', { path: oldPath }), 'ENOENT');
  const renamed = (await fs.execute('stat', { path: 'id:alpha' })).entry;
  assert.match(renamed.path, /Renamed~alpha$/);
  await api.move('alpha', { parentId: 'other' });
  await rejectsCode(fs.execute('stat', { path: renamed.path }), 'ENOENT');
  assert.equal((await fs.execute('stat', { path: 'id:alpha' })).entry.parentId, 'other');
  await rejectsCode(fs.execute('stat', { path: '/Bar/Work/Renamed~twin-a' }), 'ENOENT');
});

test('each operation sees Chrome changes and cat has only document content', async () => {
  const { fs, api } = fixture();
  assert.equal((await fs.execute('cat', { path: 'id:alpha' })).content.title, 'Alpha');
  await api.update('alpha', { title: 'Current', url: 'https://current.example/' });
  const result = await fs.execute('cat', { path: 'id:alpha' });
  assert.deepEqual(result.content, { title: 'Current', url: 'https://current.example/', note: '' });
  assert.equal(result.entry.title, 'Current');
  await rejectsCode(fs.execute('cat', { path: '/Bar/Work' }), 'EISDIR');
  await rejectsCode(fs.execute('ls', { path: 'id:alpha' }), 'ENOTDIR');
});

test('tree enforces depth without inventing descendant nodes', async () => {
  const { fs } = fixture();
  assert.deepEqual((await fs.execute('tree', { path: 'id:work', depth: 0 })).children, []);
  const shallow = await fs.execute('tree', { path: 'id:work', depth: 1 });
  assert.deepEqual(shallow.children.map(entry => entry.id), ['alpha', 'sub']);
  assert.ok(!Object.hasOwn(shallow.children[1], 'children'));
  const deep = await fs.execute('tree', { path: 'id:work', depth: 2 });
  assert.equal(deep.children[1].children[0].id, 'deep');
  assert.ok(!Object.hasOwn(deep.children[1].children[0], 'children'));
  await rejectsCode(fs.execute('tree', { path: 'id:work', depth: 13 }), 'EINVAL');
});

test('find searches title and URL case-insensitively in Chrome preorder and reports true truncation', async () => {
  const { fs } = fixture();
  const found = await fs.execute('find', { path: 'id:work', query: 'NEEDLE' });
  assert.deepEqual(found.entries.map(entry => entry.id), ['alpha', 'deep']);
  assert.equal(found.truncated, false);
  const limited = await fs.execute('find', { path: 'id:work', query: 'needle', limit: 1 });
  assert.deepEqual(limited.entries.map(entry => entry.id), ['alpha']);
  assert.equal(limited.truncated, true);
  assert.equal((await fs.execute('find', { path: 'id:work', query: 'deep.example', limit: 1 })).truncated, false);
  assert.deepEqual((await fs.execute('find', { path: 'id:work', query: 'Work' })).entries, []);
});

test('invalid schemas are rejected before accessing Chrome', async () => {
  const { fs, calls } = fixture();
  for (const [operation, args, code] of [
    ['shell', {}, 'ENOSYS'], ['stat', {}, 'EINVAL'],
    ['write', { path: '/Bar/new', content: { title: 'Missing URL' } }, 'EINVAL'],
    ['write', { path: '/Bar/new', content: { url: 'https://example.org/', id: 'forged' } }, 'EINVAL'],
    ['mv', { path: 'id:alpha', to: '/Other', index: -1 }, 'EINVAL'],
    ['rm', { path: 'id:alpha', recursive: 'yes' }, 'EINVAL'],
  ]) await rejectsCode(fs.execute(operation, args), code);
  assert.deepEqual(calls, []);
});

test('mkdir creates a real folder with a decoded basename and rejects collisions or missing parents', async () => {
  const { fs, locate } = fixture();
  const result = await fs.execute('mkdir', { path: '/Bar/new%2Ffolder/' });
  assert.equal(result.entry.title, 'new/folder');
  assert.equal(result.entry.type, 'directory');
  assert.deepEqual(locate(result.entry.id).children, []);
  assert.equal(result.entry.parentId, 'bar-local');
  await rejectsCode(fs.execute('mkdir', { path: '/Bar/new%2Ffolder' }), 'EEXIST');
  await rejectsCode(fs.execute('mkdir', { path: '/Bar/missing/nested' }), 'ENOENT');
  await rejectsCode(fs.execute('mkdir', { path: 'id:nonexistent' }), 'ENOENT');
  await rejectsCode(fs.execute('mkdir', { path: '/Bar/new~nonexistent' }), 'ENOENT');
});

test('write creates and updates real bookmarks, preserving identity and omitted titles', async () => {
  const { fs, locate } = fixture();
  const created = await fs.execute('write', { path: '/Other/New%2Fbookmark', content: { url: 'https://new.example/' } });
  assert.equal(created.created, true);
  assert.equal(created.entry.title, 'New/bookmark');
  assert.equal(locate(created.entry.id).url, 'https://new.example/');
  const updated = await fs.execute('write', { path: `id:${created.entry.id}`, content: { url: 'https://changed.example/' } });
  assert.equal(updated.created, false);
  assert.equal(updated.entry.id, created.entry.id);
  assert.equal(updated.entry.title, 'New/bookmark');
  const renamed = await fs.execute('write', { path: updated.entry.path, content: { title: '', url: 'https://empty-title.example/' } });
  assert.equal(renamed.entry.path, `/Other~other/~${created.entry.id}`);
  assert.equal(locate(created.entry.id).title, '');
});

test('write cannot invent ID targets, overwrite sibling titles or write to directories', async () => {
  const { fs, writes } = fixture();
  await rejectsCode(fs.execute('write', { path: 'id:absent', content: { url: 'https://example.org/' } }), 'ENOENT');
  await rejectsCode(fs.execute('write', { path: '/Bar/absent~absent', content: { url: 'https://example.org/' } }), 'ENOENT');
  await rejectsCode(fs.execute('write', { path: '/Bar/fresh', content: { title: 'Twin', url: 'https://example.org/' } }), 'EEXIST');
  await rejectsCode(fs.execute('write', { path: 'id:alpha', content: { title: 'Sub', url: 'https://example.org/' } }), 'EEXIST');
  await rejectsCode(fs.execute('write', { path: '/Other', content: { url: 'https://example.org/' } }), 'EISDIR');
  await rejectsCode(fs.execute('write', { path: '/Other/new/', content: { url: 'https://example.org/' } }), 'ENOTDIR');
  assert.deepEqual(writes(), []);
});

test('root, system folders and managed ancestry are protected before any mutation', async () => {
  const { fs, writes } = fixture();
  for (const id of ['profile-root', 'bar-local', 'bar-account', 'other', 'policy', 'policy-folder', 'locked']) {
    assert.equal((await fs.execute('stat', { path: `id:${id}` })).entry.readonly, true);
    await rejectsCode(fs.execute('mv', { path: `id:${id}`, to: '/Other/new' }), 'EROFS');
    await rejectsCode(fs.execute('rm', { path: `id:${id}`, recursive: true }), 'EROFS');
  }
  for (const path of ['/new', '/Policy/new', '/Policy/Nested/new']) {
    await rejectsCode(fs.execute('mkdir', { path }), 'EROFS');
    await rejectsCode(fs.execute('write', { path, content: { url: 'https://example.org/' } }), 'EROFS');
  }
  await rejectsCode(fs.execute('write', { path: 'id:locked', content: { url: 'https://example.org/' } }), 'EROFS');
  await rejectsCode(fs.execute('cp', { path: 'id:alpha', to: '/Policy/Nested' }), 'EROFS');
  await rejectsCode(fs.execute('mv', { path: 'id:alpha', to: '/' }), 'EROFS');
  assert.deepEqual(writes(), []);
});

test('system folders accept children and managed bookmarks can be read or copied out', async () => {
  const { fs, locate } = fixture();
  const created = await fs.execute('mkdir', { path: '/Account%20Bar/Allowed' });
  assert.equal(created.entry.parentId, 'bar-account');
  const copy = await fs.execute('cp', { path: 'id:locked', to: '/Other' });
  assert.equal(copy.entry.readonly, false);
  assert.equal(locate(copy.entry.id).url, 'https://locked.example/');
  assert.equal((await fs.execute('cat', { path: 'id:locked' })).content.title, 'Locked');
});

test('mv nests in an existing directory, preserves ID and returns the current canonical path', async () => {
  const { fs, locate } = fixture();
  const oldPath = (await fs.execute('stat', { path: 'id:alpha' })).entry.path;
  const { entry } = await fs.execute('mv', { path: oldPath, to: '/Other' });
  assert.equal(entry.id, 'alpha');
  assert.equal(entry.path, '/Other~other/Alpha~alpha');
  assert.equal(locate('alpha').parentId, 'other');
  await rejectsCode(fs.execute('stat', { path: oldPath }), 'ENOENT');
  const renamed = await fs.execute('mv', { path: 'id:alpha', to: '/Bar/Renamed' });
  assert.equal(renamed.entry.path, '/Bar~bar-local/Renamed~alpha');
  assert.equal(locate('alpha').title, 'Renamed');
});

test('moving a folder updates descendant paths and indexed reordering preserves Chrome order', async () => {
  const { fs, locate } = fixture();
  await fs.execute('mv', { path: 'id:work', to: '/Other' });
  assert.equal((await fs.execute('stat', { path: 'id:deep' })).entry.path, '/Other~other/Work~work/Sub~sub/Needle~deep');
  const result = await fs.execute('mv', { path: 'id:odd', to: '/Bar', index: 0 });
  assert.equal(result.entry.index, 0);
  assert.equal(locate('bar-local').children[0].id, 'odd');
  assert.equal((await fs.execute('ls', { path: '/Bar' })).entries[0].id, 'odd');
});

test('mv and cp reject destination collisions and cycles without mutating Chrome', async () => {
  const { fs, writes } = fixture();
  for (const operation of ['mv', 'cp']) {
    const extra = operation === 'cp' ? { recursive: true } : {};
    await rejectsCode(fs.execute(operation, { path: 'id:work', to: '/Bar/Work/Sub/new', ...extra }), 'EINVAL');
    await rejectsCode(fs.execute(operation, { path: 'id:work', to: 'id:work', ...extra }), 'EINVAL');
    await rejectsCode(fs.execute(operation, { path: 'id:alpha', to: 'id:twin-a', ...extra }), 'EEXIST');
    await rejectsCode(fs.execute(operation, { path: 'id:alpha', to: '/Other/missing/', ...extra }), 'ENOTDIR');
  }
  await rejectsCode(fs.execute('cp', { path: 'id:twin-a', to: '/Bar' }), 'EEXIST');
  assert.deepEqual(writes(), []);
});

test('mv reports a committed move if the subsequent rename fails', async () => {
  const { fs, locate, failWith } = fixture();
  failWith(method => { if (method === 'update') throw new Error('Chrome rename refused'); });
  const error = await rejectsCode(fs.execute('mv', { path: 'id:alpha', to: '/Other/Renamed' }), 'EPARTIAL');
  assert.equal(error.details.entry.id, 'alpha');
  assert.equal(error.details.entry.path, '/Other~other/Alpha~alpha');
  assert.equal(error.details.cause.message, 'Chrome rename refused');
  assert.equal(locate('alpha').parentId, 'other');
  assert.equal(locate('alpha').title, 'Alpha');
});

test('recursive cp creates new identities in source order without modifying originals', async () => {
  const { fs, locate, writes } = fixture();
  await rejectsCode(fs.execute('cp', { path: 'id:work', to: '/Other' }), 'EISDIR');
  assert.deepEqual(writes(), []);
  const result = await fs.execute('cp', { path: 'id:work', to: '/Other/Copy', recursive: true });
  assert.deepEqual(result.created.map(entry => entry.title), ['Copy', 'Alpha', 'Sub', 'Needle']);
  assert.equal(new Set(result.created.map(entry => entry.id)).size, 4);
  assert.ok(result.created.every(entry => !['work', 'alpha', 'sub', 'deep'].includes(entry.id)));
  assert.equal(result.entry.id, result.created[0].id);
  const copied = locate(result.entry.id);
  assert.deepEqual(copied.children.map(node => node.title), ['Alpha', 'Sub']);
  assert.equal(copied.children[0].url, 'https://example.org/Needle');
  assert.equal(copied.children[1].children[0].url, 'https://deep.example/');
  assert.equal(locate('work').parentId, 'bar-local');
  assert.equal(locate('work').title, 'Work');
});

test('cp exposes all committed creations and the Chrome failure without claiming rollback', async () => {
  const { fs, locate, failWith, writes } = fixture();
  let creates = 0;
  failWith(method => {
    if (method === 'create' && ++creates === 3) throw new Error('Chrome quota reached');
  });
  const error = await rejectsCode(fs.execute('cp', { path: 'id:work', to: '/Other', recursive: true }), 'EPARTIAL');
  assert.deepEqual(error.details.created.map(entry => entry.title), ['Work', 'Alpha']);
  assert.equal(error.details.cause.code, 'EIO');
  assert.equal(error.details.cause.message, 'Chrome quota reached');
  for (const entry of error.details.created) assert.ok(locate(entry.id));
  assert.equal(locate('other').children[0].children.length, 1);
  assert.ok(!writes().some(call => call.method.startsWith('remove')));
});

test('a first-create failure is an ordinary Chrome failure, not a fake partial success', async () => {
  const { fs, locate, failWith } = fixture();
  failWith(method => { if (method === 'create') throw new Error('Chrome create refused'); });
  const error = await rejectsCode(fs.execute('cp', { path: 'id:alpha', to: '/Other' }), 'EIO');
  assert.equal(error.message, 'Chrome create refused');
  assert.deepEqual(locate('other').children, []);
});

test('rm permanently removes files, empty directories and explicitly recursive subtrees', async () => {
  const { fs, locate, writes } = fixture();
  await rejectsCode(fs.execute('rm', { path: 'id:work' }), 'ENOTEMPTY');
  assert.deepEqual(writes(), []);
  const empty = await fs.execute('mkdir', { path: '/Other/Empty' });
  assert.deepEqual(await fs.execute('rm', { path: empty.entry.path }), { removed: [empty.entry.id] });
  assert.equal(locate(empty.entry.id), undefined);
  assert.deepEqual(await fs.execute('rm', { path: 'id:odd' }), { removed: ['odd'] });
  assert.equal(locate('odd'), undefined);
  assert.deepEqual(await fs.execute('rm', { path: 'id:work', recursive: true }), { removed: ['work', 'alpha', 'sub', 'deep'] });
  assert.equal(locate('deep'), undefined);
  await rejectsCode(fs.execute('stat', { path: 'id:work' }), 'ENOENT');
});


test('invalid bookmark URLs cannot create folders or erase an existing URL', async () => {
  const { fs, writes } = fixture();
  for (const path of ['/Bar/New', 'id:alpha']) {
    for (const url of ['', 'relative/path']) {
      await rejectsCode(fs.execute('write', { path, content: { url } }), 'EINVAL');
    }
  }
  assert.deepEqual(writes(), []);
  assert.equal((await fs.execute('cat', { path: 'id:alpha' })).content.url, 'https://example.org/Needle');
});

test('local notes belong to stable IDs and are available to file reads, folder stat and search', async () => {
  const { fs, locate, writes } = fixture();
  await fs.execute('edit', { path: 'id:alpha', changes: { note: 'Discuss this with the retrieval team' } });
  await fs.execute('edit', { path: 'id:work', changes: { note: 'Research context for the retrieval project' } });
  assert.equal((await fs.execute('cat', { path: 'id:alpha' })).content.note, 'Discuss this with the retrieval team');
  assert.equal((await fs.execute('stat', { path: 'id:work' })).entry.note, 'Research context for the retrieval project');
  assert.deepEqual((await fs.execute('find', { path: '/Bar', query: 'retrieval' })).entries.map(entry => entry.id), ['work', 'alpha']);
  assert.equal(locate('alpha').url, 'https://example.org/Needle');
  assert.deepEqual(writes(), []);
});

test('Chrome readonly attributes do not prevent editing owned local note metadata', async () => {
  const { fs, writes } = fixture();
  await fs.execute('edit', { path: 'id:bar-local', changes: { note: 'My browsing workspace' } });
  assert.equal((await fs.execute('stat', { path: 'id:bar-local' })).entry.note, 'My browsing workspace');
  await rejectsCode(fs.execute('edit', { path: 'id:bar-local', changes: { title: 'Renamed' } }), 'EROFS');
  assert.deepEqual(writes(), []);
  await rejectsCode(fs.execute('edit', { path: 'id:work', changes: { url: 'https://example.org/' } }), 'EISDIR');
  await rejectsCode(fs.execute('edit', { path: 'id:alpha', changes: {} }), 'EINVAL');
});

test('notes survive move, clone independently during recursive copy, and are removed with the subtree', async () => {
  const { fs, metadata } = fixture();
  await fs.execute('edit', { path: 'id:work', changes: { note: 'Folder context' } });
  await fs.execute('edit', { path: 'id:alpha', changes: { note: 'Original context' } });
  await fs.execute('mv', { path: 'id:work', to: '/Other' });
  assert.equal((await fs.execute('cat', { path: 'id:alpha' })).content.note, 'Original context');
  const copied = await fs.execute('cp', { path: 'id:work', to: '/Bar/Copy', recursive: true });
  assert.equal(copied.entry.note, 'Folder context');
  const copiedFile = copied.created.find(entry => entry.type === 'file' && entry.title === 'Alpha');
  assert.equal((await fs.execute('cat', { path: `id:${copiedFile.id}` })).content.note, 'Original context');
  await fs.execute('edit', { path: 'id:alpha', changes: { note: 'Changed original' } });
  assert.equal((await fs.execute('cat', { path: `id:${copiedFile.id}` })).content.note, 'Original context');
  const removed = await fs.execute('rm', { path: 'id:work', recursive: true });
  assert.ok([...await metadata.getNotes(removed.removed)].every(([, value]) => value === ''));
  assert.equal((await fs.execute('stat', { path: `id:${copied.entry.id}` })).entry.note, 'Folder context');
});

test('note failures report committed Chrome writes and deletion instead of pretending rollback', async () => {
  const createdFixture = fixture();
  createdFixture.failMetadata(method => { if (method === 'set') throw new Error('Metadata quota'); });
  const failure = await rejectsCode(createdFixture.fs.execute('write', { path: '/Other/Committed', content: { url: 'https://example.org/committed', note: 'A note' } }), 'EPARTIAL');
  assert.equal(createdFixture.locate(failure.details.entry.id).url, 'https://example.org/committed');
  const deletedFixture = fixture();
  await deletedFixture.fs.execute('edit', { path: 'id:alpha', changes: { note: 'Keep until deletion' } });
  deletedFixture.failMetadata(method => { if (method === 'remove') throw new Error('Metadata unavailable'); });
  const deletion = await rejectsCode(deletedFixture.fs.execute('rm', { path: 'id:alpha' }), 'EPARTIAL');
  assert.deepEqual(deletion.details.removed, ['alpha']);
  assert.equal(deletedFixture.locate('alpha'), undefined);
});

test('exclusive writes do not overwrite an existing bookmark or note', async () => {
  const { fs } = fixture();
  await fs.execute('edit', { path: 'id:alpha', changes: { note: 'Keep context' } });
  await rejectsCode(fs.execute('write', { path: 'id:alpha', exclusive: true, content: { url: 'https://wrong.example/', note: 'Wrong' } }), 'EEXIST');
  const document = (await fs.execute('cat', { path: 'id:alpha' })).content;
  assert.equal(document.url, 'https://example.org/Needle');
  assert.equal(document.note, 'Keep context');
});

test('Inbox is lazy, exposes notes, preserves identity on dedupe, and recreates only on the next capture', async () => {
  const { fs, writes } = fixture();
  assert.deepEqual(await fs.execute('inbox'), { entry: null, entries: [] });
  assert.deepEqual(writes(), []);
  const captured = await fs.execute('capture', { url: 'https://example.org/inbox', title: 'Inbox paper', note: 'Review later' });
  const repeated = await fs.execute('capture', { url: 'https://example.org/inbox' });
  assert.equal(repeated.entry.id, captured.entry.id);
  assert.equal(repeated.created, false);
  assert.equal((await fs.execute('inbox')).entries[0].note, 'Review later');
  await fs.execute('rm', { path: `id:${captured.inbox.id}`, recursive: true });
  assert.deepEqual(await fs.execute('inbox'), { entry: null, entries: [] });
  const next = await fs.execute('capture', { url: 'https://example.org/next' });
  assert.notEqual(next.inbox.id, captured.inbox.id);
});

test('transfer operation schemas expose read-only export and additive nondestructive import', () => {
  assert.equal(OPERATIONS.export.readOnly, true);
  assert.equal(OPERATIONS.import.readOnly, false);
  assert.equal(OPERATIONS.import.destructive, false);
  assert.doesNotThrow(() => validateOperation('export', {}));
  assert.doesNotThrow(() => validateOperation('import', { html: '<DL></DL>', to: 'id:other', title: '' }));
  for (const args of [{ html: '<DL></DL>' }, { to: 'id:other' }, { html: 42, to: 'id:other' }, { html: '<DL></DL>', to: 'id:other', overwrite: true }]) {
    assert.throws(() => validateOperation('import', args), error => error.code === 'EINVAL');
  }
});

test('export reads every descendant and browser root note without creating Inbox or writing metadata', async () => {
  const { fs, locate, metadata, writes, failMetadata } = fixture();
  let parent = locate('sub');
  for (let index = 0; index < 30; index++) {
    const child = { id: `export-depth-${index}`, title: `Depth ${index}`, children: [] };
    parent.children.push(child);
    parent = child;
  }
  parent.children.push({ id: 'export-leaf', title: 'Far leaf', url: 'https://far.example/' });
  await metadata.setNote('profile-root', 'Virtual root context');
  await metadata.setNote('bar-local', 'Toolbar context');
  await metadata.setNote('work', 'Work context');
  await metadata.setNote('export-leaf', 'Thirty levels down');
  await metadata.setInboxId('work');
  failMetadata(method => { assert.equal(method, 'get', 'export must not write metadata'); });
  const result = await fs.execute('export');
  const parsed = parseBookmarkHTML(result.html);
  assert.equal(parsed.rootNote, 'Virtual root context');
  assert.deepEqual(parsed.nodes.map(node => node.title), ['Bar', 'Account Bar', 'Other', 'Policy']);
  assert.equal(parsed.nodes[0].note, 'Toolbar context');
  const work = parsed.nodes[0].children.find(node => node.title === 'Work');
  assert.equal(work.note, 'Work context');
  assert.equal(work.inbox, true);
  let far = work.children.find(node => node.title === 'Sub').children.find(node => node.title === 'Depth 0');
  for (let index = 1; index < 30; index++) far = far.children[0];
  assert.deepEqual(far.children, [{ title: 'Far leaf', url: 'https://far.example/', note: 'Thirty levels down' }]);
  assert.deepEqual(result.summary, parsed.summary);
  assert.equal(result.summary.notes, 4);
  assert.ok(result.html.includes('PERSONAL_TOOLBAR_FOLDER="true"'));
  assert.deepEqual(writes(), []);
});

test('selected folder export includes the selected folder and its structurally bound note', async () => {
  const { fs, metadata, writes } = fixture();
  await metadata.setNote('profile-root', 'Do not export this');
  await metadata.setNote('work', 'Selected folder note');
  await metadata.setInboxId('other');
  const result = await fs.execute('export', { path: 'id:work' });
  const parsed = parseBookmarkHTML(result.html);
  assert.equal(parsed.rootNote, '');
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.nodes[0].title, 'Work');
  assert.equal(parsed.nodes[0].note, 'Selected folder note');
  assert.equal(parsed.nodes[0].inbox, undefined);
  assert.deepEqual(result.summary, { bookmarks: 2, folders: 2, notes: 1 });
  assert.deepEqual(writes(), []);
});

test('import creates one new container with new IDs and independent duplicate notes, never merges', async () => {
  const { fs, metadata, locate, writes } = fixture();
  const nodes = [
    { title: 'Work', note: 'New folder', inbox: true, children: [
      { title: 'Twin', url: 'https://a.example/', note: 'first\n雪' },
      { title: 'Twin', url: 'https://a.example/', note: 'second\u0000\ud800' },
      { title: '', note: 'Empty folder', children: [] },
    ] },
  ];
  const html = serializeBookmarkHTML({ nodes, rootNote: 'Imported root context' });
  await metadata.setNote('twin-a', 'Keep original note');
  const first = await fs.execute('import', { html, to: 'id:bar-local', title: 'Work' });
  assert.equal(first.entry.title, 'Work');
  assert.equal(first.entry.parentId, 'bar-local');
  assert.equal(first.entry.note, 'Imported root context');
  assert.deepEqual(first.summary, { bookmarks: 2, folders: 2, notes: 5 });
  const container = locate(first.entry.id);
  assert.notEqual(container.id, 'work');
  assert.equal(container.children.length, 1);
  const importedWork = container.children[0];
  assert.deepEqual(first.inbox, { importedId: importedWork.id, activeId: importedWork.id, restored: true });
  assert.equal(await metadata.getInboxId(), importedWork.id);
  assert.deepEqual(importedWork.children.map(node => node.title), ['Twin', 'Twin', '']);
  assert.deepEqual([...await metadata.getNotes(importedWork.children.map(node => node.id))].map(([, note]) => note), ['first\n雪', 'second\u0000\ud800', 'Empty folder']);
  assert.equal(locate('work').children[0].id, 'alpha');
  assert.equal((await fs.execute('cat', { path: 'id:twin-a' })).content.note, 'Keep original note');
  assert.ok(writes().every(call => call.method === 'create'));
  const second = await fs.execute('import', { html, to: 'id:bar-local', title: 'Work' });
  assert.notEqual(second.entry.id, first.entry.id);
  assert.equal(second.inbox.activeId, importedWork.id);
  assert.equal(second.inbox.restored, false);
});

test('import preserves every existing valid Inbox association, including rename-protected browser folders', async () => {
  const html = serializeBookmarkHTML({ nodes: [{ title: 'Imported Inbox', inbox: true, children: [] }] });
  for (const current of ['work', 'bar-local', 'bar-account', 'other']) {
    const { fs, metadata, locate } = fixture();
    await metadata.setInboxId(current);
    const result = await fs.execute('import', { html, to: 'id:other' });
    assert.equal(result.inbox.activeId, current);
    assert.equal(result.inbox.restored, false);
    assert.equal(result.inbox.importedId, locate(result.entry.id).children[0].id);
    assert.equal(await metadata.getInboxId(), current);
  }
});

test('a single imported marker restores missing, stale, nonfolder and policy-protected Inbox associations', async () => {
  const html = serializeBookmarkHTML({ nodes: [{ title: '', inbox: true, children: [] }] });
  for (const current of [undefined, 'missing', 'alpha', 'profile-root', 'policy', 'policy-folder']) {
    const { fs, metadata } = fixture();
    if (current !== undefined) await metadata.setInboxId(current);
    const result = await fs.execute('import', { html, to: 'id:other' });
    assert.equal(result.inbox.restored, true);
    assert.equal(result.inbox.activeId, result.inbox.importedId);
    assert.equal(await metadata.getInboxId(), result.inbox.importedId);
  }
});

test('plain Chrome Inbox names never establish an association and default container title is applied', async () => {
  const { fs, metadata, locate } = fixture();
  const result = await fs.execute('import', { html: '<DL><DT><H3>AnyMark Inbox</H3><DL><DT><A HREF="chrome://bookmarks/"></A></DL></DL>', to: 'id:other' });
  assert.equal(result.entry.title, '导入的书签');
  assert.deepEqual(result.summary, { bookmarks: 1, folders: 1, notes: 0 });
  assert.deepEqual(result.inbox, { restored: false });
  assert.equal(await metadata.getInboxId(), undefined);
  assert.equal(locate(result.entry.id).children[0].children[0].title, '');
  const empty = await fs.execute('import', { html: '<DL></DL>', to: 'id:other', title: '' });
  assert.equal(empty.entry.title, '');
  assert.deepEqual(locate(empty.entry.id).children, []);
});

test('invalid transfer content is fully rejected before Chrome or metadata access and any mutation', async () => {
  const good = '<DT><A HREF="https://good.example/">Good first item</A>';
  const version = '<META NAME="anymark-export-version" CONTENT="1">';
  for (const html of [
    '', 'not bookmarks',
    `<DL>${good}<DT><A HREF="/relative">Bad later URL</A></DL>`,
    '<META NAME="anymark-export-version" CONTENT="2"><DL></DL>',
    `${version}<DL>${good}<DT><A HREF="https://bad.example/" DATA-ANYMARK-NOTE="!">Bad later note</A></DL>`,
    `${version}<DL><DT><H3 DATA-ANYMARK-INBOX="1">One</H3><DL></DL><DT><H3 DATA-ANYMARK-INBOX="1">Two</H3><DL></DL></DL>`,
  ]) {
    const { fs, calls, writes, failMetadata } = fixture();
    failMetadata(() => assert.fail('invalid HTML must not access metadata'));
    await rejectsCode(fs.execute('import', { html, to: 'id:other' }), 'EINVAL');
    assert.deepEqual(calls, []);
    assert.deepEqual(writes(), []);
  }
});

test('import destination must already exist and accept children; metadata preflight errors do not create', async () => {
  for (const [to, code] of [['/', 'EROFS'], ['id:alpha', 'ENOTDIR'], ['id:policy-folder', 'EROFS'], ['/Other/New', 'ENOENT']]) {
    const { fs, writes } = fixture();
    await rejectsCode(fs.execute('import', { html: '<DL></DL>', to }), code);
    assert.deepEqual(writes(), []);
  }
  const { fs, writes, failMetadata } = fixture();
  failMetadata(method => { if (method === 'get') throw new Error('Metadata unavailable'); });
  await rejectsCode(fs.execute('import', { html: '<DL></DL>', to: 'id:other' }), 'EIO');
  assert.deepEqual(writes(), []);
});

test('failed first container creation is not falsely reported as a committed partial import', async () => {
  const { fs, failWith, locate } = fixture();
  failWith(method => { if (method === 'create') throw new Error('Create refused'); });
  await rejectsCode(fs.execute('import', { html: '<DL></DL>', to: 'id:other' }), 'EIO');
  assert.deepEqual(locate('other').children, []);
});

test('mid-import Chrome failure reports exactly the committed IDs and inspectable container without rollback/replay', async () => {
  const { fs, failWith, locate, writes } = fixture();
  let creates = 0;
  failWith(method => { if (method === 'create' && ++creates === 3) throw new Error('Child create failed'); });
  const html = serializeBookmarkHTML({ nodes: [{ title: 'Folder', children: [{ title: 'Failing child', url: 'https://example.org/' }] }] });
  const failure = await rejectsCode(fs.execute('import', { html, to: 'id:other' }), 'EPARTIAL');
  assert.deepEqual(failure.details.created, ['100', '101']);
  assert.equal(failure.details.entry.id, '100');
  assert.equal(failure.details.entry.path, `/Other~other/${canonical('导入的书签', '100')}`);
  assert.equal(failure.details.cause.message, 'Child create failed');
  assert.equal(locate('100').children[0].id, '101');
  assert.deepEqual(locate('101').children, []);
  assert.equal(creates, 3);
  assert.ok(writes().every(call => call.method === 'create'));
});

test('root-note metadata failure reports the committed container and stops creating descendants', async () => {
  const { fs, failMetadata, locate, writes } = fixture();
  failMetadata(method => { if (method === 'set') throw new Error('Root note quota'); });
  const html = serializeBookmarkHTML({ rootNote: 'Root', nodes: [{ title: 'Not created', url: 'https://example.org/' }] });
  const failure = await rejectsCode(fs.execute('import', { html, to: 'id:other' }), 'EPARTIAL');
  assert.deepEqual(failure.details.created, ['100']);
  assert.equal(failure.details.entry.id, '100');
  assert.equal(failure.details.entry.note, '');
  assert.equal(failure.details.cause.message, 'Root note quota');
  assert.deepEqual(locate('100').children, []);
  assert.equal(writes().length, 1);
});

test('item-note metadata failure preserves earlier committed notes and does not replay writes', async () => {
  const { fs, metadata, failMetadata, locate, writes } = fixture();
  let sets = 0;
  failMetadata(method => { if (method === 'set' && ++sets === 2) throw new Error('Second note failed'); });
  const html = serializeBookmarkHTML({ nodes: [
    { title: 'Same', url: 'https://same.example/', note: 'First saved' },
    { title: 'Same', url: 'https://same.example/', note: 'Second failed' },
    { title: 'Never created', children: [] },
  ] });
  const failure = await rejectsCode(fs.execute('import', { html, to: 'id:other' }), 'EPARTIAL');
  assert.deepEqual(failure.details.created, ['100', '101', '102']);
  assert.deepEqual(locate('100').children.map(node => node.id), ['101', '102']);
  assert.deepEqual([...await metadata.getNotes(['101', '102'])], [['101', 'First saved'], ['102', '']]);
  assert.equal(writes().length, 3);
  assert.equal(sets, 2);
});

test('Inbox association metadata failure reports all committed nodes and retains the previous association', async () => {
  const { fs, metadata, failMetadata, locate, writes } = fixture();
  await metadata.setInboxId('stale-id');
  failMetadata(method => { if (method === 'set') throw new Error('Association failed'); });
  const html = serializeBookmarkHTML({ nodes: [{ title: 'Imported Inbox', inbox: true, children: [{ title: 'Link', url: 'https://example.org/' }] }] });
  const failure = await rejectsCode(fs.execute('import', { html, to: 'id:other' }), 'EPARTIAL');
  assert.deepEqual(failure.details.created, ['100', '101', '102']);
  assert.equal(failure.details.entry.id, '100');
  assert.equal(failure.details.cause.message, 'Association failed');
  assert.equal(locate('101').children[0].id, '102');
  assert.equal(await metadata.getInboxId(), 'stale-id');
  assert.equal(writes().length, 3);
});
