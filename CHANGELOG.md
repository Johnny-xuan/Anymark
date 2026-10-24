# Changelog

## 2.0.1

### Security

- Validate every intermediate component in ancestor symlink routes, including relative parent traversal and trailing directory separators, before accepting a connector home or registration directory.
- If you use custom symlinked connector directories, reinstall the connector from a stable private path after upgrading.
- Browser smoke tools now use unique private evidence directories and reject unsafe existing output directories before writing screenshots or backups.
- Added a bilingual security policy and private vulnerability reporting guidance.

## 2.0.0

AnyMark becomes a local bookmark workspace and an agent-agnostic filesystem bridge. The extension no longer embeds a chat assistant or model configuration.

### Added

- Popup capture with a lazily created Inbox and bookmark notes.
- Web workspace for browsing, searching, editing, moving, copying, and deleting bookmarks and folders.
- Local notes bound to bookmark IDs, with independent notes on copied items.
- CLI filesystem operations, an external-agent skill, and standard MCP stdio tools.
- Explicit Chrome profile selection and opt-in local agent access through Native Messaging.
- A 2D relationship graph based on the actual Chrome bookmark hierarchy.
- Website favicons from Chrome's cache.
- Chrome-compatible HTML backup and additive import, including AnyMark note metadata.
- Settings, four interface languages, light/dark/system themes, keyboard navigation, and bulk actions.
- Context-aware prompts copied from the Agent Relay Console for use with external agents.

### Changed

- Chrome remains the source of truth for bookmark titles, URLs, hierarchy, and order. Notes remain in profile-local extension storage.
- External agents supply their own model and credentials. AnyMark does not require an AI API key or a cloud bookmark database.
- Distribution separates the ready-to-load Chrome extension from the optional Node.js CLI/MCP connector source.
- Requirements: Chrome 134+; Node.js 22+ for the optional connector. The native connector supports macOS and Linux; Windows is not implemented.

### Upgrade notes

- Back up bookmarks, disable the old extension, and load the new extension directory. Do not delete or reimport Chrome bookmarks just to upgrade.
- Legacy embedded-AI settings and chat history are not automatically migrated.
- Reinstall the local connector if its directory or Node executable path changes, and explicitly select the intended Chrome profile.
- HTML backups contain readable private URLs and notes. Keep backups outside the repository.

## 1.0.0

The original embedded-AI bookmark manager. Its existing release and Git history remain available on GitHub.
