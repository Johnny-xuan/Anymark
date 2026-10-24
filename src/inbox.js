import { BridgeError, errorPayload, validateOperation } from './protocol.js';

function normalizedUrl(value) {
  try { return new URL(value).href; }
  catch { return undefined; }
}

function resolveInbox(tree, id) {
  if (!Array.isArray(tree) || tree.length !== 1 || !tree[0] || typeof tree[0].id !== 'string') {
    throw new BridgeError('EIO', 'Chrome returned an invalid bookmark root.');
  }
  let inbox;
  const visit = (node, root, managed) => {
    if (!node || typeof node.id !== 'string' || (node.children !== undefined && !Array.isArray(node.children))) {
      throw new BridgeError('EIO', 'Chrome returned an invalid bookmark tree.');
    }
    const protectedByPolicy = managed || !!node.unmodifiable || node.folderType === 'managed';
    if (node.id === id && !root && typeof node.url !== 'string' && !protectedByPolicy) inbox = node;
    for (const child of node.children || []) visit(child, false, protectedByPolicy);
  };
  visit(tree[0], true, false);
  return inbox;
}

/** Capture is serialized by the caller together with other bookmark writes. */
export class InboxService {
  constructor(bookmarks, metadata) {
    this.bookmarks = bookmarks;
    this.metadata = metadata;
  }

  async call(method, ...args) {
    try { return await this.bookmarks[method](...args); }
    catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError(error?.code || 'EIO', error?.message || String(error), { method });
    }
  }

  async capture(args) {
    validateOperation('capture', args);
    const url = normalizedUrl(args.url);
    if (!url || !['http:', 'https:'].includes(new URL(url).protocol)) {
      throw new BridgeError('EINVAL', 'Inbox capture requires an absolute HTTP(S) URL.');
    }
    const storedId = await this.metadata.getInboxId();
    let inbox = resolveInbox(await this.call('getTree'), storedId);
    let inboxId = inbox?.id;
    let bookmarkId;
    const created = [];
    try {
      if (!inbox) {
        // Omit parentId: Chrome chooses the appropriate default storage folder.
        inbox = await this.call('create', { title: 'AnyMark Inbox' });
        inboxId = inbox.id;
        created.push(inboxId);
        await this.metadata.setInboxId(inboxId);
      }
      const existing = (inbox.children || []).find(node => typeof node.url === 'string' && normalizedUrl(node.url) === url);
      if (existing) {
        bookmarkId = existing.id;
      } else {
        const bookmark = await this.call('create', { parentId: inboxId, title: args.title ?? url, url });
        bookmarkId = bookmark.id;
        created.push(bookmarkId);
      }
      if (Object.hasOwn(args, 'note')) await this.metadata.setNote(bookmarkId, args.note);
      return { bookmarkId, inboxId, created: !existing };
    } catch (error) {
      if (created.length > 0) {
        throw new BridgeError('EPARTIAL', 'Capture failed after creating Chrome entries; these entries were not rolled back.', {
          created,
          inboxId,
          ...(bookmarkId === undefined ? {} : { bookmarkId }),
          cause: errorPayload(error),
        });
      }
      throw error;
    }
  }
}
