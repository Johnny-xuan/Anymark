---
name: anymark
description: Operate Chrome bookmarks as a local virtual filesystem via the AnyMark CLI (`anymark`) or MCP server. Use when the user asks to read, search, organize, deduplicate, tag/annotate, capture, move, delete, export, or import Chrome bookmarks or manage their AnyMark Inbox.
---

# AnyMark — Chrome Bookmark Filesystem Skill

AnyMark bridges live Chrome bookmarks and local per-profile notes (`chrome.storage.local`) into a virtual POSIX-style filesystem over a private Unix socket and Chrome Native Messaging.

- **Folders** map to directories (`type: "directory"`).
- **Bookmarks** map to files (`type: "file"`) with `{ title, url, note }`.
- **Notes** live locally in the Chrome Profile (never injected into bookmark titles or URLs, never synced to Google cloud) and are indexed by `anymark find`.
- Reading bookmarks **never** fetches web pages or opens browser tabs.

---

## 1. Connection & Profile Readiness

Before running bookmark operations, verify the relay connection and active Chrome Profile:

```bash
# 1. List known Chrome profiles and check online status
anymark profiles

# 2. Bind default profile explicitly (never guess when multiple profiles exist)
anymark use <PROFILE_ID>

# 3. Verify relay status (requires Chrome open + AnyMark popup "允许本机 Agent 读写书签" enabled)
anymark status
```

> If `anymark` is not linked globally in `PATH`, run `node /path/to/Anymark/bin/anymark.js <command>` or pass `--profile <PROFILE_ID>` explicitly.

---

## 2. Addressing Rules (`id:<ID>` vs Canonical Paths)

AnyMark paths are **virtual bookmark paths**, not OS disk paths.

1. **ID Addressing (Recommended for mutations)**:
   Use `id:<BOOKMARK_ID>` (e.g. `id:29532`) whenever you already know the item's `id` from `ls`, `tree`, `find`, or `inbox`.
   - Survives renames and moves without breaking.
   - Immune to special characters, slashes, or duplicate folder names.
2. **Canonical `~id` Paths**:
   `ls` and `tree` return canonical paths like `/Bookmarks%20Bar~1/AI~42`. You can pass these directly to any command.
3. **Human Title Paths for Creation**:
   When creating a new folder (`mkdir`) or writing a new bookmark (`write`), append the new title segment to a canonical parent path:
   ```bash
   anymark mkdir '/Bookmarks%20Bar~1/AI Research' --note 'Papers & LLM tooling'
   anymark write '/Bookmarks%20Bar~1/AI Research/AnyMark' --url 'https://example.com' --note 'Local bookmark relay' --exclusive
   ```

---

## 3. Command Reference

| Task | Command | Notes |
|---|---|---|
| **Check Inbox** | `anymark inbox` | Lists unorganized items in `AnyMark Inbox` without creating the folder if absent |
| **Quick Capture** | `anymark capture <URL> [--title T] [--note N]` | Saves an `http(s)` URL into `AnyMark Inbox` (deduplicates direct Inbox children) |
| **List Directory** | `anymark ls [PATH]` | Defaults to `/`. Returns `{ folder, children }` in Chrome order |
| **Directory Tree** | `anymark tree [PATH] [--depth N]` | Defaults to `/`. Great for understanding folder taxonomy (e.g. `--depth 3`) |
| **Inspect Metadata** | `anymark stat <PATH_OR_ID>` | Returns `id`, `path`, `type`, `note`, `readonly`, `childrenWritable` |
| **Read Bookmark** | `anymark cat <PATH_OR_ID>` | Returns `{ id, title, url, note, path }` |
| **Search All** | `anymark find <PATH_OR_ID> <QUERY> [--limit N]` | Searches `title`, `url`, and `note` within `PATH` (use `/` for global search) |
| **Create Folder** | `anymark mkdir <PARENT_PATH>/<NAME> [--note N]` | Creates a folder and optional local note |
| **Create / Write** | `anymark write <PATH> --url <URL> [--title T] [--note N] [--exclusive]` | Use `--exclusive` when creating so existing bookmarks aren't overwritten |
| **Partial Update** | `anymark edit <PATH_OR_ID> [--title T] [--url U] [--note N]` | Updates only provided fields. Pass `--note ''` to clear a note |
| **Move / Reorder** | `anymark mv <SOURCE> <DEST_FOLDER_OR_PATH> [--index N]` | Preserves bookmark ID and local note |
| **Copy** | `anymark cp <SOURCE> <DEST_FOLDER_OR_PATH> [--recursive]` | Creates new ID(s) and clones notes |
| **Delete** | `anymark rm <PATH_OR_ID> [--recursive]` | **Permanent deletion** from Chrome. Always export a backup before bulk `rm` |
| **Export Backup** | `anymark export <FILE.html> [--path PATH]` | Exports Chrome-compatible Netscape HTML with embedded AnyMark notes (`0600` exclusive file) |
| **Import Backup** | `anymark import <FILE.html> --to <DEST_ID> [--title T] [--dry-run]` | Always creates a non-destructive new container folder; use `--dry-run` first |

---

## 4. Standard Playbooks for AI Agents

### Playbook A: Inbox Triage (`整理 Inbox`)
1. Run `anymark inbox` to inspect pending bookmarks in `AnyMark Inbox`.
2. Run `anymark tree / --depth 2` to see the user's existing folder taxonomy.
3. For each Inbox bookmark:
   - Determine the best target folder (or propose creating a new category folder with `anymark mkdir` if several items share a new theme).
   - If the bookmark lacks a useful `note`, add a concise searchable note (`anymark edit id:<ID> --note "关键词 / 用途摘要"`).
   - Move the bookmark into the target folder: `anymark mv id:<ID> id:<TARGET_FOLDER_ID>`.
4. Summarize what was moved where.

### Playbook B: Deduplication & Structure Audit (`去重与体检`)
1. **Safety first**: If performing destructive cleanup, create a timestamped backup first:
   ```bash
   anymark export "/tmp/anymark-backup-$(date +%Y%m%d-%H%M%S).html"
   ```
2. Run `anymark tree <SCOPE_PATH_OR_ID> --depth 5` (or `anymark find <SCOPE> "" --limit 500`) to inspect items in scope.
3. Group bookmarks by normalized URL (ignoring trailing slashes or `utm_*` tracking parameters) and identify:
   - Exact duplicate URLs across the same or different folders.
   - Empty folders or overly fragmented single-item folders.
4. Before running `anymark rm`, merge any unique `note` text onto the surviving bookmark via `anymark edit id:<SURVIVOR_ID> --note "..."`, then remove redundant copies.

### Playbook C: Batch Note Enrichment (`批量补充检索备注`)
1. List the target folder (`anymark ls <SCOPE_ID>`) and filter bookmarks with empty `note`.
2. Based on each bookmark's `title`, domain/path in `url`, and folder context (do **not** scrape private authenticated pages unless explicitly asked), generate a concise Chinese/English note containing:
   - Core topic & category keywords
   - Why this resource is useful / when to look it up
3. Apply via `anymark edit id:<ID> --note "..."`.

---

## 5. Safety Guardrails

- **Never guess a profile**: If `anymark status` fails with `EPROFILE`, run `anymark profiles` and ask or select the intended profile.
- **Protect root folders**: Chrome root containers (`/Bookmarks Bar~1`, `/Other Bookmarks~2`, `/Mobile Bookmarks~3`) are `readonly` for rename/delete, though their children are writable (`childrenWritable: true`).
- **Backup before bulk delete**: Always run `anymark export` before batch `rm` operations.
