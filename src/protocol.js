export const VERSION = '2.0.0';
export const PROTOCOL_VERSION = 1;
export const HOST_NAME = 'tech.jox.anymark';
export const EXTENSION_ID = 'mclghccgkbcplflclphcnkcajngcklck';
export const MAX_REQUEST_BYTES = 1024 * 1024;
export const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

const path = { type: 'string', description: 'Absolute virtual path or id:<bookmarkId>. Title-only paths must be unambiguous.' };
const recursive = { type: 'boolean', default: false };
const destination = { type: 'string', description: 'Existing destination directory or a new absolute target path. Never overwrites.' };
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const OPERATIONS = {
  ls: { readOnly: true, description: 'List immediate directory entries in Chrome order.', schema: schema({ path }, ['path']) },
  stat: { readOnly: true, description: 'Read identity, current canonical path, type and protection metadata.', schema: schema({ path }, ['path']) },
  cat: { readOnly: true, description: 'Read a bookmark JSON document (title, URL and local note), not the webpage.', schema: schema({ path }, ['path']) },
  tree: { readOnly: true, description: 'Read a directory tree with bounded depth.', schema: schema({ path, depth: { type: 'integer', minimum: 0, maximum: 12, default: 3 } }, ['path']) },
  find: { readOnly: true, description: 'Find bookmarks and folders by title, URL or local note within a directory.', schema: schema({ path, query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } }, ['path', 'query']) },
  export: { readOnly: true, description: 'Export all descendants as one Chrome-compatible HTML file with structurally attached local notes. Omitted path exports all browser roots; does not create Inbox.', schema: schema({ path }) },
  import: { readOnly: false, destructive: false, description: 'Import Chrome/AnyMark bookmark HTML into a new container in an existing writable folder. Validates before creating, never merges or overwrites; partial failures report committed IDs.', schema: schema({ html: { type: 'string' }, to: { type: 'string', description: 'Existing writable Chrome folder, not the virtual root.' }, title: { type: 'string', default: '导入的书签' } }, ['html', 'to']) },
  mkdir: { readOnly: false, description: 'Create a directory with an optional local note. Does not overwrite an existing name.', schema: schema({ path, note: { type: 'string' } }, ['path']) },
  write: { readOnly: false, description: 'Create or update a bookmark document with URL and optional title/note. exclusive=true creates only and never updates an existing target.', schema: schema({ path, exclusive: { type: 'boolean' }, content: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' }, note: { type: 'string' } }, required: ['url'], additionalProperties: false } }, ['path', 'content']) },
  edit: { readOnly: false, description: 'Patch only specified title, URL or local note fields. Folder notes are local metadata; folder URLs are not writable.', schema: schema({ path, changes: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' }, note: { type: 'string' } }, additionalProperties: false } }, ['path', 'changes']) },
  inbox: { readOnly: true, description: 'Read the unorganized Inbox and its notes without creating a folder. Returns entry=null when no Inbox exists.', schema: schema({}) },
  capture: { readOnly: false, destructive: false, description: 'Save an HTTP(S) link to the real Chrome Inbox with an optional note. Creates Inbox only on save; repeated URLs already in Inbox are not duplicated.', schema: schema({ url: { type: 'string' }, title: { type: 'string' }, note: { type: 'string' } }, ['url']) },
  web: { readOnly: false, destructive: false, description: 'Open the AnyMark Web workspace in the selected browser profile. Does not change bookmarks.', schema: schema({}) },
  mv: { readOnly: false, description: 'Move or rename an entry, preserving its ID. Does not overwrite.', schema: schema({ path, to: destination, index: { type: 'integer', minimum: 0 } }, ['path', 'to']) },
  cp: { readOnly: false, description: 'Copy an entry with new IDs. Directories require recursive=true; partial failures report created entries.', schema: schema({ path, to: destination, recursive }, ['path', 'to']) },
  rm: { readOnly: false, description: 'Permanently delete a bookmark or empty directory. Nonempty directories require recursive=true. There is no undo.', schema: schema({ path, recursive }, ['path']) },
};

export class BridgeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function errorPayload(error, fallback = 'EIO') {
  return { code: error?.code || fallback, message: error?.message || String(error), ...(error?.details === undefined ? {} : { details: error.details }) };
}

export function validateOperation(operation, args) {
  if (!Object.hasOwn(OPERATIONS, operation)) throw new BridgeError('ENOSYS', `Unknown operation: ${operation}`);
  const spec = OPERATIONS[operation];
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new BridgeError('EINVAL', 'Arguments must be an object.');
  validateObject(args, spec.schema, 'arguments');
}

function validateObject(value, definition, label) {
  for (const field of definition.required || []) {
    if (!Object.hasOwn(value, field)) throw new BridgeError('EINVAL', `${label}.${field} is required.`);
  }
  for (const [field, item] of Object.entries(value)) {
    if (!Object.hasOwn(definition.properties, field)) throw new BridgeError('EINVAL', `Unknown field: ${label}.${field}`);
    const rule = definition.properties[field];
    const valid = rule.type === 'integer' ? Number.isInteger(item) : rule.type === 'object' ? item !== null && typeof item === 'object' && !Array.isArray(item) : typeof item === rule.type;
    if (!valid) throw new BridgeError('EINVAL', `${label}.${field} must be ${rule.type}.`);
    if (rule.minimum !== undefined && item < rule.minimum || rule.maximum !== undefined && item > rule.maximum) throw new BridgeError('EINVAL', `${label}.${field} is out of range.`);
    if (rule.type === 'object') validateObject(item, rule, `${label}.${field}`);
  }
}
