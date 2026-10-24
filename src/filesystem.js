import { BridgeError, errorPayload, validateOperation } from './protocol.js';
import { InboxService } from './inbox.js';
import { parseBookmarkHTML, serializeBookmarkHTML } from './transfer.js';

const fail = (code, message, details) => { throw new BridgeError(code, message, details); };
const isFile = node => typeof node.url === 'string';
const segment = (title, id) => `${encodeURIComponent(title).replace(/~/g, '%7E')}~${id}`;

function parsePath(path) {
  if (path.startsWith('id:')) {
    if (path.length === 3) fail('EINVAL', 'An ID address must include a bookmark ID.');
    return { id: path.slice(3) };
  }
  if (!path.startsWith('/')) fail('EINVAL', 'Paths must be absolute or use id:<bookmarkId>.');
  const parts = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return {
    parts: parts.map(part => {
      const separator = part.lastIndexOf('~');
      const encodedTitle = separator < 0 ? part : part.slice(0, separator);
      let title;
      try { title = decodeURIComponent(encodedTitle); }
      catch { fail('EINVAL', 'Path contains invalid percent encoding.', { path }); }
      const id = separator < 0 ? undefined : part.slice(separator + 1);
      if (id === '') fail('EINVAL', 'A canonical path segment must include an ID.', { path });
      return { title, id };
    }),
    directory: path.endsWith('/') || path.endsWith('/.') || path.endsWith('/..'),
  };
}

class Snapshot {
  constructor(tree) {
    if (!Array.isArray(tree) || tree.length !== 1) fail('EIO', 'Chrome returned an invalid bookmark root.');
    this.records = new Map();
    this.notes = new Map();
    const visit = (node, parent, index) => {
      const record = { node, parent, index, children: [] };
      this.records.set(node.id, record);
      record.children = (node.children || []).map((child, i) => visit(child, record, i));
      return record;
    };
    this.root = visit(tree[0], null, undefined);
  }

  managed(record) {
    for (let current = record; current; current = current.parent) {
      if (current.node.unmodifiable || current.node.folderType === 'managed') return true;
    }
    return false;
  }

  readonly(record) {
    return !record.parent || record.parent === this.root || !!record.node.folderType || this.managed(record);
  }

  path(record) {
    return record.parent ? `${record.parent === this.root ? '' : this.path(record.parent)}/${segment(record.node.title, record.node.id)}` : '/';
  }

  entry(record) {
    const node = record.node;
    return {
      id: node.id,
      path: this.path(record),
      name: node.title,
      title: node.title,
      type: isFile(node) ? 'file' : 'directory',
      note: this.notes.get(node.id) || '',
      ...(record.parent ? { parentId: record.parent.node.id, index: node.index ?? record.index } : {}),
      ...(isFile(node) ? { url: node.url } : {}),
      readonly: this.readonly(record),
      childrenWritable: !isFile(node) && record !== this.root && !this.managed(record),
    };
  }

  directory(record) {
    if (isFile(record.node)) fail('ENOTDIR', 'The entry is not a directory.', { entry: this.entry(record) });
    return record;
  }

  writableDirectory(record) {
    this.directory(record);
    if (!this.entry(record).childrenWritable) fail('EROFS', 'This directory cannot receive children.', { entry: this.entry(record) });
    return record;
  }

  mutable(record) {
    if (this.readonly(record)) fail('EROFS', 'The entry is read-only.', { entry: this.entry(record) });
  }

  resolveParsed(parsed, allowMissing = false) {
    if (parsed.id !== undefined) {
      const record = this.records.get(parsed.id);
      if (!record) fail('ENOENT', 'No bookmark has this ID.', { id: parsed.id });
      return { record };
    }
    let record = this.root;
    for (let i = 0; i < parsed.parts.length; i++) {
      this.directory(record);
      const part = parsed.parts[i];
      const matches = record.children.filter(child => child.node.title === part.title && (part.id === undefined || child.node.id === part.id));
      if (matches.length > 1) fail('EAMBIGUOUS', 'The title identifies multiple entries. Use a canonical path or ID.', { candidates: matches.map(child => this.entry(child)) });
      if (matches.length === 0) {
        if (allowMissing && i === parsed.parts.length - 1 && part.id === undefined) {
          return { parent: record, title: part.title, directory: parsed.directory };
        }
        fail('ENOENT', 'The bookmark path does not exist.', { title: part.title, ...(part.id === undefined ? {} : { id: part.id }) });
      }
      record = matches[0];
    }
    if (parsed.directory) this.directory(record);
    return { record };
  }

  resolve(path, allowMissing = false) {
    return this.resolveParsed(parsePath(path), allowMissing);
  }

