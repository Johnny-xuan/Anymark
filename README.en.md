# AnyMark 2.0

[简体中文](README.md) · **English**

**Chrome bookmarks as a local filesystem interface, for people and terminal AI agents.**

AnyMark 2.0 removes the extension's built-in chat and model configuration. The roles are clear: Chrome stores your bookmarks; AnyMark provides a local workspace and a Native Messaging bridge. The agents you already use—Claude Code, Codex, Cursor, Gemini CLI, and others—can read and manage those bookmarks through Unix-like commands or MCP.

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/architecture.png">
  <img src="docs/assets/architecture.gif" width="1000" alt="AnyMark architecture: terminal agents use CLI or MCP and a local bridge; Popup and Web access the extension directly. Both routes share the current Chrome profile's bookmarks and local notes. Moving beams illustrate access paths, not background synchronization.">
</picture>

---

## Core features

### 1. A relay interface for AI agents

- **Filesystem semantics:** bookmark folders act as directories (`/`). Bookmarks act as files with `title`, `url`, and `note` fields. Supported operations include `ls`, `tree`, `find`, `stat`, `cat`, `mkdir`, `write`, `edit`, `mv`, `cp`, and `rm`.
- **Three ways to connect:**
  - **CLI commands:** use them directly in your terminal or through an agent's shell tool.
  - **Agent skill:** [`skills/anymark/SKILL.md`](skills/anymark/SKILL.md) describes addressing rules and workflows for Inbox triage, duplicate review, and note enrichment.
  - **MCP server:** standard `stdio` transport for clients such as Claude Desktop, Cursor, and Codex.
- **Web Relay Console:** copy task prompts for Inbox triage, duplicate and folder review, or note enrichment. Prompts include context from the current scope and profile.
- **Profile isolation:** each Chrome profile has its own connection switch and `profileId`. Operations target the explicitly selected profile.

### 2. A workspace for everyday use

- **Quick capture with Popup:** save the current supported webpage to `AnyMark Inbox` with an optional note. The Inbox folder is created only on the first capture.
- **Local notes:** attach notes to bookmarks and folders. Notes stay in the current profile's local storage without changing Chrome bookmark titles or URLs. Search them or use them as context for agent tasks.
- **Keyboard navigation and bulk actions:** use `↑ / ↓` to move focus, `→ / Enter` to enter a folder or open a page, `←` to return to the parent folder, and `Space` to toggle details. Use `Shift` for range selection, move or delete selected items, or copy a selection as an agent prompt.
- **2D relationship graph:** explore the real folder hierarchy with search filters, branch focus, and keyboard navigation.
- **HTML backup and migration:** export Chrome-compatible bookmark HTML with embedded AnyMark notes. Import always creates a separate folder and does not overwrite existing bookmarks.
- **Languages and themes:** Simplified Chinese, Traditional Chinese, English, and Japanese; light, dark, and system themes.

---

## Quick start

**Requirements:** Chrome 134+ for the extension. Popup and Web do not require Node.js or a local connector. The optional CLI/MCP connector requires Node.js 22+ and currently supports macOS and Linux only, not Windows.

### 1. Download and load the extension

