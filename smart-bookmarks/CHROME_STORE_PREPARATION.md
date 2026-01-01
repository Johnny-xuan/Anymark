# Chrome Web Store 上架准备指南

## 📋 上架前检查清单

### 1. 构建生产版本

```bash
cd smart-bookmarks
npm install
npm run build
```

构建完成后，将生成 `dist/` 目录，这是需要上传到 Chrome Web Store 的文件。

### 2. 必需文件清单

#### ✅ 已有文件
- [x] `manifest.json` - 扩展配置文件
- [x] 图标文件 (16x16, 48x48, 128x128)
- [x] 源代码和资源文件

#### 📝 需要准备的文件
- [ ] **商店截图** (至少 1 张，最多 5 张)
  - 推荐：1280x800 或 640x400 像素
  - 展示主要功能：AI 聊天、书签管理、搜索等
- [ ] **宣传横幅** (可选，推荐 1 张)
  - 尺寸：440x280 像素
  - 展示扩展品牌和核心价值
- [ ] **隐私政策** (必需)
  - URL 或文档链接
  - 说明数据收集和使用方式
- [ ] **商店描述** (多语言)
  - 简短描述 (最多 132 字符)
  - 详细描述
- [ ] **分类标签**
  - 选择合适的扩展类别

### 3. 商店信息准备

#### 扩展基本信息
- **名称**: AnyMark - The First Bookmark Agent
- **简短描述**: AI-powered bookmark manager with smart search and organization
- **详细描述**: 见下方模板

#### 分类
- **主要类别**: 生产力工具 (Productivity)
- **次要类别**: 工具 (Tools)

#### 语言支持
- 英语 (默认)
- 中文 (简体)
- 德语
- 西班牙语
- 法语
- 日语

---

## 📝 商店描述模板

### 英语 (默认)

**简短描述** (132 字符内):
```
AI-powered bookmark manager with smart search and organization. Free & open-source.
```

**详细描述**:
```
🎉 AnyMark - The First Bookmark AI Agent

Transform your bookmark management with AI-powered intelligence. AnyMark isn't just a bookmark manager—it's your personal AI assistant that understands natural language and helps you organize, search, and discover bookmarks effortlessly.

✨ KEY FEATURES

🤖 AI Smart Assistant
• Natural language conversation to manage bookmarks
• "Find Python tutorials" → searches your collection
• "Organize my dev resources" → analyzes and re-categorizes
• "What's trending?" → searches GitHub for you
• "Clean up unused bookmarks" → identifies rarely used items
• Chat history saved automatically (last 50 messages)

🔍 Intelligent Search
• Real-time fuzzy search with pinyin support
• Multi-dimensional filtering: Chrome/AI Categories/Starred/Recent/Popular/Trash
• Search highlights and instant results
• Semantic search powered by AI

📚 Bookmark Management
• Real-time two-way sync with Chrome bookmarks
• Folder management with drag-and-drop
• Star favorites and soft delete (recycle bin)
• Batch operations and import/export (JSON)

⌨️ Keyboard Navigation
• Vim-style shortcuts: j/k to navigate, s to star, d to delete
• Global shortcuts: Alt+Shift+B (sidebar), Alt+A (AI assistant)
• Full keyboard control for power users

🌐 Multi-language Support
• English, Chinese (Simplified), German, Spanish, French, Japanese

🔐 Privacy First
• 100% local storage - no data uploaded
• Use your own API keys for AI features
• Open source and fully auditable

🚀 AI CONFIGURATION

AnyMark supports multiple AI providers:
• OpenAI (GPT-4/3.5)
• Anthropic (Claude)
• Google (Gemini)
• DeepSeek
• Qwen, Doubao, Kimi
• Local models (Ollama)

Or use the built-in local analysis for free!

📦 WHAT'S INCLUDED

• AI Agent with tool registry system
• 30+ React components
• Chrome native sync
• IndexedDB for large bookmark collections
• Comprehensive keyboard shortcuts
• Dark/Light theme support

🆓 100% FREE & OPEN SOURCE

MIT License - use it freely!

---

🔗 SUPPORT & DOCUMENTATION

• GitHub: [Your Repository URL]
• Issues: Report bugs and request features
• Documentation: Full guides available

Made with ❤️ by the AnyMark team
```