  available(parent, title, except) {
    const collisions = parent.children.filter(child => child !== except && child.node.title === title);
    if (collisions.length) fail('EEXIST', 'An entry with this title already exists.', { candidates: collisions.map(child => this.entry(child)) });
  }

  destination(source, path, moving = false) {
    const target = this.resolve(path, true);
    if (target.record && isFile(target.record.node)) fail('EEXIST', 'The destination already exists.', { entry: this.entry(target.record) });
    if (!target.record && target.directory && isFile(source.node)) fail('ENOTDIR', 'A bookmark destination cannot end in a directory separator.');
    const parent = target.record ? target.record : target.parent;
    const title = target.record ? source.node.title : target.title;
    this.writableDirectory(parent);
    for (let ancestor = parent; ancestor; ancestor = ancestor.parent) {
      if (ancestor === source) fail('EINVAL', 'An entry cannot be moved or copied inside itself.');
    }
    if (!moving || parent !== source.parent || title !== source.node.title) this.available(parent, title, moving ? source : undefined);
    return { parent, title };
  }

  add(node, parent) {
    const record = { node, parent, index: node.index ?? parent.children.length, children: [] };
    parent.children.splice(record.index, 0, record);
    this.records.set(node.id, record);
    this.reindex(parent);
    return record;
  }

  reindex(parent) {
    parent.children.forEach((child, index) => {
      child.index = index;
      child.node = { ...child.node, index };
    });
  }
}

/** A per-request view over the Promise-based Chrome bookmarks API (Chrome 90+). */
export class BookmarkFilesystem {
  constructor(bookmarks, metadata) {
    if (!metadata) throw new TypeError('BookmarkFilesystem requires a MetadataStore.');
    this.bookmarks = bookmarks;
    this.metadata = metadata;
    this.inbox = new InboxService(bookmarks, metadata);
  }

