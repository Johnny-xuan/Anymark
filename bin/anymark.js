#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { text } from 'node:stream/consumers';
import { readFile, writeFile } from 'node:fs/promises';
import { OPERATIONS, PROTOCOL_VERSION, VERSION, BridgeError, errorPayload } from '../src/protocol.js';

const help = `AnyMark ${VERSION} — Chrome bookmarks as a local filesystem

Setup:
  anymark install [--browser chrome|chromium|chrome-for-testing]
  anymark profiles
  anymark use PROFILE_ID
  anymark status
  anymark web                                Open the full bookmark workspace
  anymark inbox                              Read unorganized bookmarks
  anymark capture URL [--title TITLE] [--note NOTE]

Filesystem:
  anymark ls [PATH]
  anymark stat PATH
  anymark cat PATH
  anymark tree [PATH] [--depth N]
  anymark find PATH QUERY [--limit N]
  anymark mkdir PATH [--note NOTE]
  anymark write PATH --url URL [--title TITLE] [--note NOTE] [--exclusive]
  anymark write PATH '{"title":"Title","url":"https://example.com"}'
  anymark write PATH -                       Read bookmark JSON from stdin
  anymark edit PATH [--title TITLE] [--url URL] [--note NOTE]
  anymark mv PATH TO [--index N]
  anymark cp PATH TO [--recursive]
  anymark rm PATH [--recursive]              Permanently deletes, no undo

Import / export:
  anymark export FILE [--path PATH]           Chrome HTML with AnyMark notes
  anymark export -                           Write HTML to stdout
  anymark import FILE --to PATH [--title TITLE]
  anymark import FILE --dry-run              Inspect without changing Chrome
  FILE may be - to read HTML from stdin. Import always creates a new folder.

Agent interfaces:
  anymark capabilities                       Discover operation JSON schemas
  anymark mcp [--profile PROFILE_ID]          MCP server on stdio

Global options:
  --profile PROFILE_ID                      Overrides ANYMARK_PROFILE/default
  --home PATH                               Overrides ANYMARK_HOME/~/.anymark
  --help                                    Show this help

Paths are virtual, not OS paths. Use canonical paths from ls or id:<id>.
A default profile must be explicitly selected; offline targets never switch.
Output is JSON except export -. Errors go to stderr and exit nonzero.
`;

