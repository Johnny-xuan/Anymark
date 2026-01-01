# AnyMark 🔖

**你的第一个书签 AI 助手**

> 不只是 AI 加持，而是一个真正帮你干活的 Agent。

---

## 这是什么？

AnyMark 是一个 Chrome 书签管理扩展，但它不只是帮你存链接——它有一个 AI Agent，能听懂你说的话，然后自己去执行。

比如你可以说：
- "帮我找 React 相关的书签" → 它会搜索你的收藏
- "整理一下我的开发资源" → 它会分析并重新分类
- "最近有什么热门项目？" → 它会去 GitHub 帮你找
- "清理一下很久没用的书签" → 它会找出来让你确认

**不用点来点去，直接说就行。**

---

## 主要功能

### 💬 对话式管理
跟 AI 聊天就能管理书签，不用学习复杂的操作界面。

### 🧠 智能分析
每个书签都会自动生成摘要和标签，方便以后找。

### 📊 活跃度追踪
书签会根据你的使用频率自动标记状态：
- 🟢 常用（7天内访问过）
- 🟡 偶尔用（30天内）
- 🔵 很少用（90天内）
- ❄️ 吃灰了（超过90天没碰）

### ⌨️ 键盘党友好
支持 Vim 风格快捷键：`j/k` 上下移动，`s` 加星标，`d` 删除，`/` 搜索...

### 🌐 发现新资源
不只是管理已有书签，还能帮你在网上找新的学习资源和热门项目。

---

## 安装

```bash
git clone https://github.com/user/anymark.git
cd anymark/smart-bookmarks
npm install
npm run build
```

然后在 Chrome 扩展页面加载 `smart-bookmarks/dist/` 文件夹。

---

## AI 配置

AnyMark 支持多种 AI 服务商，你可以用自己的 API Key：
- OpenAI (GPT-4/3.5)
- Anthropic (Claude)
- Google (Gemini)
- DeepSeek
- 本地模型 (Ollama)

在扩展设置里配置就行。

---

## 快捷键

| 按键 | 功能 |
|------|------|
| `Alt+Shift+B` | 打开书签管理器 |
| `Alt+Shift+S` | 快速保存当前页 |
| `/` | 搜索 |
| `j` / `k` | 上下移动 |
| `s` | 加星标 |
| `d` | 删除 |
| `Enter` | 打开书签 |
| `H` | 显示所有快捷键 |

---

## 技术栈

React 18 + TypeScript + Vite + Zustand + Chrome Extension Manifest V3

支持 IndexedDB 存储，书签多了也不卡。

---

## License

MIT - 随便用。

---

<p align="center">
  Made with ❤️
</p>