  async call(method, ...args) {
    try { return await this.bookmarks[method](...args); }
    catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError(error?.code || 'EIO', error?.message || String(error), { method });
    }
  }

  async snapshot() {
    const snapshot = new Snapshot(await this.call('getTree'));
    snapshot.notes = await this.metadata.getNotes([...snapshot.records.keys()]);
    return snapshot;
  }

  async execute(operation, args = {}) {
    validateOperation(operation, args);
    if (operation === 'write' && !URL.canParse(args.content.url)) {
      fail('EINVAL', 'A bookmark URL must be an absolute URL; empty content cannot create a directory.');
    }
    const imported = operation === 'import' ? parseBookmarkHTML(args.html) : undefined;
    const captured = operation === 'capture' ? await this.inbox.capture(args) : undefined;
    let snapshot;
    try { snapshot = await this.snapshot(); } catch (error) {
      if (captured) fail('EPARTIAL', 'The link was captured, but its current result could not be read.', { ...captured, cause: errorPayload(error) });
      throw error;
    }
    const entry = record => snapshot.entry(record);
    const persistNote = async (record, note, chromeChanged = false) => {
      if (note === undefined) return;
      try {
        await this.metadata.setNote(record.node.id, note);
        snapshot.notes.set(record.node.id, note);
      } catch (error) {
        if (chromeChanged) fail('EPARTIAL', 'Chrome changed, but the local note could not be saved.', { entry: entry(record), cause: errorPayload(error) });
        throw error;
      }
    };
    if (operation === 'inbox' || captured) {
      const inboxId = captured?.inboxId ?? await this.metadata.getInboxId();
      const folder = snapshot.records.get(inboxId);
      if (!folder || isFile(folder.node)) {
        if (captured) fail('ECHANGED', 'Inbox changed while saving; inspect the current Chrome state.', captured);
        return { entry: null, entries: [] };
      }
      if (!captured) return { entry: entry(folder), entries: folder.children.map(entry) };
      const record = snapshot.records.get(captured.bookmarkId);
      if (!record) fail('ECHANGED', 'The captured bookmark changed before its result could be read.', captured);
      return { entry: entry(record), inbox: entry(folder), created: captured.created };
    }

    if (operation === 'export') {
      const record = snapshot.directory(snapshot.resolve(args.path ?? '/').record);
      const inboxId = await this.metadata.getInboxId();
      const rootNote = record === snapshot.root ? snapshot.notes.get(record.node.id) || '' : '';
      const summary = { bookmarks: 0, folders: 0, notes: rootNote ? 1 : 0 };
      const transferNode = current => {
        const note = snapshot.notes.get(current.node.id) || '';
        if (note) summary.notes++;
        if (isFile(current.node)) {
          summary.bookmarks++;
          return { title: current.node.title, url: current.node.url, ...(note ? { note } : {}) };
        }
        summary.folders++;
        return {
          title: current.node.title,
          children: current.children.map(transferNode),
          ...(note ? { note } : {}),
          ...(current.node.id === inboxId ? { inbox: true } : {}),
          ...(current.node.folderType ? { folderType: current.node.folderType } : {}),
        };
      };
      const nodes = (record === snapshot.root ? record.children : [record]).map(transferNode);
      return { html: serializeBookmarkHTML({ nodes, rootNote }), summary };
    }

    if (operation === 'import') {
      const destination = snapshot.writableDirectory(snapshot.resolve(args.to).record);
      const storedInboxId = await this.metadata.getInboxId();
      const storedInbox = snapshot.records.get(storedInboxId);
      let activeId = storedInbox && entry(storedInbox).childrenWritable ? storedInboxId : undefined;
      let importedId;
      let container;
      const created = [];
      const create = async (source, parent) => {
        const node = await this.call('create', {
          parentId: parent.node.id,
          title: source.title,
          ...(source.url === undefined ? {} : { url: source.url }),
        });
        created.push(node.id);
        const record = snapshot.add(node, parent);
        if (!container) container = record;
        if (source.inbox) importedId = node.id;
        if (source.note) {
          await this.metadata.setNote(node.id, source.note);
          snapshot.notes.set(node.id, source.note);
        }
        for (const child of source.children || []) await create(child, record);
        return record;
      };
      try {
        await create({ title: args.title ?? '导入的书签', note: imported.rootNote, children: imported.nodes }, destination);
        let restored = false;
        if (importedId !== undefined && activeId === undefined) {
          await this.metadata.setInboxId(importedId);
          activeId = importedId;
          restored = true;
        }
        return {
          entry: entry(container),
          summary: imported.summary,
          inbox: { ...(importedId === undefined ? {} : { importedId }), ...(activeId === undefined ? {} : { activeId }), restored },
        };
      } catch (error) {
        if (created.length) fail('EPARTIAL', 'Import failed after creating Chrome entries; these entries were not rolled back.', {
          ...(container ? { entry: entry(container) } : {}),
          created,
          cause: errorPayload(error),
        });
        throw error;
      }
    }

    if (operation === 'mkdir' || operation === 'write') {
      const target = snapshot.resolve(args.path, true);
      if (operation === 'mkdir') {
        if (target.record) fail('EEXIST', 'The target already exists.', { entry: entry(target.record) });
        snapshot.writableDirectory(target.parent);
        snapshot.available(target.parent, target.title);
        const node = await this.call('create', { parentId: target.parent.node.id, title: target.title });
        const record = snapshot.add(node, target.parent);
        await persistNote(record, args.note, true);
        return { entry: entry(record) };
      }
      if (target.record) {
        if (args.exclusive) fail('EEXIST', 'The target already exists; exclusive creation cannot overwrite it.', { entry: entry(target.record) });
        const record = target.record;
        if (!isFile(record.node)) fail('EISDIR', 'Cannot write bookmark content to a directory.', { entry: entry(record) });
        snapshot.mutable(record);
        const title = args.content.title ?? record.node.title;
        if (title !== record.node.title) snapshot.available(record.parent, title, record);
        record.node = { ...record.node, ...await this.call('update', record.node.id, { ...(args.content.title === undefined ? {} : { title }), url: args.content.url }) };
        await persistNote(record, args.content.note, true);
        return { entry: entry(record), created: false };
      }
      if (target.directory) fail('ENOTDIR', 'A bookmark target cannot end in a directory separator.');
      snapshot.writableDirectory(target.parent);
      const title = args.content.title ?? target.title;
      snapshot.available(target.parent, title);
      const node = await this.call('create', { parentId: target.parent.node.id, title, url: args.content.url });
      const record = snapshot.add(node, target.parent);
      await persistNote(record, args.content.note, true);
      return { entry: entry(record), created: true };
    }

    const record = snapshot.resolve(args.path).record;
    switch (operation) {
      case 'stat': return { entry: entry(record) };
      case 'ls':
        snapshot.directory(record);
        return { entry: entry(record), entries: record.children.map(entry) };
      case 'cat':
        if (!isFile(record.node)) fail('EISDIR', 'Directories have no bookmark document.', { entry: entry(record) });
        return { entry: entry(record), content: { title: record.node.title, url: record.node.url, note: snapshot.notes.get(record.node.id) || '' } };
      case 'edit': {
        if (!Object.keys(args.changes).length) fail('EINVAL', 'At least one changed field is required.');
        const { note, ...changes } = args.changes;
        const chromeChanged = Object.keys(changes).length > 0;
        if (chromeChanged) {
          snapshot.mutable(record);
          if (changes.url !== undefined) {
            if (!isFile(record.node)) fail('EISDIR', 'Folders cannot have a bookmark URL.');
            if (!URL.canParse(changes.url)) fail('EINVAL', 'A bookmark URL must be an absolute URL.');
          }
          if (changes.title !== undefined && changes.title !== record.node.title) snapshot.available(record.parent, changes.title, record);
          record.node = { ...record.node, ...await this.call('update', record.node.id, changes) };
        }
        await persistNote(record, note, chromeChanged);
        return { entry: entry(record) };
      }
      case 'tree': {
        snapshot.directory(record);
        const branch = (current, depth) => ({ ...entry(current), ...(!isFile(current.node) && depth > 0 ? { children: current.children.map(child => branch(child, depth - 1)) } : {}) });
        const depth = args.depth ?? 3;
        return { entry: entry(record), children: depth === 0 ? [] : record.children.map(child => branch(child, depth - 1)) };
      }
      case 'find': {
        snapshot.directory(record);
        const query = args.query.toLowerCase();
        const limit = args.limit ?? 100;
        const entries = [];
        let truncated = false;
        const visit = current => {
          if (current.node.title.toLowerCase().includes(query) || (current.node.url || '').toLowerCase().includes(query) || (snapshot.notes.get(current.node.id) || '').toLowerCase().includes(query)) {
            if (entries.length === limit) { truncated = true; return; }
            entries.push(entry(current));
          }
          for (const child of current.children) {
            visit(child);
            if (truncated) break;
          }
        };
        for (const child of record.children) {
          visit(child);
          if (truncated) break;
        }
        return { entries, truncated };
      }
      case 'mv': {
        snapshot.mutable(record);
        const target = snapshot.destination(record, args.to, true);
        const oldParent = record.parent;
        const moving = target.parent !== oldParent || args.index !== undefined;
        let moved = false;
        try {
          if (moving) {
            const node = await this.call('move', record.node.id, { parentId: target.parent.node.id, ...(args.index === undefined ? {} : { index: args.index }) });
            oldParent.children.splice(oldParent.children.indexOf(record), 1);
            snapshot.reindex(oldParent);
            record.parent = target.parent;
            record.node = { ...record.node, ...node };
            target.parent.children.splice(node.index ?? target.parent.children.length, 0, record);
            snapshot.reindex(target.parent);
            moved = true;
          }
          if (target.title !== record.node.title) {
            record.node = { ...record.node, ...await this.call('update', record.node.id, { title: target.title }) };
          }
        } catch (error) {
          if (moved) fail('EPARTIAL', 'The entry was moved, but its rename failed.', { entry: entry(record), cause: errorPayload(error) });
          throw error;
        }
        return { entry: entry(record) };
      }
      case 'cp': {
        if (!isFile(record.node) && !args.recursive) fail('EISDIR', 'Copying a directory requires recursive=true.');
        const target = snapshot.destination(record, args.to);
        const created = [];
        const copy = async (source, parent, title) => {
          const node = await this.call('create', { parentId: parent.node.id, title, ...(isFile(source.node) ? { url: source.node.url } : {}) });
          const result = snapshot.add(node, parent);
          created.push(entry(result));
          const note = snapshot.notes.get(source.node.id) || '';
          if (note) {
            await this.metadata.setNote(node.id, note);
            snapshot.notes.set(node.id, note);
            created[created.length - 1] = entry(result);
          }
          for (const child of source.children) await copy(child, result, child.node.title);
          return result;
        };
        try {
          const result = await copy(record, target.parent, target.title);
          return { entry: entry(result), created };
        } catch (error) {
          if (created.length) fail('EPARTIAL', 'Copy failed after creating entries; these entries were not rolled back.', { created, cause: errorPayload(error) });
          throw error;
        }
      }
      case 'rm': {
        snapshot.mutable(record);
        if (record.children.length && !args.recursive) fail('ENOTEMPTY', 'Removing a nonempty directory requires recursive=true.');
        const removed = [];
        const visit = current => {
          snapshot.mutable(current);
          removed.push(current.node.id);
          current.children.forEach(visit);
        };
        visit(record);
        await this.call(!isFile(record.node) && args.recursive ? 'removeTree' : 'remove', record.node.id);
        try { await this.metadata.removeNotes(removed); } catch (error) {
          fail('EPARTIAL', 'Bookmarks were deleted, but their local metadata could not be removed.', { removed, cause: errorPayload(error) });
        }
        return { removed };
      }
      default: fail('ENOSYS', `Unknown operation: ${operation}`);
    }
  }
}
