# 🌍 AnyMark 完整国际化实施计划

## 📋 项目概述

**目标：** 为 AnyMark 的所有主要界面实现完整的国际化支持

**已完成：** ✅ Onboarding 页面（6 种语言）

**待完成：**
1. Sidebar (侧边栏) - 主要书签管理界面
2. Popup (弹出窗口) - 扩展图标点击窗口
3. ChatPanel (AI 助手) - 聊天和智能整理界面

---

## 🎯 实施策略

### 阶段 1: 文本提取和分析
1. 扫描所有组件文件
2. 提取所有硬编码的中英文文本
3. 按功能模块分类整理

### 阶段 2: 翻译键设计
1. 设计统一的翻译键命名规范
2. 创建翻译键结构
3. 确保键名清晰、易维护

### 阶段 3: 翻译文件创建
1. 扩展现有的 6 个语言文件
2. 添加新的翻译内容
3. 保持与 onboarding 相同的质量标准

### 阶段 4: 代码重构
1. 在组件中引入 useTranslation hook
2. 替换所有硬编码文本
3. 测试功能完整性

---

## 📁 文件结构

### 当前 i18n 结构
```
smart-bookmarks/src/i18n/
├── config.ts
└── locales/
    ├── en.json          ✅ 已有 onboarding
    ├── zh-CN.json       ✅ 已有 onboarding
    ├── ja.json          ✅ 已有 onboarding
    ├── es.json          ✅ 已有 onboarding
    ├── fr.json          ✅ 已有 onboarding
    └── de.json          ✅ 已有 onboarding
```

### 扩展后的结构
```json
{
  "onboarding": { ... },  // ✅ 已完成
  "sidebar": {            // 🔄 待实施
    "header": { ... },
    "search": { ... },
    "filters": { ... },
    "bookmarks": { ... },
    "preview": { ... },
    "settings": { ... }
  },
  "popup": {              // 🔄 待实施
    "quickActions": { ... },
    "stats": { ... },
    "shortcuts": { ... }
  },
  "chat": {               // 🔄 待实施
    "welcome": { ... },
    "input": { ... },
    "suggestions": { ... },
    "tools": { ... }
  },
  "common": {             // 🔄 待实施
    "buttons": { ... },
    "messages": { ... },
    "errors": { ... }
  }
}
```

---

## 🔍 需要翻译的主要组件

### 1. Sidebar (侧边栏)
**文件：** `smart-bookmarks/src/sidebar/Sidebar.tsx`

**主要文本内容：**
- 顶部工具栏按钮
- 搜索框占位符
- 过滤标签（全部、未分类、已删除等）
- 书签列表项
- 预览面板
- 设置面板
- AI 聊天面板
- 快捷键帮助
- Toast 提示消息

**子组件：**
- SearchBar
- FilterTabs
- BookmarkList
- PreviewPanel
- SettingsPanel
- AIChatPanel
- KeyboardShortcutsHelp

### 2. Popup (弹出窗口)
**文件：** `smart-bookmarks/src/popup/Popup.tsx`

**主要文本内容：**
- 快速操作按钮
- 统计信息
- 快捷方式提示

### 3. ChatPanel (AI 助手)
**文件：** `smart-bookmarks/src/chat/ChatPanel.tsx`

**主要文本内容：**
- 欢迎消息
- 输入框占位符
- 建议操作
- 工具调用提示
- 错误消息

---

## 🚀 实施步骤

### Step 1: 文本审计 (Text Audit)
- [ ] 扫描 Sidebar 及其子组件
- [ ] 扫描 Popup 组件
- [ ] 扫描 ChatPanel 组件
- [ ] 创建完整的文本清单

### Step 2: 翻译键设计
- [ ] 设计 sidebar 翻译键结构
- [ ] 设计 popup 翻译键结构
- [ ] 设计 chat 翻译键结构
- [ ] 设计 common 通用翻译键