function number(value) {
  if (!/^\d+$/.test(value)) throw new BridgeError('EINVAL', `Expected a nonnegative integer, received: ${value}`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new BridgeError('EINVAL', 'Integer is too large.');
  return result;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    // Chrome appends an Origin and may append platform-specific native-host flags.
    strict: process.argv[2] !== 'native-host',
    options: {
      profile: { type: 'string' }, home: { type: 'string' }, browser: { type: 'string' },
      'user-data-dir': { type: 'string' }, 'extension-id': { type: 'string' },
      url: { type: 'string' }, title: { type: 'string' }, note: { type: 'string' },
      exclusive: { type: 'boolean' },
      path: { type: 'string' }, to: { type: 'string' }, 'dry-run': { type: 'boolean' },
      recursive: { type: 'boolean', short: 'r' }, depth: { type: 'string' },
      limit: { type: 'string' }, index: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    },
  });
  const [command = 'help', ...args] = positionals;
  const options = { home: values.home, profileId: values.profile };
  if (command === 'help' || values.help) { process.stdout.write(help); return; }
  if (command === 'native-host') {
    const { runNativeHost } = await import('../src/native-host.js');
    await runNativeHost(options);
    return;
  }
  if (command === 'mcp') {
    const { runMcp } = await import('../src/mcp.js');
    await runMcp(options);
    return;
  }
  if (command === 'capabilities') {
    print({ version: VERSION, protocolVersion: PROTOCOL_VERSION, operations: OPERATIONS });
    return;
  }
  if (command === 'install') {
    const { installHost } = await import('../src/install.js');
    print(await installHost({ home: values.home, browser: values.browser, userDataDir: values['user-data-dir'], extensionId: values['extension-id'] }));
    return;
  }
  const { listProfiles, request, useProfile } = await import('../src/client.js');
  if (command === 'profiles') { print({ profiles: await listProfiles(options) }); return; }
  if (command === 'use') {
    if (args.length !== 1) throw new BridgeError('EINVAL', 'Usage: anymark use PROFILE_ID');
    print(await useProfile(args[0], options));
    return;
  }
  if (command === 'status') { print(await request('status', {}, options)); return; }
  if (command === 'export') {
    if (args.length !== 1) throw new BridgeError('EINVAL', 'Usage: anymark export FILE|- [--path VIRTUAL_PATH]');
    const response = await request('export', { path: values.path ?? '/' }, options);
    if (args[0] === '-') process.stdout.write(response.result.html);
    else {
      await writeFile(args[0], response.result.html, { flag: 'wx', mode: 0o600 });
      print({ profileId: response.profileId, result: { file: args[0], summary: response.result.summary } });
    }
    return;
  }
  if (command === 'import') {
    if (args.length !== 1) throw new BridgeError('EINVAL', 'Usage: anymark import FILE|- --to PATH [--title TITLE] [--dry-run]');
    const html = args[0] === '-' ? await text(process.stdin) : await readFile(args[0], 'utf8');
    const { parseBookmarkHTML } = await import('../src/transfer.js');
    const parsed = parseBookmarkHTML(html);
    if (values['dry-run']) {
      if (values.to !== undefined) {
        const destination = await request('stat', { path: values.to }, options);
        if (!destination.result.entry.childrenWritable) throw new BridgeError('EROFS', 'The import destination cannot receive bookmarks.');
      }
      print({ result: { dryRun: true, format: parsed.format, summary: parsed.summary, ...(values.to === undefined ? {} : { to: values.to }) } });
      return;
    }
    if (values.to === undefined) throw new BridgeError('EINVAL', 'Import requires --to with an existing writable virtual folder.');
    print(await request('import', { html, to: values.to, ...(values.title === undefined ? {} : { title: values.title }) }, options));
    return;
  }
  if (!Object.hasOwn(OPERATIONS, command)) throw new BridgeError('ENOSYS', `Unknown command: ${command}. Run anymark --help.`);
  if (['web', 'inbox'].includes(command)) {
    if (args.length) throw new BridgeError('EINVAL', `${command} does not accept positional arguments.`);
    print(await request(command, {}, options));
    return;
  }
  if (command === 'capture') {
    if (args.length !== 1) throw new BridgeError('EINVAL', 'Usage: anymark capture URL [--title TITLE] [--note NOTE]');
    print(await request(command, { url: args[0], ...(values.title === undefined ? {} : { title: values.title }), ...(values.note === undefined ? {} : { note: values.note }) }, options));
    return;
  }

  const params = { path: args[0] ?? (['ls', 'tree'].includes(command) ? '/' : undefined) };
  if (params.path === undefined) throw new BridgeError('EINVAL', `${command} requires a virtual path.`);
  const expected = ['find', 'write', 'mv', 'cp'].includes(command) ? 2 : 1;
  if (args.length > expected) throw new BridgeError('EINVAL', `Too many arguments for ${command}. Quote paths that contain spaces.`);
  if (command === 'find') {
    if (args[1] === undefined) throw new BridgeError('EINVAL', 'Usage: anymark find PATH QUERY');
    params.query = args[1];
    if (values.limit !== undefined) params.limit = number(values.limit);
  }
  if (command === 'tree' && values.depth !== undefined) params.depth = number(values.depth);
  if (command === 'mkdir' && values.note !== undefined) params.note = values.note;
  if (command === 'edit') {
    params.changes = { ...(values.title === undefined ? {} : { title: values.title }), ...(values.url === undefined ? {} : { url: values.url }), ...(values.note === undefined ? {} : { note: values.note }) };
  }
  if (command === 'write') {
    if (values.exclusive) params.exclusive = true;
    if (values.url !== undefined) {
      if (args[1] !== undefined) throw new BridgeError('EINVAL', 'Supply either --url or a JSON document, not both.');
      params.content = { url: values.url, ...(values.title === undefined ? {} : { title: values.title }), ...(values.note === undefined ? {} : { note: values.note }) };
    } else {
      if (args[1] === undefined || values.title !== undefined || values.note !== undefined) throw new BridgeError('EINVAL', 'Supply --url with optional --title/--note, or a complete JSON document.');
      const document = args[1] === '-' ? await text(process.stdin) : args[1];
      try { params.content = JSON.parse(document); }
      catch { throw new BridgeError('EINVAL', 'Bookmark content must be valid JSON.'); }
    }
  }
  if (['mv', 'cp'].includes(command)) {
    if (args[1] === undefined) throw new BridgeError('EINVAL', `${command} requires a destination.`);
    params.to = args[1];
  }
  if (command === 'mv' && values.index !== undefined) params.index = number(values.index);
  if (['cp', 'rm'].includes(command)) params.recursive = values.recursive === true;
  print(await request(command, params, options));
}

function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

try { await main(); }
catch (error) {
  process.stderr.write(`${JSON.stringify({ error: errorPayload(error) })}\n`);
  process.exitCode = 1;
}
