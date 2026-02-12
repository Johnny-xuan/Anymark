# AnyMark 🔖

<div align="center">

**Your AI-Powered Bookmark Assistant**

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web_Store-green?logo=google-chrome)](https://chromewebstore.google.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/Johnny-xuan/Anymark?style=social)](https://github.com/Johnny-xuan/Anymark)

Not just AI-enhanced — a true Agent that gets work done through conversation.

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Development](#-development) • [Contributing](#-contributing)

</div>

---

## ✨ What is AnyMark?

AnyMark is a Chrome bookmark manager that revolutionizes how you organize, search, and discover web content. Unlike traditional bookmark managers that require endless clicking through nested folders, AnyMark features a conversational AI Agent that understands natural language and autonomously executes complex bookmark management tasks.

### Key Difference

**Traditional Bookmark Manager:**
```
Click folder → Click subfolder → Search → Scroll → Click bookmark
```

**AnyMark:**
```
Type: "Find my React tutorials" → Done ✅
```

---

## 🚀 Features

### 💬 Conversational AI Agent

Interact with your bookmarks using natural language. The Agent understands context and intent:

- "Find my React learning materials" → Instantly locates all React-related bookmarks
- "Organize my development resources" → Analyzes and categorizes automatically
- "What are my most visited sites?" → Shows usage statistics
- "Clean up unused bookmarks" → Identifies stale bookmarks for review

### 🧠 Smart Save with One Click

Saving a page is magical — just click save, and AI automatically:
- Extracts page content and main sections
- Generates a concise summary for quick reference
- Creates relevant tags based on content
- Suggests appropriate folder locations
- Assigns a frecency score for intelligent ranking

### 📊 Frecency-Based Activity Tracking

Bookmarks are automatically tagged based on your usage patterns:
- 🟢 **Active** — Visited within 7 days
- 🟡 **Cooling** — Visited within 30 days
- 🔵 **Cold** — Visited within 90 days
- ❄️ **Frozen** — Not visited in over 90 days

### ⌨️ Keyboard-First Navigation

Navigate at lightning speed without touching your mouse:
- `j` / `k` — Vim-style up/down navigation
- `Enter` — Open bookmark
- `Space` — Toggle preview panel
- `s` — Star/unstar
- `d` — Delete
- `/` — Focus search
- `H` — Show help
- `Ctrl+J` — Toggle sidebar
- `Ctrl+K` / `Cmd+D` — Quick save

### 🎨 Pixel Buddies: Your AI Companions

Choose from 5 adorable characters that personalize your experience:
- **Koda** (Scholar) — Professional blue, your reliable knowledge anchor
- **Vex** (Cyber Hunter) — Futuristic neon, filters signal from noise
- **Sprout** (Knowledge Gardener) — Organic growth, where ideas bloom
- **Zing** (Inspiration Explorer) — Golden energy for discovery
- **Null** (Binary Butler) — Minimalist terminal, pure efficiency

### 🔐 Privacy First, Always

Your bookmarks stay on your device. Period.
- 100% local storage in your browser — no cloud servers
- Zero analytics, zero tracking, zero telemetry
- Open-source MIT license — audit the code yourself
- API keys encrypted and stored locally
- AI requests go directly from your browser to your chosen provider

### 🌐 Multi-Provider AI Support

Bring your own API key — AnyMark supports 20+ AI providers including:

**International:** OpenAI, Anthropic Claude, Google Gemini, xAI (Grok), Groq, Azure OpenAI

**Chinese:** DeepSeek, Doubao, Kimi/Moonshot, Tongyi Qianwen, 01.AI, SiliconFlow, Zhipu, MiniMax

**Self-Hosted:** Ollama, OpenRouter, HuggingFace

Switch anytime, rotate multiple keys to avoid rate limits — AnyMark automatically switches when one key hits its limit.

### 🌍 Multi-Language Interface

Available in English, 中文, 日本語, Deutsch, Español, and Français.

---

## 📦 Installation

### From Chrome Web Store (Coming Soon)

1. Visit the Chrome Web Store
2. Click "Add to Chrome"
3. Pin the extension to your toolbar
4. Click the extension icon to start exploring

### From Source (Development)

```bash
# Clone the repository
git clone https://github.com/Johnny-xuan/Anymark.git
cd Anymark/smart-bookmarks

# Install dependencies
npm install

# Build for production
npm run build

# Load in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the smart-bookmarks/dist/ directory
```

### Development Mode

```bash
cd smart-bookmarks
npm run dev
```

Then load the `dist/` directory in Chrome and enable auto-reload.

---

## 🎯 Usage

### Quick Start

1. **Open the Sidebar** — Click the extension icon or press `Ctrl+J`
2. **Import Bookmarks** — Click "Import Chrome Bookmarks" to bring your existing collection
3. **Chat with Your Bookmarks** — Type commands in the chat input:
   - `/find` — Search bookmarks
   - `/ls` — List current directory
   - `/stats` — View statistics
   - `/tree` — Show directory tree
4. **Save a Page** — Press `Cmd+D` (Mac) or `Ctrl+D` (Windows) while browsing

### Example Conversations

```
You: Find my React hooks tutorials

Agent: Found 8 React-related bookmarks:
     • React Hooks Documentation
     • Complete Guide to useEffect
     • Building Custom Hooks Tutorial

     Which one would you like to open?
```

```
You: Move all frontend stuff to Frontend folder

Agent: I found 12 frontend-related bookmarks.
     Moving them to "Frontend" folder... ✅ Done!

     12 bookmarks moved successfully.
```

---

## 🛠️ Technology Stack

- **Frontend** — React 19, TypeScript, Vite
- **State Management** — Zustand
- **Styling** — CSS Modules, CSS-in-JS
- **Build Tool** — Vite 7
- **Testing** — Vitest, React Testing Library
- **Linting** — ESLint, TypeScript Compiler
- **Chrome API** — Manifest V3, Side Panel, Native Bookmarks

---

## 📁 Project Structure

```
smart-bookmarks/
├── src/
│   ├── agent-v3/              # AI Agent architecture (V3/V4)
│   │   ├── Agent.ts           # Main Agent class
│   │   ├── aiService.ts       # AI provider abstraction
│   │   ├── FunctionCallingLoop.ts  # Native function calling
│   │   ├── ReActLoop.ts       # ReAct reasoning loop
│   │   └── prompts/           # System prompts (multi-language)
│   ├── background/            # Service Worker
│   ├── components/            # Shared React components
│   ├── content/               # Content scripts (injected into pages)
│   ├── i18n/                  # Internationalization (6 languages)
│   ├── onboarding/            # First-run experience
│   ├── popup/                 # Quick popup menu
│   ├── services/              # Business logic services
│   ├── sidebar/               # Main sidebar UI
│   │   ├── store/             # Zustand state management
│   │   └── components/        # UI components (30+)
│   ├── styles/                # Global styles
│   ├── types/                 # TypeScript definitions
│   └── utils/                 # Utility functions
├── public/                    # Static assets & Chrome manifest
├── dist/                      # Build output (load in Chrome)
└── package.json               # Dependencies & scripts
```

---

## 🔧 Development

### Available Scripts

```bash
# Build
npm run build          # Production build to dist/
npm run dev            # Dev server with HMR

# Quality
npm run type-check     # TypeScript type checking
npm run lint           # ESLint

# Testing
npm run test           # Run tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report

# I18n
npm run i18n-audit     # Run i18n audit
```

### Agent Architecture

AnyMark uses a **tool-based Agent architecture** with function calling:

```
User Message
    ↓
BookmarkAIAgent.chat()
    ↓
AIService (LLM with Function Calling)
    ↓
ToolRegistry.execute() → 6 Core Tools
    ↓
Results → LLM → User Response
```

**6 Core Tools:**
| Tool | Purpose |
|------|---------|
| `context` | Get overview/folders/stats/filters (read-only) |
| `bookmark` | CRUD, star, restore, move, batch operations |
| `organize` | AI analysis, suggestions, find duplicates (analysis only) |
| `folder` | Create/rename/delete/move folders |
| `search` | Internal bookmark search with filters |
| `discover` | External search (web/GitHub/trending/content extraction) |

### Key Design Patterns

1. **Chrome Native as Single Source of Truth** — All bookmarks stored in Chrome Native API
2. **Metadata Separation** — Extended metadata stored separately via chrome.storage
3. **Optimistic UI Updates** — UI updates immediately, syncs to Chrome in background
4. **Debounced Refresh** — Prevents excessive full-refresh operations
5. **Frecency Algorithm** — Combines visit frequency and recency for importance scoring

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`npm run test && npm run lint`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Follow the existing code style (TypeScript, ESLint)
- Write tests for new features
- Update documentation as needed
- Keep commits atomic and well-described
- Respect the existing project structure

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📧 Contact

- **Website:** https://anymark.j-o-x.tech
- **GitHub:** https://github.com/Johnny-xuan/Anymark
- **Email:** anymark2025@163.com
- **X (Twitter):** [@JohnXuann](https://x.com/JohnXuann)

---

## 🙏 Acknowledgments

Thanks to all open-source projects that make AnyMark possible:
- React and the React community
- Chrome Extension documentation
- All AI providers who make their APIs available
- The open-source community

---

<div align="center">

**Made with ❤️ by [Johnny Xuan](https://github.com/Johnny-xuan)**

⭐ Star this repo if it helped you!

</div>
