# AnyMark 多浏览器上架指南

## 📋 概述

AnyMark 是基于 **Chrome Extension Manifest V3** 开发的扩展，可以适配多个浏览器平台。本文档介绍如何将扩展上架到不同的浏览器商店。

---

## 🌐 支持的浏览器

| 浏览器 | 兼容性 | 上架难度 | 市场份额 | 推荐度 |
|--------|--------|----------|----------|--------|
| **Chrome** | ✅ 原生支持 | ⭐ 简单 | 65% | ⭐⭐⭐⭐⭐ |
| **Edge** | ✅ 直接兼容 | ⭐ 简单 | 5% | ⭐⭐⭐⭐⭐ |
| **Brave** | ✅ 直接兼容 | ⭐ 简单 | 1% | ⭐⭐⭐⭐ |
| **Vivaldi** | ✅ 直接兼容 | ⭐ 简单 | 0.2% | ⭐⭐⭐ |
| **Opera** | ✅ 直接兼容 | ⭐⭐ 中等 | 1% | ⭐⭐⭐ |
| **Firefox** | ⚠️ 需要适配 | ⭐⭐⭐ 中等 | 3% | ⭐⭐⭐⭐ |
| **Safari** | ❌ 需重写 | ⭐⭐⭐⭐⭐ 困难 | 18% | ⭐⭐ |

---

## ✅ Chromium 系浏览器（直接兼容）

### 1. Microsoft Edge

#### 上架步骤

1. **访问 Edge Add-ons 商店**
   - 网址：https://microsoftedge.microsoft.com/addons
   - 点击 "Publish extensions"

2. **注册开发者账号**
   - 使用 Microsoft 账号登录
   - **无需付费**（与 Chrome 不同）

3. **准备提交材料**
   - 扩展包：直接使用 `dist/` 目录的 ZIP 文件
   - 图标：128x128, 48x48, 16x16
   - 截图：1280x800 或 640x400
   - 描述：支持多语言

4. **提交审核**
   - 填写扩展信息
   - 上传 ZIP 文件
   - 提交审核（通常 1-3 天）

#### 注意事项

- ✅ Edge 完全兼容 Chrome Extension Manifest V3
- ✅ 无需修改代码
- ✅ 审核速度通常比 Chrome 快
- ✅ 无需注册费

---

### 2. Brave

#### 上架步骤

1. **访问 Brave 扩展商店**
   - 网址：https://chrome.google.com/webstore
   - Brave 使用 Chrome Web Store

2. **无需单独上架**
   - 用户可以直接从 Chrome Web Store 安装
   - Brave 会自动同步 Chrome 扩展

#### 注意事项

- ✅ 完全兼容 Chrome 扩展
- ✅ 无需单独提交
- ✅ 用户安装体验与 Chrome 相同

---

### 3. Vivaldi

#### 上架步骤

1. **访问 Vivaldi 扩展商店**
   - 网址：https://chrome.google.com/webstore
   - Vivaldi 也使用 Chrome Web Store

2. **无需单独上架**
   - 用户可以直接从 Chrome Web Store 安装

#### 注意事项

- ✅ 完全兼容 Chrome 扩展
- ✅ 无需单独提交

---

### 4. Opera

#### 上架步骤

1. **访问 Opera Add-ons 商店**
   - 网址：https://addons.opera.com/

2. **注册开发者账号**
   - 需要 Opera 账号
   - **无需付费**

3. **准备提交材料**
   - 扩展包：直接使用 `dist/` 目录的 ZIP 文件
   - 图标：128x128, 48x48, 16x16
   - 截图：1280x800 或 640x400

4. **提交审核**
   - 填写扩展信息
   - 上传 ZIP 文件
   - 提交审核（通常 1-2 天）

#### 注意事项

- ⚠️ Opera 基于 Chromium，但可能需要小幅调整
- ⚠️ 某些 API 可能不完全支持
- ✅ 大部分功能可以直接使用

---

## 🦊 Firefox（需要适配）

### 兼容性分析

