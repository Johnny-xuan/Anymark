# Findings: 拖拽系统现状调查

## 已实现

### List 视图 (BookmarkList.tsx:429-498)
- **dragStart**: 设置 `draggedId`，`effectAllowed = 'move'`
- **dragOver**: 检测三个区域（top 25% / center 50% / bottom 25%）
- **drop (center)**: 移入文件夹 ✅ 工作正常
  - 书签 → `moveBookmark(draggedId, targetItem.chromeId)`
  - 文件夹 → `moveFolder(draggedId, targetItem.chromeId)`
- **drop (top/bottom)**: ❌ 未实现 (TODO 注释，仅 console.log)
- **CSS 视觉反馈**: ✅ 已有 top/center/bottom 指示线样式、文件夹高亮动画
- **拖拽手柄**: ✅ `.drag-handle` 样式已有但仅 hover 显示

### BookmarkService 层 (bookmarkService.ts)
- `moveBookmark(chromeId, newParentId, index?)` — 支持 index 参数 ✅ (line 488)
- `moveFolder(chromeId, newParentId, index?)` — 支持 index 参数 ✅ (line 601)
- `collectDescendantIds(chromeId)` — 循环检测 ✅（moveFolder line 623 已内置）

### BookmarkStore 层 (bookmarkStore.ts)
- `moveBookmark(chromeId, newFolderId)` — 乐观更新 ✅ (line 677)，但 **不传 index**
- `moveFolder(chromeId, newParentId)` — 乐观更新 ✅ (line 894)，但 **不传 index**
- `childrenIndex: Map<string, MergedItem[]>` — 可查询同级子项 ✅
- **缺失**: 无 `reorderItem` action

### OptimizedDragHandler.ts
- 批量操作队列、防抖、回滚机制
- 目前未被 BookmarkList 使用

## 未实现

| 功能 | List | Grid | Column |
|------|------|------|--------|
| 拖拽到文件夹 | ✅ | ❌ | ❌ |
| 同级排序 | ❌ (TODO) | ❌ | ❌ |
| 批量拖拽 | ❌ | ❌ | ❌ |
| 悬停自动展开 | ❌ | ❌ | ❌ |
| 自动滚动 | ❌ | ❌ | ❌ |
| 循环检测 (UI) | ❌ | ❌ | ❌ |
| 拖拽预览 | ❌ | ❌ | ❌ |

## 关键发现

1. **Chrome API 原生支持 index**: `chrome.bookmarks.move(id, { parentId, index })` — 排序基础已具备
2. **Store 不传 index**: `moveBookmark` 和 `moveFolder` 签名只接受 `(chromeId, newFolderId)`，需要扩展
3. **Grid/Column 零拖拽支持**: 两个视图的 props 接口没有任何 drag 相关属性
4. **CSS 准备就绪**: List 视图的拖拽指示线样式完整（top/bottom/center），可复用给其他视图
5. **选中集合已有**: `selectedIds: Set<string>` 已在 store 中，可用于批量拖拽
6. **Service 层 index 已支持**: bookmarkService 的 move 方法都接受可选 index 参数