### 中文 (简体)

**简短描述**:
```
AI 驱动的智能书签管理器，支持自然语言对话管理。免费开源。
```

**详细描述**:
```
🎉 AnyMark - 世界首个书签 AI Agent

用 AI 智能技术彻底改变您的书签管理体验。AnyMark 不仅仅是书签管理器——它是您的个人 AI 助手，能理解自然语言，帮助您轻松整理、搜索和发现书签。

✨ 核心功能

🤖 AI 智能助手
• 自然语言对话管理书签
• "找一个 Python 教程" → 自动搜索您的收藏
• "整理一下开发资源" → 分析并重新分类
• "最近有什么热门项目？" → 帮您搜索 GitHub
• "清理很久没用的书签" → 找出很少使用的书签
• 对话历史自动保存（最近 50 条）

🔍 智能搜索
• 实时模糊搜索，支持拼音
• 多维过滤：Chrome/AI分类/星标/最近/热门/回收站
• 搜索结果高亮，即时响应
• AI 驱动的语义搜索

📚 书签管理
• Chrome 原生书签实时双向同步
• 文件夹管理，支持拖拽
• 星标收藏和软删除（回收站）
• 批量操作和导入导出（JSON）

⌨️ 键盘导航
• Vim 风格快捷键：j/k 导航，s 加星标，d 删除
• 全局快捷键：Alt+Shift+B（侧边栏），Alt+A（AI 助手）
• 完全键盘控制，适合高效用户

🌐 多语言支持
• 英语、中文（简体）、德语、西班牙语、法语、日语

🔐 隐私优先
• 100% 本地存储 - 不上传任何数据
• 使用自己的 API Key 进行 AI 功能
• 完全开源，可自行审计

🚀 AI 配置

AnyMark 支持多种 AI 服务商：
• OpenAI (GPT-4/3.5)
• Anthropic (Claude)
• Google (Gemini)
• DeepSeek
• 通义千问、豆包、Kimi
• 本地模型 (Ollama)

或使用内置的本地分析，完全免费！

📦 包含内容

• AI Agent 及工具注册系统
• 30+ React 组件
• Chrome 原生同步
• IndexedDB 支持大量书签
• 完整的键盘快捷键
• 明暗主题支持

🆓 100% 免费开源

MIT 许可证 - 随意使用！

---

🔗 支持与文档

• GitHub: [您的仓库地址]
• 问题反馈：报告 bug 和请求功能
• 文档：完整的使用指南

由 AnyMark 团队用 ❤️ 制作
```

---

## 🔒 隐私政策模板

### 必需的隐私政策内容

由于您的扩展使用了 `bookmarks`、`storage`、`tabs`、`activeTab`、`notifications`、`scripting`、`contextMenus`、`alarms` 权限，以及 `<all_urls>` 的 host_permissions，Chrome Web Store 要求提供隐私政策。

### 隐私政策模板

