# 项目理解工作流

快速建立对陌生项目的全局认知。

## 第一步：项目概览（5分钟）

### 1.1 读 README

从 README.md 获取：
- [ ] 项目是做什么的？（一句话描述）
- [ ] 主要功能有哪些？
- [ ] 技术栈是什么？
- [ ] 如何运行/构建？

### 1.2 看配置文件

```
package.json → 依赖、脚本命令
tsconfig.json → TypeScript 配置、路径别名
vite.config / webpack.config → 构建配置
.env.example → 环境变量
```

### 1.3 理解目录结构

常见结构模式：

```
# 按功能分层
src/
├── components/    # UI 组件
├── pages/         # 页面
├── hooks/         # 自定义 Hooks
├── utils/         # 工具函数
├── services/      # API 调用
├── store/         # 状态管理
└── types/         # 类型定义

# 按功能模块
src/
├── auth/          # 认证模块
├── user/          # 用户模块
├── product/       # 产品模块
└── shared/        # 共享代码
```

## 第二步：架构理解（10分钟）

### 2.1 找到入口文件

```
Web 应用：src/main.tsx, src/index.tsx, src/App.tsx
Node 服务：src/index.ts, src/server.ts, src/app.ts
CLI 工具：src/cli.ts, bin/
浏览器扩展：background.ts, content.ts, popup.tsx
```

### 2.2 理解核心模块

对每个核心模块，回答：
```
模块名称：_______________
职责是什么：_______________
依赖哪些模块：_______________
被哪些模块依赖：_______________
对外暴露的接口：_______________
```

### 2.3 画模块依赖图

```
简单示例：

┌─────────┐     ┌─────────┐     ┌─────────┐
│   UI    │ ──▶ │  Store  │ ──▶ │   API   │
└─────────┘     └─────────┘     └─────────┘
                    │
                    ▼
              ┌─────────┐
              │  Utils  │
              └─────────┘
```

## 第三步：数据流理解（10分钟）

### 3.1 状态管理

```
使用什么状态管理？
- [ ] React Context
- [ ] Redux / Redux Toolkit
- [ ] Zustand
- [ ] MobX
- [ ] Jotai / Recoil
- [ ] 其他：_______________

状态存储在哪里？_______________
状态如何更新？_______________
组件如何订阅状态？_______________
```

### 3.2 数据获取

```
API 调用方式：
- [ ] fetch
- [ ] axios
- [ ] React Query / SWR
- [ ] GraphQL (Apollo / urql)
- [ ] 其他：_______________

API 定义在哪里？_______________
错误如何处理？_______________
加载状态如何管理？_______________
```

### 3.3 典型数据流

```
用户操作
    ↓
事件处理器
    ↓
调用 Action / API
    ↓
更新 Store / State
    ↓
触发重渲染
    ↓
UI 更新
```

## 第四步：关键文件定位

### 4.1 按问题类型定位

| 问题类型 | 首先检查 |
|---------|---------|
| UI 显示问题 | components/, pages/ |
| 数据不对 | store/, services/, api/ |
| 类型错误 | types/, interfaces/ |
| 构建失败 | 配置文件, tsconfig.json |
| 路由问题 | router/, routes/ |
| 样式问题 | styles/, *.css, *.scss |

### 4.2 按技术栈定位

**React 项目**
```
组件：src/components/
页面：src/pages/ 或 src/views/
Hooks：src/hooks/
Context：src/context/ 或 src/providers/
```

**Vue 项目**
```
组件：src/components/
页面：src/views/
Store：src/store/
Composables：src/composables/
```

**Node.js 项目**
```
路由：src/routes/
控制器：src/controllers/
服务：src/services/
中间件：src/middleware/
模型：src/models/
```

## 第五步：建立心智模型

### 5.1 核心概念

```
这个项目的核心概念/实体是什么？
- _______________
- _______________
- _______________

它们之间的关系是什么？
_______________
```

### 5.2 核心流程

```
用户的主要使用流程是什么？

流程 1：_______________
步骤：1. ___ → 2. ___ → 3. ___

流程 2：_______________
步骤：1. ___ → 2. ___ → 3. ___
```

### 5.3 技术决策

```
为什么选择这个技术栈？
- 框架选择：_______________
- 状态管理：_______________
- 样式方案：_______________

有什么技术债务或已知问题？
- _______________
```

## 快速理解清单

新接触一个项目时，按顺序完成：

- [ ] 读完 README，知道项目做什么
- [ ] 看 package.json，了解技术栈和脚本
- [ ] 浏览目录结构，理解代码组织
- [ ] 找到入口文件，理解启动流程
- [ ] 识别核心模块，理解各自职责
- [ ] 理解状态管理方案
- [ ] 理解数据获取方式
- [ ] 能画出简单的架构图
- [ ] 能描述主要用户流程

## 常见项目类型速查

### Web 前端应用
```
关注点：组件结构、状态管理、路由、API 调用
入口：src/main.tsx → App.tsx → Router → Pages
```

### Node.js 后端服务
```
关注点：路由、中间件、数据库、认证
入口：src/index.ts → app.ts → routes → controllers
```

### 浏览器扩展
```
关注点：manifest.json、background、content script、popup
入口：manifest.json 定义各入口点
特殊：Chrome API、消息传递、存储
```

### CLI 工具
```
关注点：命令解析、参数处理、输出格式
入口：bin/ 或 src/cli.ts
常用库：commander, yargs, inquirer
```

### Monorepo
```
关注点：包管理、依赖关系、构建顺序
入口：根目录 package.json、packages/
工具：lerna, turborepo, nx, pnpm workspace
```
