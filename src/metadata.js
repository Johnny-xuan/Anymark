import { BridgeError } from './protocol.js';

export const NOTE_PREFIX = 'anymark.note.v2:';
export const INBOX_KEY = 'anymark.inbox.v1';
const LEGACY_NOTE_PREFIX = 'anymark.note.v1:';

function requireId(id) {
  if (typeof id !== 'string' || id.length === 0) {
    throw new BridgeError('EINVAL', 'A bookmark ID must be a nonempty string.');
  }
}

function uniqueIds(ids) {
  if (!Array.isArray(ids)) throw new BridgeError('EINVAL', 'Bookmark IDs must be an array.');
  ids.forEach(requireId);
  return [...new Set(ids)];
}

function decodeStoredNote(value, id) {
  try {
    if (typeof value !== 'string') throw new TypeError();
    const note = JSON.parse(value);
    if (typeof note !== 'string') throw new TypeError();
    return note;
  } catch {
    throw new BridgeError('EIO', 'A stored note is malformed; it was not replaced with empty content.', { id });
  }
}

/** Local, per-Chrome-profile metadata; Chrome remains the bookmark database. */
export class MetadataStore {
  constructor(storage) {
    this.storage = storage;
  }

  async call(method, ...args) {
    try { return await this.storage[method](...args); }
    catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError(error?.code || 'EIO', error?.message || String(error), { method: `storage.local.${method}` });
    }
  }

  /** Explicit startup migration; reads and constructors remain side-effect-free. */
  async migrate() {
    const values = await this.call('get', null);
    const updates = {};
    const obsolete = [];
    for (const [key, value] of Object.entries(values)) {
      if (!key.startsWith(LEGACY_NOTE_PREFIX)) continue;
      const id = key.slice(LEGACY_NOTE_PREFIX.length);
      if (!id || typeof value !== 'string') throw new BridgeError('EIO', 'A legacy note cannot be migrated without losing data.', { id });
      const nextKey = NOTE_PREFIX + id;
      if (Object.hasOwn(values, nextKey)) decodeStoredNote(values[nextKey], id);
      else updates[nextKey] = JSON.stringify(value);
      obsolete.push(key);
    }
    if (Object.keys(updates).length) await this.call('set', updates);
    // Keep originals until the replacement write is acknowledged.
    if (obsolete.length) await this.call('remove', obsolete);
  }

  async getNotes(ids) {
    const unique = uniqueIds(ids);
    if (unique.length === 0) return new Map();
    const values = await this.call('get', unique.map(id => NOTE_PREFIX + id));
    return new Map(unique.map(id => {
      const note = values[NOTE_PREFIX + id];
      return [id, note === undefined ? '' : decodeStoredNote(note, id)];
    }));
  }

  async setNote(id, content) {
    requireId(id);
    if (typeof content !== 'string') throw new BridgeError('EINVAL', 'A note must be a string.');
    if (content === '') await this.call('remove', NOTE_PREFIX + id);
    else await this.call('set', { [NOTE_PREFIX + id]: JSON.stringify(content) });
  }

  async removeNotes(ids) {
    const unique = uniqueIds(ids);
    if (unique.length === 0) return;
    const inboxId = await this.getInboxId();
    const keys = unique.map(id => NOTE_PREFIX + id);
    if (inboxId !== undefined && unique.includes(inboxId)) keys.push(INBOX_KEY);
    await this.call('remove', keys);
  }

  async getInboxId() {
    const values = await this.call('get', INBOX_KEY);
    const id = values[INBOX_KEY];
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  }

  async setInboxId(id) {
    requireId(id);
    await this.call('set', { [INBOX_KEY]: id });
  }
}