| 功能 | Chrome | Firefox | 兼容性 |
|------|--------|---------|--------|
| Manifest V3 | ✅ | ⚠️ 部分支持 | ⚠️ |
| Side Panel API | ✅ | ✅ | ✅ |
| Service Worker | ✅ | ✅ | ✅ |
| Storage API | ✅ | ✅ | ✅ |
| Bookmarks API | ✅ | ✅ | ✅ |
| Tabs API | ✅ | ✅ | ✅ |
| Notifications API | ✅ | ✅ | ✅ |
| Context Menus API | ✅ | ✅ | ✅ |
| Alarms API | ✅ | ✅ | ✅ |
| Scripting API | ✅ | ⚠️ 部分支持 | ⚠️ |

### 适配步骤

#### 1. 创建 Firefox 专用 manifest

创建 `manifest.firefox.json`：

```json
{
  "manifest_version": 2,
  "name": "AnyMark - The First Bookmark Agent",
  "version": "1.0.0",
  "description": "AI-powered bookmark manager with smart search and organization",
  "icons": {
    "16": "icon-16.png",
    "48": "icon-48.png",
    "128": "icon-128.png"
  },
  "browser_action": {
    "default_popup": "popup.html",
    "default_title": "AnyMark - Bookmark Freely",
    "default_icon": {
      "16": "icon-16.png",
      "48": "icon-48.png",
      "128": "icon-128.png"
    }
  },
  "background": {
    "scripts": ["background.js"],
    "persistent": false
  },
  "permissions": [
    "bookmarks",
    "storage",
    "tabs",
    "activeTab",
    "notifications",
    "contextMenus",
    "alarms"
  ],
  "optional_permissions": ["<all_urls>"],
  "sidebar_action": {
    "default_panel": "sidebar.html",
    "default_title": "AnyMark"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content-toast.js"],
      "run_at": "document_end"
    },
    {
      "matches": ["<all_urls>"],
      "js": ["content-pixel-buddy.js"],
      "run_at": "document_end"
    }
  ],
  "commands": {
    "quick_save": {
      "suggested_key": {
        "default": "Alt+Shift+S"
      },
      "description": "快速收藏当前页面"
    },
    "open_popup": {
      "suggested_key": {
        "default": "Alt+Shift+D"
      },
      "description": "打开详细保存面板"
    },
    "open-sidebar-tab": {
      "suggested_key": {
        "default": "Alt+Shift+B"
      },
      "description": "打开书签管理器"
    }
  }
}
```

#### 2. 主要差异

| Chrome (MV3) | Firefox (MV2) | 说明 |
|--------------|---------------|------|
| `action` | `browser_action` | 侧边栏入口 |
| `side_panel` | `sidebar_action` | 侧边栏 API |
| `background.service_worker` | `background.scripts` | 后台脚本 |
| `host_permissions` | `optional_permissions` | 权限声明 |
| `manifest_version: 3` | `manifest_version: 2` | 版本差异 |

#### 3. 代码适配

**Background Script 适配**

Chrome (MV3):
```typescript
// background/index.ts
chrome.runtime.onInstalled.addListener(() => {
  console.log('AnyMark installed');
});
```

Firefox (MV2):
```typescript
// background.firefox.ts
browser.runtime.onInstalled.addListener(() => {
  console.log('AnyMark installed');
});
```

**使用 Polyfill**

安装 `webextension-polyfill`：

```bash
npm install webextension-polyfill
```

```typescript
import browser from 'webextension-polyfill';

// 统一使用 browser API
browser.runtime.onInstalled.addListener(() => {
  console.log('AnyMark installed');
});
```

#### 4. 构建配置