### Step 3: 翻译内容创建
- [ ] 扩展 en.json
- [ ] 扩展 zh-CN.json
- [ ] 扩展 ja.json
- [ ] 扩展 es.json
- [ ] 扩展 fr.json
- [ ] 扩展 de.json

### Step 4: 代码重构
- [ ] 重构 Sidebar.tsx
- [ ] 重构 Sidebar 子组件
- [ ] 重构 Popup.tsx
- [ ] 重构 ChatPanel.tsx
- [ ] 更新相关工具函数

### Step 5: 测试验证
- [ ] 功能测试
- [ ] 语言切换测试
- [ ] UI 布局测试
- [ ] 编译测试

---

## 📝 翻译键命名规范

### 规则
1. 使用小驼峰命名：`buttonSave`, `messageSuccess`
2. 按功能模块分组：`sidebar.search.placeholder`
3. 动作类用动词：`save`, `delete`, `analyze`
4. 状态类用形容词：`loading`, `success`, `error`
5. 通用文本放在 `common` 下

### 示例
```typescript
// ✅ 好的命名
t('sidebar.search.placeholder')
t('sidebar.filters.all')
t('common.buttons.save')
t('common.messages.success')

// ❌ 不好的命名
t('text1')
t('sidebar_search_placeholder')
t('SIDEBAR.SEARCH.PLACEHOLDER')
```

---

## 🎨 用户体验考虑

### 语言切换位置
- Sidebar: 设置面板中
- Popup: 顶部工具栏
- 保持与 Onboarding 一致的语言选择器样式

### 文本长度适配
- 考虑不同语言的文本长度差异
- 确保 UI 布局不会因文本过长而破坏
- 使用 CSS 的 `text-overflow: ellipsis` 处理超长文本

### 动态内容
- 数字、日期、时间的本地化格式
- 使用 i18next 的插值功能：`t('message', { count: 5 })`

---

## 🔧 技术实现细节

### 1. 共享 i18n 配置
所有组件使用相同的 i18n 实例：
```typescript
import { useTranslation } from 'react-i18next';
import '../i18n/config';

const MyComponent = () => {
  const { t, i18n } = useTranslation();
  // ...
};
```

### 2. 语言持久化
使用 localStorage 保存用户选择：
```typescript
i18n.changeLanguage(lang);
localStorage.setItem('language', lang);
```

### 3. 动态内容翻译
```typescript
// 带变量的翻译
t('sidebar.bookmarks.count', { count: bookmarks.length })

// 复数形式
t('sidebar.bookmarks.items', { count: 5 })
// en: "5 items"
// zh-CN: "5 个项目"
```

---

## 📊 预估工作量

| 任务 | 预估时间 | 优先级 |
|------|---------|--------|
| 文本审计 | 2-3 小时 | 高 |
| 翻译键设计 | 1-2 小时 | 高 |
| 英文翻译 | 1 小时 | 高 |
| 中文翻译 | 1 小时 | 高 |
| 其他语言翻译 | 2-3 小时 | 中 |
| Sidebar 重构 | 3-4 小时 | 高 |
| Popup 重构 | 1 小时 | 中 |
| ChatPanel 重构 | 2 小时 | 高 |
| 测试验证 | 2 小时 | 高 |
| **总计** | **15-19 小时** | - |

---

## ✅ 成功标准

1. ✅ 所有硬编码文本已移除
2. ✅ 6 种语言完整翻译
3. ✅ 语言切换实时生效
4. ✅ UI 布局在所有语言下正常
5. ✅ 编译无错误
6. ✅ 功能测试通过

---

## 🎯 下一步行动

**建议优先级：**
1. **高优先级：** Sidebar（最常用的界面）
2. **中优先级：** ChatPanel（AI 功能核心）
3. **低优先级：** Popup（使用频率较低）

**实施建议：**
- 先完成 Sidebar 的文本审计和翻译键设计
- 创建完整的翻译文件
- 逐个组件进行重构
- 每完成一个组件就进行测试

---

**准备好开始了吗？我可以立即开始实施！**
