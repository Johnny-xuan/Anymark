/**
 * Sidebar Components Index
 * 
 * 导出所有侧边栏组件
 * V2 组件使用新的 Chrome Native 架构
 */

// ============ V2 组件（新架构）============

// BookmarkList V2 - 使用 chromeId 作为主键
export { default as BookmarkListV2 } from './BookmarkList/BookmarkListV2';

// EditDialog V2 - 使用新的数据结构
export { default as EditDialogV2 } from './EditDialog/EditDialogV2';

// FolderSelector V2 - 基于 Chrome Native 文件夹
export { default as FolderSelectorV2 } from './FolderSelector/FolderSelectorV2';

// ============ 原有组件（兼容模式）============

// 原有 BookmarkList
export { default as BookmarkList } from './BookmarkList/BookmarkList';

// 原有 EditDialog
export { default as EditDialog } from './EditDialog/EditDialog';

// 原有 FolderSelector
export { default as FolderSelector } from './FolderSelector/FolderSelector';

// 其他组件
export { default as FilterTabs } from './FilterTabs/FilterTabs';
export { default as SearchBar } from './SearchBar/SearchBar';
