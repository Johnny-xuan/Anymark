# Chrome Sync Redesign - 迁移指南

## 概述

本文档描述了从旧架构迁移到新架构（Chrome Native 作为唯一数据源）的步骤。

## 新架构文件

### 核心服务 (`src/services/`)
- `bookmarkService.ts` - Chrome Native 书签操作
- `metadataService.ts` - 书签元数据管理
- `exportService.ts` - 书签导出功能
- `migrationService.ts` - 数据迁移
- `index.ts` - 统一导出

### 类型定义 (`src/types/`)
- `chromeBookmark.ts` - 新架构类型定义

### Store (`src/sidebar/store/`)
- `bookmarkStoreV2.ts` - 新架构 Zustand store

### UI 组件 (`src/sidebar/components/`)
- `BookmarkList/BookmarkListV2.tsx` - 新架构书签列表
- `EditDialog/EditDialogV2.tsx` - 新架构编辑对话框
- `FolderSelector/FolderSelectorV2.tsx` - 新架构文件夹选择器

### Background (`src/background/`)
- `bookmarkServiceInit.ts` - 新架构初始化模块

## 旧架构文件（待清理）

以下文件在新架构完全稳定后可以移除或重构：

### 可移除的文件
- `src/utils/chromeSync.ts` - 旧的同步逻辑（被 BookmarkService 替代）
- `src/utils/conflictResolver.ts` - 冲突解决器（新架构不需要）
- `src/utils/chromeExportService.ts` - 旧的导出服务（被 ExportService 替代）

### 需要重构的文件
- `src/sidebar/store/bookmarkStore.ts` - 旧 store，需要逐步迁移到 V2
- `src/types/bookmark.ts` - 旧类型定义，需要移除 `id` 字段

## 迁移步骤

### 阶段 1：并行运行（当前阶段）
1. ✅ 新架构服务已创建
2. ✅ V2 组件已创建
3. ⏳ 在 Sidebar 中切换使用 V2 组件
4. ⏳ 测试新架构功能

### 阶段 2：逐步迁移
1. 更新 Sidebar.tsx 使用 BookmarkListV2
2. 更新 EditDialog 引用
3. 更新 FolderSelector 引用
4. 测试所有功能

### 阶段 3：清理旧代码
1. 移除旧的 chromeSync.ts
2. 移除旧的 bookmarkStore.ts
3. 更新 bookmark.ts 类型定义
4. 移除未使用的导入

## 类型变更

### 旧类型 (IBookmark)
```typescript
interface IBookmark {
  id: string;           // 内部 ID（移除）
  chromeId?: string;    // Chrome ID（变为主键）
  folderPath: string;   // 文件夹路径
  // ...
}
```

### 新类型 (MergedBookmark)
```typescript
interface MergedBookmark {
  chromeId: string;     // Chrome ID 作为主键
  parentId: string;     // 父文件夹 Chrome ID
  // Chrome Native 数据 + 元数据合并
}
```

## 注意事项

1. **数据迁移**：MigrationService 会自动检测并迁移旧数据
2. **向后兼容**：旧组件仍然可用，直到完全迁移
3. **测试**：在移除旧代码前，确保所有功能正常工作
4. **备份**：建议用户在迁移前导出书签

## 测试清单

- [ ] 书签创建
- [ ] 书签编辑
- [ ] 书签删除
- [ ] 书签移动
- [ ] 文件夹创建
- [ ] 文件夹重命名
- [ ] 文件夹删除
- [ ] 搜索功能
- [ ] 过滤功能
- [ ] 导出功能
- [ ] 数据迁移