修改 `vite.config.ts`：

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        'background': './src/background/index.ts',
        'background.firefox': './src/background/index.firefox.ts',
      }
    }
  }
});
```

#### 5. 上架步骤

1. **访问 Firefox Add-ons 商店**
   - 网址：https://addons.mozilla.org/

2. **注册开发者账号**
   - 需要 Firefox 账号
   - **无需付费**

3. **准备提交材料**
   - 扩展包：使用 Firefox 适配版本
   - 图标：128x128, 64x64, 48x48, 32x32, 16x16
   - 截图：1280x800 或 640x400
   - 源代码：必须提供（Firefox 要求）

4. **提交审核**
   - 填写扩展信息
   - 上传扩展包和源代码
   - 提交审核（通常 3-7 天）

#### 注意事项

- ⚠️ Firefox 仍在逐步支持 Manifest V3
- ⚠️ 需要提供源代码
- ⚠️ 审核时间较长
- ⚠️ 某些 API 可能不完全支持

---

## 🍎 Safari（需要重写）

### 兼容性分析

| 功能 | Chrome | Safari | 兼容性 |
|------|--------|--------|--------|
| Extension API | ✅ | ⚠️ 部分支持 | ❌ |
| Side Panel | ✅ | ❌ 不支持 | ❌ |
| Service Worker | ✅ | ❌ 不支持 | ❌ |
| Bookmarks API | ✅ | ❌ 不支持 | ❌ |

### 为什么不建议

- ❌ Safari 不支持 Side Panel API
- ❌ Safari 不支持 Service Worker
- ❌ Safari 不支持 Bookmarks API
- ❌ 需要使用原生 Swift/Objective-C 重写
- ❌ 开发成本极高

### 替代方案

如果需要支持 Safari，可以考虑：

1. **使用 Safari App Extension**
   - 需要使用 Xcode 开发
   - 需要苹果开发者账号（$99/年）
   - 功能受限

2. **提供 Web 版本**
   - 作为独立 Web 应用
   - 通过书签或快捷方式访问
   - 功能可能受限

---

## 📊 上架优先级建议

### 第一阶段（立即实施）

| 浏览器 | 预估工作量 | 预期收益 | 推荐度 |
|--------|-----------|----------|--------|
| **Chrome** | 0 小时 | 高用户量 | ⭐⭐⭐⭐⭐ |
| **Edge** | 0.5 小时 | 中等用户量 | ⭐⭐⭐⭐⭐ |

### 第二阶段（近期实施）

| 浏览器 | 预估工作量 | 预期收益 | 推荐度 |
|--------|-----------|----------|--------|
| **Firefox** | 8-16 小时 | 中等用户量 | ⭐⭐⭐⭐ |

### 第三阶段（长期考虑）

| 浏览器 | 预估工作量 | 预期收益 | 推荐度 |
|--------|-----------|----------|--------|
| **Opera** | 1-2 小时 | 低用户量 | ⭐⭐⭐ |
| **Safari** | 40-80 小时 | 高用户量 | ⭐⭐ |

---

## 🚀 快速上架清单

### Chromium 系（Chrome + Edge）

- [ ] 构建 Chrome 版本：`npm run build`
- [ ] 准备 Chrome 商店材料（见 `CHROME_STORE_PREPARATION.md`）
- [ ] 提交 Chrome Web Store 审核
- [ ] Chrome 审核通过后，直接提交 Edge 商店
- [ ] Brave、Vivaldi 用户可直接从 Chrome 商店安装

### Firefox

- [ ] 创建 `manifest.firefox.json`
- [ ] 适配 background script
- [ ] 安装 `webextension-polyfill`
- [ ] 测试所有功能
- [ ] 准备 Firefox 商店材料
- [ ] 提交 Firefox Add-ons 审核

---

## 💡 最佳实践

### 1. 版本管理

建议使用不同的版本号：

```json
// Chrome
"version": "1.0.0"

// Firefox
"version": "1.0.0.1"
```

### 2. 统一构建流程

创建构建脚本：

```json
{
  "scripts": {
    "build": "vite build",
    "build:chrome": "vite build",
    "build:firefox": "cross-env BROWSER=firefox vite build",
    "build:all": "npm run build:chrome && npm run build:firefox"
  }
}
```

### 3. 功能降级

对于不支持的 API，提供降级方案：

```typescript
// Side Panel 降级
if (chrome.sidePanel) {
  chrome.sidePanel.open();
} else {
  // 使用 popup 或新标签页
  chrome.tabs.create({ url: 'sidebar.html' });
}
```

### 4. 统一更新维护

- 保持 Chrome 和 Firefox 版本功能同步
- 定期检查各浏览器的 API 更新
- 及时修复兼容性问题

---

## 📞 参考资源

### 官方文档

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Firefox Extension Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Edge Extension Docs](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/)

### 工具

- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)
- [Extension Automator](https://github.com/GoogleChromeLabs/extension-automator)

---

## ✅ 总结

### 可以直接上架（无需修改代码）
- ✅ Chrome
- ✅ Edge
- ✅ Brave
- ✅ Vivaldi

### 需要小幅适配
- ⚠️ Firefox（8-16 小时工作量）

### 不推荐
- ❌ Opera（用户量低）
- ❌ Safari（需要完全重写）

### 推荐上架顺序
1. **Chrome** → 2. **Edge** → 3. **Firefox**

这样可以覆盖约 73% 的浏览器市场份额。
