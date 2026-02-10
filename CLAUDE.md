# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在此代码库中工作的指导。

## 项目概述

AnyMark 是一个 AI 驱动的 Chrome 书签扩展，其特点是拥有真正的 Agent，可以通过自然语言对话来管理书签。核心差异化在于其基于工具的 Agent 架构，能够自主执行复杂的书签管理任务。

## 项目结构

```
smart-bookmarks/          # Chrome 扩展（主代码库）
├── src/
│   ├── sidebar/          # 侧边栏 UI (React + Zustand)
│   │   ├── components/   # UI 组件
│   │   └── store/        # bookmarkStore.ts - 主状态管理
│   ├── popup/            # 快速弹窗 UI
│   ├── background/       # Service Worker
│   ├── chat/             # AI 聊天 UI + chatStore
│   ├── utils/
│   │   ├── agent/        # AI Agent 核心架构
│   │   │   ├── bookmarkAgent.ts   # 主 Agent 类
│   │   │   ├── toolRegistry.ts    # 工具注册/执行
│   │   │   ├── aiService.ts       # AI 模型抽象层
│   │   │   ├── contextManager.ts  # 对话历史管理
│   │   │   └── tools/
│   │   │       └── coreTools.ts   # 6 个核心工具实现
│   │   ├── frecencyCalculator.ts  # 访问频率评分算法
│   │   ├── aiAnalyzer.ts          # 书签内容分析
│   │   └── chromeSync.ts          # Chrome 原生同步
│   ├── types/            # TypeScript 类型定义
│   └── i18n/             # 6 语言支持
├── dist/                 # 构建输出（在 Chrome 中加载此目录）
└── package.json
```

## 常用命令

```bash
cd smart-bookmarks

# 安装依赖
npm install

# 生产构建
npm run build

# 开发模式（热重载）
npm run dev

# 类型检查
npm run type-check

# 代码检查
npm run lint

# 测试
npm run test              # 运行测试
npm run test:watch        # 监听模式
npm run test:coverage     # 生成覆盖率报告
```

## 加载扩展

1. `cd smart-bookmarks && npm run build`
2. 打开 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序" → 选择 `smart-bookmarks/dist/` 目录

## Agent 架构（核心概念）

Agent 使用**基于工具的架构**配合函数调用：

```
用户消息
    ↓
BookmarkAIAgent.chat()
    ↓
AIService (带函数调用的 LLM)
    ↓
ToolRegistry.execute() → 6 个核心工具
    ↓
结果 → LLM → 用户响应
```

### 6 个核心工具

位于 `src/utils/agent/tools/coreTools.ts`：

| 工具 | 用途 |
|------|---------|
| **context** | 获取概览/文件夹/统计/过滤器（只读） |
| **bookmark** | 增删改查 + 星标/恢复/移动/批量操作 |
| **organize** | AI 分析/建议/查找重复（仅分析） |
| **folder** | 创建/重命名/删除/移动文件夹 |
| **search** | 内部书签搜索（带过滤器） |
| **discover** | 外部搜索（网页/GitHub/热门/内容提取） |

### 关键架构模式

**工具注册模式**：所有工具在 `ToolRegistry` 中注册，负责处理：

- OpenAI 格式转换（用于函数调用）
- 执行生命周期
- 错误处理

**上下文管理**：`ContextManager` 维护：

- 对话历史（最多 50 条消息）
- 系统提示词（设置一次，永不清除）
- 指代解析（"这个" → 具体书签）

**流式支持**：Agent 同时支持流式和非流式：

```typescript
chat(message, context, {
  onToken: (token) => {},     // 流式 token
  onProgress: (stage) => {},   // 进度更新
  onThinkingStep: (step) => {}, // 单个步骤
  onComplete: (response) => {},
  onError: (error) => {}
})
```

## 重要设计决策

### Organize 与 Bookmark 工具的分离

- `organize` = 仅分析/建议（只读 + 分析）
- `bookmark` = 实际的增删改查操作（写操作）
- 这种分离让 Agent 可以先思考再行动

### 批量操作确认流程

超过阈值的操作会触发确认：

```typescript
// 返回: { requiresConfirmation: true, confirmationId, ... }
bookmark({ action: 'batchMove', bookmarkIds: [...], targetFolderId })
// 用户确认 → bookmark({ action: 'confirmBatch', confirmationId })
```

### Chrome 双向同步

启用时：

- 本地更改 → Chrome 原生书签 API
- Chrome 更改 → 本地 store（通过 `chrome.bookmarks.onChanged`）

### Frecency 算法

`calculateFrecency()` 结合访问频率和最近访问时间：

- 最近访问权重更高
- 用于排序和"衰减状态"（活跃/冷却/冷门/冻结）

## 关键文件参考

| 文件 | 用途 |
|------|---------|
| `src/utils/agent/bookmarkAgent.ts` | Agent 主要编排逻辑 |
| `src/utils/agent/tools/coreTools.ts` | 全部 6 个工具实现 |
| `src/sidebar/store/bookmarkStore.ts` | Zustand 状态管理 |
| `src/background/index.ts` | Service Worker 入口 |
| `src/utils/chromeSync.ts` | Chrome 原生同步 |

## 开发 Agent

**添加新工具：**

1. 创建符合 `Tool` 类型签名的工具函数
2. 在 `bookmarkAgent.ts` 中注册：`this.toolRegistry.register(newTool)`
3. 如需要，更新系统提示词

**调试 Agent 行为：**

- 在 `chrome://extensions/` 的 Service Worker 中启用详细日志
- 检查 `onThinkingStep` 回调获取执行追踪
- 消息存储在 `ContextManager` 中 - 通过 `exportConversation()` 检查

## 重要约束

- **禁止硬编码 API Key** - 由用户提供
- **Chrome Storage 同步** - 所有书签操作必须调用 `persistBookmarks()`
- **批量操作需确认** - 超过 5 个移动、3 个删除需要用户确认
- **撤销仅通过 UI** - Cmd/Ctrl+Z 由 UI 处理，不在 Agent 工具中
