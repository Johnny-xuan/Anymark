import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBookmarkHTML, serializeBookmarkHTML } from '../src/transfer.js';
import { BridgeError } from '../src/protocol.js';

const marker = '<META NAME="anymark-export-version" CONTENT="1">';
const encoded = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const invalid = html => assert.throws(() => parseBookmarkHTML(html), error => error instanceof BridgeError && error.code === 'EINVAL');

// Chrome exports deliberately omit DT and P closing tags. Keep this fixture in that form.
const chromeHTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000001" PERSONAL_TOOLBAR_FOLDER="true">书签栏 &amp; Work</H3>
    <DL><p>
        <DT><A HREF="https://example.org/?a=1&amp;b=2" ADD_DATE="1700000000">雪 &lt; &amp; 😀</A>
        <DT><H3 ADD_DATE="1700000000">Empty</H3>
        <DL><p>
        </DL><p>
        <DT><H3></H3>
        <DL><p>
            <DT><A HREF="mailto:hello@example.org"></A>
        </DL><p>
        <DT><A HREF="chrome://bookmarks/">Browser</A>
    </DL><p>
    <DT><H3>Other</H3>
    <DL><p>
        <DT><A HREF="file:///tmp/bookmarks.html">Local</A>
    </DL><p>
</DL><p>`;

test('plain Chrome optional-closing-tag HTML retains hierarchy, entities, Unicode and empty items', () => {
  const parsed = parseBookmarkHTML(chromeHTML);
  assert.equal(parsed.format, 'chrome');
  assert.equal(parsed.rootNote, '');
  assert.deepEqual(parsed.summary, { bookmarks: 4, folders: 4, notes: 0 });
  assert.deepEqual(parsed.nodes, [
    { title: '书签栏 & Work', children: [
      { title: '雪 < & 😀', url: 'https://example.org/?a=1&b=2' },
      { title: 'Empty', children: [] },
      { title: '', children: [{ title: '', url: 'mailto:hello@example.org' }] },
      { title: 'Browser', url: 'chrome://bookmarks/' },
    ] },
    { title: 'Other', children: [{ title: 'Local', url: 'file:///tmp/bookmarks.html' }] },
  ]);
});

test('identical titles and URLs have structurally independent notes and Inbox identity', () => {
  const nodes = [
    { title: 'Same', note: 'first folder', inbox: true, children: [
      { title: 'Same', url: 'https://same.example/', note: 'first bookmark' },
      { title: 'Same', url: 'https://same.example/', note: 'second bookmark' },
    ] },
    { title: 'Same', note: 'second folder', children: [] },
  ];
  const html = serializeBookmarkHTML({ nodes, rootNote: 'root note' });
  const parsed = parseBookmarkHTML(html);
  assert.deepEqual(parsed.nodes, nodes);
  assert.equal(parsed.rootNote, 'root note');
  assert.equal(parsed.format, 'anymark');
  assert.deepEqual(parsed.summary, { bookmarks: 2, folders: 2, notes: 5 });
  assert.ok(!html.includes('first bookmark'));
  assert.ok(!html.includes('first folder'));
  assert.ok(html.includes('DATA-ANYMARK-INBOX="1"'));
});

test('notes preserve arbitrary strings, lone surrogates, controls and markup without visible injection', () => {
  const notes = [
    'Unicode 雪 😀 e\u0301',
    'line one\r\nline two\nline three\r',
    '\u0000\u0001\t\u2028\u2029',
    '\ud800 lone high; lone low \udfff',
    '\"\' <script>globalThis.transferExecuted = true</script> & </A><H3>not a folder',
    'x'.repeat(100000),
  ];
  const nodes = notes.map(note => ({ title: '', url: 'https://same.example/', note }));
  const html = serializeBookmarkHTML({ nodes, rootNote: notes[3] });
  const parsed = parseBookmarkHTML(html);
  assert.deepEqual(parsed.nodes.map(node => node.note), notes);
  assert.equal(parsed.rootNote, notes[3]);
  assert.ok(!html.includes('<script>'));
  assert.deepEqual(parsed.summary, { bookmarks: notes.length, folders: 0, notes: notes.length + 1 });
});

test('serializer emits escaped native bookmark text/URLs and preserves empty folders', () => {
  const nodes = [
    { title: '<Toolbar & "雪">', folderType: 'bookmarks-bar', children: [
      { title: '\r\n<&"', url: 'https://example.org/?a=1&b=%22%3C' },
      { title: '', children: [] },
    ] },
  ];
  const html = serializeBookmarkHTML({ nodes });
  assert.ok(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>'));
  assert.ok(html.includes('PERSONAL_TOOLBAR_FOLDER="true"'));
  assert.ok(html.includes('HREF="https://example.org/?a=1&amp;b=%22%3C"'));
  const { folderType, ...expected } = nodes[0];
  assert.deepEqual(parseBookmarkHTML(html).nodes, [expected]);
});

test('absolute non-HTTP URLs retain bookmarklet spaces and data payloads without normalization', () => {
  const nodes = [
    { title: 'Bookmarklet', url: "javascript:(() => alert('hello world'))()" },
    { title: 'Data', url: 'data:text/plain,hello world' },
    { title: 'Extension', url: 'chrome-extension://abcdefghijklmnop/page.html' },
  ];
  assert.deepEqual(parseBookmarkHTML(serializeBookmarkHTML({ nodes })).nodes, nodes);
});

test('script, style, template, image and foreign markup stay inert and are not bookmarks', () => {
  const parsed = parseBookmarkHTML(`<H1>Bookmarks</H1><DL><p>
    <script>globalThis.transferExecuted = true; '<DT><A HREF="https://fake.example/">fake</A>'</script>
    <style>.x::before { content: '<A HREF="https://style.example/">'; }</style>
    <template><A HREF="https://template.example/">template</A></template>
    <svg><a href="https://foreign.example/">foreign</a></svg>
    <img src="https://must-not-fetch.example/track" onerror="globalThis.transferExecuted = true">
    <DT><A HREF="javascript:alert(1)">Safe<script>not title</script><style>not title</style> title</A>
  </DL><p>`);
  assert.deepEqual(parsed.nodes, [{ title: 'Safe title', url: 'javascript:alert(1)' }]);
  assert.equal(Object.hasOwn(globalThis, 'transferExecuted'), false);
});

test('AnyMark attributes without a version marker are ignored for plain Chrome HTML', () => {
  const parsed = parseBookmarkHTML('<DL><DT><H3 DATA-ANYMARK-INBOX="garbage" DATA-ANYMARK-NOTE="not-base64!">Inbox</H3><DL></DL></DL>');
  assert.deepEqual(parsed.nodes, [{ title: 'Inbox', children: [] }]);
  assert.equal(parsed.format, 'chrome');
});

test('unsupported, missing-content and multiple version markers fail rather than discard metadata', () => {
  for (const prefix of [
    '<META NAME="anymark-export-version" CONTENT="2">',
    '<META NAME="anymark-export-version">',
    marker + marker,
  ]) invalid(prefix + '<DL><DT><A HREF="https://example.org/">Link</A></DL>');
});

test('malformed, nonstring, noncanonical and invalid UTF-8 note payloads fail', () => {
  for (const payload of ['', '!', 'A', encoded(42), encoded({ note: 'wrong' }), Buffer.from('not JSON').toString('base64url'), '_w', 'IiI=']) {
    invalid(`${marker}<DL><DT><A HREF="https://example.org/" DATA-ANYMARK-NOTE="${payload}">Link</A></DL>`);
  }
});

test('metadata must bind to an imported node and a single folder Inbox marker', () => {
  const note = encoded('note');
  for (const body of [
    `<H2 DATA-ANYMARK-NOTE="${note}">Wrong</H2><DL></DL>`,
    `<A HREF="https://outside.example/" DATA-ANYMARK-NOTE="${note}">Outside</A><DL></DL>`,
    `<H1 DATA-ANYMARK-NOTE="${note}">One</H1><H1 DATA-ANYMARK-NOTE="${note}">Two</H1><DL></DL>`,
    '<DL><DT><A HREF="https://example.org/" DATA-ANYMARK-INBOX="1">Link</A></DL>',
    '<DL><DT><H3 DATA-ANYMARK-INBOX="0">Wrong</H3><DL></DL></DL>',
    '<DL><DT><H3 DATA-ANYMARK-INBOX="1">One</H3><DL></DL><DT><H3 DATA-ANYMARK-INBOX="1">Two</H3><DL></DL></DL>',
    `<DL><DT><A HREF="https://example.org/" DATA-ANYMARK-NOTE="${note}" DATA-ANYMARK-NOTE="!">Link</A></DL>`,
  ]) invalid(marker + body);
});

test('empty/bad files and relative or malformed URLs are rejected before an import can begin', () => {
  for (const html of ['', '   ', 'not bookmarks', '<html><body>No list</body></html>', '<DL></DL><DL></DL>', '<DL><DL></DL></DL>']) invalid(html);
  for (const url of ['', '/relative', '//example.org/path', 'relative.html', 'https://', ' https://example.org/', 'https://example.org/&#10;bad']) {
    invalid(`<DL><DT><A HREF="${url}">Bad</A></DL>`);
  }
});

test('truncated bookmark tags and metadata fail instead of importing a successful prefix', () => {
  const good = '<DT><A HREF="https://good.example/">Good</A>';
  for (const prefix of ['', marker]) {
    for (const suffix of [
      '<DT><A HREF="https://lost.example/" DATA-ANYMARK-NOTE="!',
      '<DT><A HREF="https://lost.example/"',
    ]) invalid(`${prefix}<DL>${good}${suffix}`);
  }
});

test('an empty valid export and an empty root note round-trip without inventing entries', () => {
  const parsed = parseBookmarkHTML(serializeBookmarkHTML({ nodes: [], rootNote: '' }));
  assert.deepEqual(parsed, { nodes: [], rootNote: '', summary: { bookmarks: 0, folders: 0, notes: 0 }, format: 'anymark' });
});

test('serialization rejects ambiguous shapes, invalid notes, multiple Inbox markers and cycles', () => {
  const cycle = { title: 'Cycle', children: [] };
  cycle.children.push(cycle);
  for (const nodes of [
    [{ title: 'Bad', url: '/relative' }],
    [{ title: 'Bad', url: 'https://example.org/', children: [] }],
    [{ title: 'Bad', note: 1, children: [] }],
    [{ title: 'Bad', url: 'https://example.org/', inbox: true }],
    [{ title: 'One', inbox: true, children: [] }, { title: 'Two', inbox: true, children: [] }],
    [cycle],
  ]) assert.throws(() => serializeBookmarkHTML({ nodes }), error => error.code === 'EINVAL');
});
