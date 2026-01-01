# GitHub 仓库创建指南

## 1. 创建仓库

访问 https://github.com/new

### 填写信息：

| 字段 | 填写内容 |
|------|----------|
| **Repository name** | `anymark` |
| **Description** | `🔖 The First Bookmark AI Agent - Chat with AI to manage bookmarks. Vim-style shortcuts, privacy-first, 100% free & open-source.` |
| **Visibility** | Public |
| **Initialize** | ❌ 不勾选任何选项（我们已有代码） |

点击 **Create repository**

---

## 2. 推送代码

```bash
# 在项目根目录执行
git remote add origin https://github.com/Johnny-xuan/Anymark.git
git branch -M main
git push -u origin main
```

---

## 3. 仓库设置

### About 栏（右侧边栏）
点击齿轮图标编辑：

- **Description**: `🔖 The First Bookmark AI Agent - Chat with AI to manage bookmarks`
- **Website**: `https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID`
- **Topics**: `chrome-extension`, `bookmark-manager`, `ai-agent`, `react`, `typescript`, `open-source`, `productivity`, `vim-shortcuts`

### 勾选：
- ✅ Releases
- ✅ Packages (可选)

---

## 4. 添加 LICENSE 文件

已有 MIT License，确保根目录有 `LICENSE` 文件。

---

## 5. 创建 Release

1. 点击 **Releases** → **Create a new release**
2. 填写：
   - **Tag**: `v1.0.0`
   - **Title**: `v1.0.0 - Initial Release`
   - **Description**: 见下方模板
3. 上传 `smart-bookmarks/anymark-v1.0.0.zip`
4. 点击 **Publish release**

### Release 描述模板：

```markdown
# 🎉 AnyMark v1.0.0 - Initial Release

The First Bookmark AI Agent is here!

## ✨ Features

- 💬 **AI Agent** - Chat with AI to manage bookmarks
- 🔍 **Smart Search** - Real-time fuzzy search with pinyin support
- ⌨️ **Vim Shortcuts** - j/k navigate, s star, d delete
- 🌐 **Resource Discovery** - Find trending projects on GitHub
- 🔐 **Privacy First** - 100% local, use your own API keys
- 🌍 **Multi-language** - EN, 中文, 日本語, DE, ES, FR

## 📦 Installation

### Chrome Web Store (Recommended)
[Install from Chrome Web Store](https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID)

### Manual Install
1. Download `anymark-v1.0.0.zip` below
2. Unzip to a folder
3. Open `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the folder

## 🔧 AI Configuration

Supports: OpenAI, Claude, Gemini, DeepSeek, Ollama (local)

Or use built-in local analysis for free!

---

Made with ❤️
```

---

## 6. 启用 Discussions（可选）

1. **Settings** → **Features** → ✅ **Discussions**
2. 可以用作轻量级论坛

---

## 完成后的仓库 URL

```
https://github.com/Johnny-xuan/Anymark
```

仓库已创建完成。
