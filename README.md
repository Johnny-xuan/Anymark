# AnyMark

**The First AI Bookmark Agent — A true Agent that executes tasks, not just AI-enhanced storage.**

> Manage bookmarks through natural language. The AI autonomously executes complex tasks.

---

## What is AnyMark?

AnyMark is a Chrome bookmark extension with a **true Agent architecture** that understands natural language instructions and independently calls tools to complete tasks.

**Examples of what you can say:**
- "Find all React-related bookmarks" → AI searches and organizes results
- "Organize my development resources" → AI analyzes and reclassifies
- "What's trending on GitHub?" → AI searches externally and displays results
- "Clean up bookmarks unused for over a year" → AI filters and asks for confirmation

**Core difference**: Not simple AI "enhancement," but a complete Agent architecture based on Function Calling + ReAct loops.

---

## Features

### True Agent Architecture
- **Function Calling First**: Supports OpenAI, Anthropic, Google function calling APIs
- **ReAct Loop Fallback**: Automatically degrades to reasoning-action loop when function calling unavailable
- **Direct Command Fast Lane**: Commands like `/ls`, `/cd` execute directly without LLM
- **Streaming Response**: Real-time display of AI thinking and execution steps

### Intelligent Bookmark Analysis
When saving bookmarks, automatically:
- Generate content summary (AI Summary)
- Extract smart tags (AI Tags)
- Identify tech stack (Tech Stack)
- Detect duplicate bookmarks
- Recommend target folder

### Vim-Style Keyboard Navigation
Keyboard-driven, mouse optional:

| Navigation | `↑` `↓` | `j` `k` | `g` / `G` | `PgUp` / `PgDn` |
|------------|---------|---------|-----------|-----------------|
| Actions | `Enter` open | `O` new tab | `E` edit | `Y` copy URL |
| Management | `S` star | `D` delete | `Space` preview | `H` help |
| Search | `⌘K` / `/` focus | `Enter` open first | `Esc` clear | - |
| Filters | `1` Chrome | `2` uncategorized | `3` starred | `4` recent |
|           | `5` popular | `6` long-tail | `7` trash | - |

### Frecency Smart Ranking
Combines visit frequency with time decay to calculate bookmark activity:
- Green: Active (visited within 7 days)
- Yellow: Occasional (visited within 30 days)
- Blue: Rare (visited within 90 days)
- Snow: Cold (not visited for over 90 days)

### Chrome Native Sync
- Bidirectional sync: AnyMark changes sync to Chrome, Chrome changes sync back
- Optional: Use completely locally without sync

### Multi-Language Support
English, 简体中文, 日本語, Español, Français, Deutsch

### Privacy First
- 100% local storage (IndexedDB)
- API keys encrypted and stored locally
- Zero tracking, zero analytics, zero cloud servers
- AI requests sent directly from browser to your chosen provider

---

## Installation

```bash
git clone https://github.com/Johnny-xuan/Anymark.git
cd Anymark/smart-bookmarks
npm install
npm run build
```

Then in Chrome Extensions (`chrome://extensions/`):
1. Enable "Developer mode"
2. Click "Load unpacked"
3. Select the `smart-bookmarks/dist/` directory

---

## AI Configuration

AnyMark supports **bring your own API key** for all OpenAI-compatible services:

### International Providers
| Provider | Preset Models |
|----------|---------------|
| OpenAI | gpt-5.2, gpt-4o, o3 |
| Anthropic Claude | claude-opus-4-6, claude-sonnet-4-5 |
| Google Gemini | gemini-3-pro-preview, gemini-2.5-pro |
| xAI (Grok) | grok-4, grok-3 |
| Groq | llama-3.3-70b-versatile |
| Azure OpenAI | gpt-4o |

### Chinese Providers
| Provider | Preset Models |
|----------|---------------|
| DeepSeek | deepseek-chat, deepseek-reasoner |
| Doubao | doubao-seed-1.8 |
| Kimi (Moonshot) | moonshot-v1-8k, moonshot-v1-128k |
| Qwen (Tongyi) | qwen-plus, qwen-max, qwen3-max |
| 01.AI (Yi) | Yi-34B-Chat |
| SiliconFlow | deepseek-ai/DeepSeek-V3.2 |
| Zhipu | glm-4.7 |
| MiniMax | MiniMax-M2.1 |

### Self-Hosted/Aggregation
| Provider | Description |
|----------|-------------|
| Ollama | Local (llama3.2, qwen2.5, deepseek-r1, etc.) |
| OpenRouter | Aggregation platform, hundreds of models |
| HuggingFace | OpenAI-compatible endpoint |
| Custom | Any OpenAI-compatible service |

**Note**: Preset models are suggestions. You can freely choose any model name.

---

## Chrome Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+B` | Open bookmark manager (sidebar) |
| `Alt+Shift+S` | Quick save current page |
| `Alt+Shift+D` | Open detailed save panel |

---

## Project Structure

```
smart-bookmarks/
├── src/
│   ├── agent-v3/              # AI Agent core
│   │   ├── Agent.ts           # Main Agent class
│   │   ├── FunctionCallingLoop.ts  # Function calling loop
│   │   ├── ReActLoop.ts       # Reasoning-action loop
│   │   └── prompts/           # Multilingual system prompts
│   ├── sidebar/               # Sidebar UI
│   │   ├── components/        # React components
│   │   └── store/             # Zustand state management
│   ├── popup/                 # Quick popup
│   ├── background/            # Service Worker
│   ├── utils/                 # Utility functions
│   │   ├── aiAnalyzer.ts      # Bookmark content analysis
│   │   ├── frecencyCalculator.ts  # Activity calculation
│   │   └── apiKeyRotator.ts   # API key rotation
│   ├── services/              # Business services
│   └── i18n/                  # Internationalization (6 languages)
├── public/
│   ├── manifest.json          # Chrome extension config
│   └── _locales/              # Chrome internationalization
└── dist/                      # Build output (load in Chrome)
```

---

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **State Management**: Zustand
- **UI**: Lucide React icons + Highlight.js
- **Search**: Fuse.js fuzzy search
- **Storage**: IndexedDB (synced via Chrome Storage API)
- **Testing**: Vitest + Fast Check (property-based testing)
- **Extension**: Chrome Extension Manifest V3

---

## Development

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Run tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# i18n audit
npm run i18n-audit
```

---

## License

MIT License — Free to use, modify, and distribute.

---

[GitHub](https://github.com/Johnny-xuan/Anymark) · [X (Twitter)](https://x.com/JohnXuann)
