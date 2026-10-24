import { parse } from 'parse5';
import { BridgeError } from './protocol.js';

const VERSION_NAME = 'anymark-export-version';
const NOTE = 'data-anymark-note';
const INBOX = 'data-anymark-inbox';
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const ignored = new Set(['script', 'style', 'template', 'iframe', 'object', 'svg', 'math']);
const invalid = message => { throw new BridgeError('EINVAL', message); };
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const usable = node => (!node.namespaceURI || node.namespaceURI === HTML_NAMESPACE) && !ignored.has(node.tagName);
const escapeHTML = value => value.replace(/[&<>"\r]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\r': '&#13;' })[char]);

function encodeNote(note) {
  const bytes = new TextEncoder().encode(JSON.stringify(note));
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  }
  return btoa(chunks.join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeNote(payload) {
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) invalid('Invalid AnyMark note encoding.');
  try {
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const note = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof note !== 'string' || encodeNote(note) !== payload) invalid('Invalid AnyMark note payload.');
    return note;
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    invalid('Invalid AnyMark note payload.');
  }
}

function requireURL(url) {
  if (typeof url !== 'string' || url !== url.trim() || /[\u0000-\u001f\u007f]/.test(url) || !URL.canParse(url)) {
    invalid('Every bookmark must have a valid absolute URL.');
  }
}

function text(node) {
  if (!usable(node)) return '';
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes || []).map(text).join('');
}

/** Parse Netscape/Chrome HTML as inert data, including Chrome's optional DT/P end tags. */
export function parseBookmarkHTML(html) {
  if (typeof html !== 'string' || html.trim() === '') invalid('A bookmark HTML file is required.');
  let duplicateAttributes = false;
  let truncated = false;
  const document = parse(html, { onParseError(error) {
    if (error.code === 'duplicate-attribute') duplicateAttributes = true;
    if (error.code.startsWith('eof-') || error.code === 'open-elements-left-after-eof') truncated = true;
  } });
  if (truncated) invalid('The bookmark HTML file is truncated; no bookmarks were imported.');
  const elements = [];
  const lists = [];
  const collect = (node, inList = false) => {
    if (!usable(node)) return;
    if (node.tagName) elements.push(node);
    if (node.tagName === 'dl' && !inList) lists.push(node);
    for (const child of node.childNodes || []) collect(child, inList || node.tagName === 'dl');
  };
  collect(document);
  const markers = elements.filter(node => node.tagName === 'meta' && attribute(node, 'name')?.toLowerCase() === VERSION_NAME);
  if (markers.length > 1 || markers.length === 1 && attribute(markers[0], 'content') !== '1') {
    invalid('Unsupported or ambiguous AnyMark export version.');
  }
  const anymark = markers.length === 1;
  if (anymark && duplicateAttributes) invalid('Duplicate attributes make AnyMark metadata ambiguous.');
  if (lists.length !== 1) invalid('The file must contain one Netscape bookmarks list.');
  const metadata = new Map();
  let markedInbox;
  let rootNote = '';
  let rootNoteElement;
  if (anymark) {
    for (const node of elements) {
      const payload = attribute(node, NOTE);
      const inbox = attribute(node, INBOX);
      if (payload !== undefined) {
        if (!['h1', 'h3', 'a'].includes(node.tagName)) invalid('An AnyMark note is attached to an invalid element.');
        const note = decodeNote(payload);
        metadata.set(node, note);
        if (node.tagName === 'h1') {
          if (rootNoteElement) invalid('Multiple AnyMark root notes are not supported.');
          rootNoteElement = node;
          rootNote = note;
        }
      }
      if (inbox !== undefined) {
        if (node.tagName !== 'h3' || inbox !== '1' || markedInbox) invalid('The file must mark at most one Inbox folder.');
        markedInbox = node;
      }
    }
  }
  const summary = { bookmarks: 0, folders: 0, notes: rootNote ? 1 : 0 };
  const consumed = new Set(rootNoteElement ? [rootNoteElement] : []);
  const readList = list => {
    const nodes = [];
    let pendingFolder;
    const visit = node => {
      if (!usable(node)) return;
      if (node.tagName === 'dl') {
        if (!pendingFolder) invalid('A nested bookmarks list has no folder heading.');
        const folder = pendingFolder;
        pendingFolder = undefined;
        folder.children = readList(node);
        return;
      }
      if (node.tagName === 'h3' || node.tagName === 'a') {
        consumed.add(node);
        const item = { title: text(node) };
        if (metadata.has(node)) {
          item.note = metadata.get(node);
          if (item.note) summary.notes++;
        }
        if (node.tagName === 'h3') {
          item.children = [];
          if (node === markedInbox) item.inbox = true;
          summary.folders++;
          pendingFolder = item;
        } else {
          item.url = attribute(node, 'href');
          requireURL(item.url);
          summary.bookmarks++;
          pendingFolder = undefined;
        }
        nodes.push(item);
        return;
      }
      for (const child of node.childNodes || []) visit(child);
    };
    for (const child of list.childNodes || []) visit(child);
    return nodes;
  };
  const nodes = readList(lists[0]);
  if (anymark && (Array.from(metadata.keys()).some(node => !consumed.has(node)) || markedInbox && !consumed.has(markedInbox))) {
    invalid('AnyMark metadata is not attached to an imported bookmark or folder.');
  }
  return { nodes, rootNote, summary, format: anymark ? 'anymark' : 'chrome' };
}

