# Task Plan: 拖拽系统完整实现

## Goal
为三种视图（List/Grid/Column）实现完整的拖拽功能：同级排序、跨文件夹移动、悬停展开、循环检测、批量拖拽。

## Current Phase: Phase 1

---

## Phase 1: 核心拖拽 Hook + 同级排序 `status: in_progress`

### 改动

1. **扩展 Store** — `moveBookmark(chromeId, newFolderId, index?)` / `moveFolder(chromeId, newParentId, index?)` 支持 index
2. **新增 `reorderItem`** — 同父目录内排序，计算 Chrome index 后调用 move
3. **创建 `useDragAndDrop` hook** — 封装拖拽状态、位置检测、事件处理
4. **重构 BookmarkList** — 使用 hook 替换内联拖拽逻辑，实现同级排序

### Files
- `src/sidebar/store/bookmarkStore.ts` — 扩展 move 签名 + reorderItem
- `src/sidebar/hooks/useDragAndDrop.ts` — 新建核心 hook
- `src/sidebar/components/BookmarkList/BookmarkList.tsx` — 重构

---

## Phase 2: 悬停展开 + 循环检测 `status: pending`

### 改动
5. **悬停自动展开** — hook 内 800ms timer，拖拽悬停在文件夹上触发展开
6. **循环检测 UI** — 拖拽文件夹到自身/后代时 dragPosition = 'forbidden'

### Files
- `src/sidebar/hooks/useDragAndDrop.ts` — 添加 autoExpand + cycle 逻辑

---

## Phase 3: Grid/Column 视图拖拽 `status: pending`

### 改动
7. **GridView 拖拽** — 添加 draggable、drag handlers，复用 hook
8. **ColumnView 拖拽** — 添加 draggable、drag handlers，复用 hook

### Files
- `src/sidebar/components/BookmarkViews/GridView.tsx` — 拖拽支持
- `src/sidebar/components/BookmarkViews/GridView.css` — 拖拽样式
- `src/sidebar/components/BookmarkViews/ColumnView.tsx` — 拖拽支持
- `src/sidebar/components/BookmarkViews/ColumnView.css` — 拖拽样式

---

## Phase 4: 批量拖拽 `status: pending`

### 改动
9. **多选拖拽** — dragStart 时携带 selectedIds，drop 时批量 move

### Files
- `src/sidebar/hooks/useDragAndDrop.ts` — 批量逻辑
- 三个视图组件 — 显示拖拽数量 badge

---

## 不实现（超出范围）
- **跨窗口拖拽** — 需要 Chrome Extension API 深度集成
- **拖拽到删除区** — 可通过右键菜单/按键删除
- **拖拽创建新文件夹** — 低频操作，保持右键菜单方式

## Decisions
| Decision | Rationale |
|----------|-----------|
| 提取共享 Hook | 三个视图共用逻辑，避免重复 |
| Service 层不改 | 已支持 index 参数，只改 Store 层 |
| 800ms 悬停展开 | macOS Finder 标准时间 |
| 循环检测在 UI 层 | Service 层已有检测，UI 层需要视觉反馈 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