Download **`anymark-v2.0.0-chrome-extension.zip`** from the [v2.0.0 release](https://github.com/Johnny-xuan/Anymark/releases/tag/v2.0.0). This ZIP contains only the built extension; no dependency installation or build is needed.

1. Extract the ZIP into a directory you intend to keep.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted directory containing `manifest.json`.
4. Open AnyMark from the browser toolbar to capture the current webpage. Use the globe icon in the Popup to open the Web workspace.

You can now manage bookmarks through Popup and Web without enabling agent access.

### 2. Optional: install the CLI/MCP connector

For terminal agent access, also download **`anymark-v2.0.0-agent-connector-source.zip`** from the same release. This is connector source code, not a standalone executable or a Chrome extension. It needs an internet connection to install npm dependencies, but does not require an extension build.

Extract the connector source into a directory you intend to keep. From the directory containing `package.json`, run:

```bash
npm ci --omit=dev
node bin/anymark.js install
```

Installation records absolute paths to the current Node executable and connector directory. Run the install command again if you move the directory or change the Node path. For Chromium, use `node bin/anymark.js install --browser chromium`.

> Optional: run `npm link` in that directory to register the `anymark` command globally. Without it, replace `anymark` below with `node bin/anymark.js` from the connector directory, or use `node /absolute/path/to/Anymark/bin/anymark.js`. CLI/MCP examples assume the connector is installed.

### 3. Optional: enable agent access and select a profile

1. In the Popup's **Agent Relay** section or the Web workspace's **Settings → Agent & MCP**, enable **Allow Local Agent Access**.
2. List online profiles and explicitly select a default target:

```bash
anymark profiles
anymark use PROFILE_ID
anymark ls /
```

Replace `PROFILE_ID` with an ID returned by `anymark profiles`. Load the extension and enable access separately in each Chrome profile, then select the intended target.

### Build from source instead of using the extension ZIP

To build the extension yourself, clone the repository and run:

```bash
git clone https://github.com/Johnny-xuan/Anymark.git
cd Anymark
git checkout v2.0.0
npm ci
npm run build
```

Load the project's `dist/extension` directory in `chrome://extensions`. If you also need CLI/MCP, run `node bin/anymark.js install` from the same project directory and follow the profile setup above; you do not need a separate connector source download.

### Upgrading from v1

v2 uses a new extension build directory rather than v1's old extension directory. Back up bookmarks with Chrome's export feature, disable the old extension, and load the extracted v2 extension directory (or `dist/extension` when building from source). If Chrome recognizes it as an update to the same extension, follow its loading and permission prompts. Chrome retains the native bookmarks; upgrading does not require deleting or reimporting them.

v2 no longer includes v1's embedded chat or model configuration. Automatic migration of legacy embedded-AI chat history, settings, or other app data is not promised. The note-storage format migration described in the architecture document concerns internal note keys in the connector architecture, not v1 product app-data migration. For CLI/MCP, reinstall the connector and confirm the target profile.

---

## Connect your agent

### Option 1: Copy a prompt from the Web Relay Console

Open the Web workspace and select a Relay Console card above the bookmark list, such as Inbox triage or duplicate and folder review. Paste the copied prompt into your agent, such as Claude Code or Codex. The card copies instructions; it does not run an agent inside the extension.

### Option 2: Use the CLI and `SKILL.md`

Provide [`skills/anymark/SKILL.md`](skills/anymark/SKILL.md) to your agent, or run commands directly:

```bash
# Inspect pending Inbox items and the top-level folder structure.
anymark inbox
anymark tree / --depth 2

# Search bookmark titles, URLs, and notes.
anymark find / "react" --limit 50

# Move a bookmark and add a searchable note. Prefer stable id:<ID> addresses.
anymark mv id:128 id:42
anymark edit id:128 --note "React state management comparison"
```

The IDs above are examples. Use IDs from your own selected profile. The supplied skill is a document for your external agent; loading the Chrome extension does not install it in an agent client.

### Option 3: Connect through MCP

In **Settings → Agent & MCP**, copy the MCP configuration for the current profile. You can also add it to your client's configuration manually:

```json
{
  "mcpServers": {
    "anymark": {
      "command": "node",
      "args": ["/absolute/path/to/Anymark/bin/anymark.js", "mcp", "--profile", "YOUR_PROFILE_ID"]
    }
  }
}
```

Replace the project path and `YOUR_PROFILE_ID` with your actual values.

---

## Command reference

| Command | Description |
| --- | --- |
| `anymark profiles` | List online Chrome profiles. |
| `anymark use <PROFILE_ID>` | Select the default target profile. |
| `anymark status` | Show the selected profile's connection status. |
| `anymark inbox` | Read pending Inbox items without creating an empty folder. |
| `anymark capture <URL> [--title T] [--note N]` | Save a webpage to Inbox. |
| `anymark ls [PATH]` | List direct children; defaults to `/`. |
| `anymark tree [PATH] [--depth N]` | Read the folder hierarchy. |
| `anymark find <PATH> <QUERY> [--limit N]` | Search titles, URLs, and local notes. |
| `anymark stat <PATH>` | Read an item's ID, path, type, note, and protection state. |
| `anymark cat <PATH>` | Read a bookmark's title, URL, and note. |
| `anymark mkdir <PATH> [--note N]` | Create a folder. |
| `anymark write <PATH> --url <URL> [--note N] [--exclusive]` | Create or update a bookmark; `--exclusive` refuses to overwrite an existing item. |
| `anymark edit <PATH> [--title T] [--url U] [--note N]` | Edit the supplied fields; use `--note ""` to clear a note. |
| `anymark mv <PATH> <TO> [--index N]` | Move, rename, or reorder an item, preserving its ID and note. |
| `anymark cp <PATH> <TO> [--recursive]` | Copy a bookmark or folder tree with new IDs and independent notes. |
| `anymark rm <PATH> [--recursive]` | Permanently delete an item; non-empty folders require `--recursive`. |
| `anymark export <FILE> [--path PATH]` | Export Chrome-compatible HTML with AnyMark notes. |
| `anymark import <FILE> --to <PATH> [--title T]` | Import bookmark HTML into a new folder at the destination. |

> **Addressing:** canonical paths returned by `ls` and `tree` include a `~id` suffix, such as `/Bookmarks%20bar~1/Dev~15`, so duplicate names remain distinct. In scripts and sequences of moves or renames, prefer stable `id:<BOOKMARK_ID>` addresses, such as `id:15`.

---

## Privacy and safety boundaries

- **No AnyMark cloud or telemetry:** AnyMark does not use a cloud bookmark database or a remote favicon service. Website icons come from Chrome's favicon cache. Your external agent's own data handling is separate from AnyMark.
- **Limited extension permissions:** only `bookmarks`, `storage`, `nativeMessaging`, `activeTab`, and `favicon`. No `<all_urls>`, `tabs`, or `history` permission.
- **Explicit local authorization:** local agent access is off by default. Once enabled, the bridge uses private Unix sockets with `0600` permissions under `~/.anymark`.
- **Permanent deletion:** Chrome root folders and system-owned entries are protected. `rm` permanently deletes items. Export a backup with `anymark export backup.html` before large automated changes.

---

## Development and tests

```bash
npm run build   # Bundle the extension into dist/extension.
npm test        # Run the unit tests.
```

## Project structure

- `bin/`: CLI entry point.
- `src/`: filesystem mapping, protocol, native host, client, and MCP server.
- `extension/`: Chrome MV3 background connection, Popup, shared localization (`i18n.js`), and icon assets.
- `web/`: bookmark workspace, Relay Console, 2D graph, settings, and import/export panels.
- `skills/anymark/`: agent operation guide (`SKILL.md`).
- `test/`: filesystem, transport, profile isolation, and safety-boundary tests.
- [Architecture](docs/architecture.md) — available in Chinese.