/** Emit a single Chrome-compatible HTML file; local notes remain encoded node attributes. */
export function serializeBookmarkHTML({ nodes, rootNote = '' }) {
  if (!Array.isArray(nodes) || typeof rootNote !== 'string') invalid('Invalid bookmark transfer data.');
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- Bookmarks with AnyMark local metadata (encoded, not encrypted). -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<META NAME="anymark-export-version" CONTENT="1">',
    '<TITLE>Bookmarks</TITLE>',
    `<H1${rootNote ? ` DATA-ANYMARK-NOTE="${encodeNote(rootNote)}"` : ''}>Bookmarks</H1>`,
    '<DL><p>',
  ];
  const seen = new Set();
  let inboxes = 0;
  const writeNode = node => {
    if (!node || typeof node !== 'object' || seen.has(node) || typeof node.title !== 'string' || node.note !== undefined && typeof node.note !== 'string' || node.inbox !== undefined && typeof node.inbox !== 'boolean') {
      invalid('Invalid or cyclic bookmark transfer node.');
    }
    seen.add(node);
    const bookmark = Object.hasOwn(node, 'url');
    if (bookmark ? node.children !== undefined || node.inbox : !Array.isArray(node.children)) invalid('A transfer node must be either a bookmark or a folder.');
    const note = node.note ? ` DATA-ANYMARK-NOTE="${encodeNote(node.note)}"` : '';
    if (bookmark) {
      requireURL(node.url);
      lines.push(`<DT><A HREF="${escapeHTML(node.url)}"${note}>${escapeHTML(node.title)}</A>`);
    } else {
      if (node.inbox && ++inboxes > 1) invalid('The file must mark at most one Inbox folder.');
      const toolbar = node.folderType === 'bookmarks-bar' ? ' PERSONAL_TOOLBAR_FOLDER="true"' : '';
      lines.push(`<DT><H3${toolbar}${note}${node.inbox ? ' DATA-ANYMARK-INBOX="1"' : ''}>${escapeHTML(node.title)}</H3>`, '<DL><p>');
      for (const child of node.children) writeNode(child);
      lines.push('</DL><p>');
    }
    seen.delete(node);
  };
  for (const node of nodes) writeNode(node);
  lines.push('</DL><p>', '');
  return lines.join('\n');
}