```markdown
# AnyMark Privacy Policy

**Last Updated: [Date]**

## Introduction

AnyMark is a Chrome extension that helps users manage their bookmarks using AI-powered features. We are committed to protecting your privacy and being transparent about how we handle your data.

## Data Collection

### What We Collect

1. **Bookmarks Data**
   - We access your Chrome bookmarks to provide management features
   - All bookmark data is stored locally on your device using IndexedDB
   - No bookmark data is uploaded to any server

2. **Browsing Data**
   - We access the active tab URL when you save a bookmark
   - We extract page content for AI analysis (when enabled)
   - This data is processed locally or sent to your configured AI service

3. **User Preferences**
   - Extension settings and configurations
   - AI API keys (stored locally in Chrome storage)
   - Theme and language preferences
   - Keyboard shortcut customizations

### What We Don't Collect

- We do NOT track your browsing history
- We do NOT collect personal information
- We do NOT send analytics to any server
- We do NOT use cookies or tracking technologies
- We do NOT sell or share your data with third parties

## Data Storage

All data is stored locally on your device:
- Bookmarks: IndexedDB
- Settings: Chrome Storage API
- AI API Keys: Chrome Storage API (encrypted)

## AI Features

When you use AI features:
- Data is sent directly to the AI service you configure (OpenAI, Anthropic, etc.)
- We do NOT act as an intermediary
- Your API keys are stored locally and never sent to our servers
- Review the privacy policy of your chosen AI service for details

## Data Sharing

We do not share your data with any third parties, except:
- AI services you explicitly configure (direct connection)
- Chrome APIs required for extension functionality

## Data Deletion

To delete your data:
1. Remove the extension from Chrome
2. All local data will be deleted automatically
3. Your bookmarks remain in Chrome (synced separately)

## Third-Party Services

The extension may connect to:
- AI services you configure (OpenAI, Anthropic, etc.)
- GitHub API (for search features)
- DuckDuckGo (for search features)

These services have their own privacy policies that you should review.

## Children's Privacy

Our service is not directed to children under 13. We do not knowingly collect personal information from children.

## Changes to This Policy

We may update this privacy policy from time to time. We will notify users of any material changes.

## Contact Us

If you have questions about this privacy policy, please contact us:
- Email: [your-email@example.com]
- GitHub: [your-repository-url]

## Open Source Transparency

AnyMark is 100% open source. You can review our code at:
- GitHub: [your-repository-url]

This allows you to verify exactly how your data is handled.
```

---

## 📸 截图准备建议

### 必需截图 (至少 1 张)

1. **主界面 - 侧边栏**
   - 展示书签列表和 AI 聊天面板
   - 显示搜索和过滤功能

2. **AI 助手对话**
   - 展示自然语言对话
   - 显示 AI 执行操作的结果

3. **书签管理**
   - 展示文件夹结构
   - 显示星标和编辑功能

4. **搜索功能**
   - 展示实时搜索
   - 显示搜索结果高亮

5. **设置面板**
   - 展示 AI 配置选项
   - 显示快捷键设置

### 宣传横幅 (可选)

- 展示品牌标识
- 突出核心价值：AI、智能、免费、开源

---

## 🚀 上架步骤

### 1. 准备开发者账号

1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 登录您的 Google 账号
3. 支付一次性开发者注册费（$5 USD）

### 2. 创建新项目

1. 点击 "New Item"
2. 上传 `dist/` 目录的 ZIP 文件
3. 填写扩展信息

### 3. 填写商店信息

1. **Store Listing**
   - 上传图标和截图
   - 填写描述（多语言）
   - 选择分类
   - 添加隐私政策链接

2. **Privacy**
   - 填写隐私政策 URL 或上传文档

3. **Publishing Options**
   - 选择发布范围（公开/私有）
   - 设置可见地区

### 4. 提交审核

1. 检查所有信息
2. 提交审核
3. 等待审核结果（通常 1-3 天）

### 5. 审核通过后

1. 扩展将发布到 Chrome Web Store
2. 用户可以搜索并安装
3. 收集用户反馈

---

## ⚠️ 常见审核问题

### 权限说明

由于使用了 `<all_urls>` host_permissions，需要在描述中清楚说明：
- 为什么需要访问所有网站（内容脚本、页面分析）
- 数据如何处理（本地存储，不上传）

### AI 功能说明

需要清楚说明：
- AI 功能如何工作
- 数据发送到 AI 服务
- 用户控制自己的 API Key

### 隐私政策

必须提供隐私政策链接，说明：
- 数据收集方式
- 数据存储位置
- 数据共享情况

---

## 📞 支持信息

### 联系方式准备

在商店信息中填写：
- **Email**: 支持邮箱
- **Website**: 项目网站或 GitHub
- **Privacy Policy**: 隐私政策 URL

---

## ✅ 上架前最终检查

- [ ] 生产版本已构建 (`dist/` 目录存在)
- [ ] manifest.json 版本号正确
- [ ] 所有图标文件存在且尺寸正确
- [ ] 至少 1 张商店截图
- [ ] 隐私政策已准备
- [ ] 商店描述已填写（多语言）
- [ ] 分类已选择
- [ ] 开发者账号已注册并支付费用
- [ ] 所有功能已测试

---

## 🎉 准备完成！

按照以上步骤准备完成后，您就可以将 AnyMark 发布到 Chrome Web Store 了！

祝上架顺利！🚀
