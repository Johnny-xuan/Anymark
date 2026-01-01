/**
 * Chrome Bookmark Types - 新架构类型定义
 * 
 * 设计原则：
 * 1. Chrome Native 作为书签结构的唯一数据源
 * 2. Extension Storage 只存储元数据
 * 3. chromeId 作为主键
 */

// ============ Chrome Native 类型 ============

/**
 * Chrome 原生书签节点（来自 chrome.bookmarks API）
 * 这是 Chrome 提供的标准类型，我们直接使用
 */
export type ChromeBookmarkTreeNode = chrome.bookmarks.BookmarkTreeNode;

// ============ Extension Storage 类型 ============

/**
 * 书签元数据（存储在 Extension Storage）
 * 只包含扩展特有的数据，不包含 URL、标题等结构数据
 */
export interface BookmarkMetadata {
  // AI 分析结果
  aiTags?: string[];
  aiSummary?: string;
  aiCategory?: string;
  aiSubcategory?: string;
  aiConfidence?: number;
  aiDifficulty?: string;
  aiTechStack?: string[];
  
  // 用户数据
  userTags?: string[];
  userNotes?: string;
  starred?: boolean;
  pinned?: boolean;
  
  // 统计数据
  analytics?: BookmarkAnalytics;
  
  // 元信息
  createdAt?: number;
  updatedAt?: number;
  
  // 导入来源
  importSource?: 'browser' | 'manual' | 'migration';

  // 状态与快照 (用于回收站)
  status?: 'active' | 'deleted';
  snapshot?: {
    title: string;
    url: string;
    parentId: string;
    path: string;
    dateAdded: number;
  };
}

/**
 * 书签统计数据
 */
export interface BookmarkAnalytics {
  visitCount: number;
  lastVisit?: number;
  importance: number;
  readTime?: number;
}

/**
 * Extension Storage 完整结构
 */
export interface ExtensionStorageSchema {
  // AnyMark 根文件夹的 Chrome ID
  anyMarkRootId?: string;
  
  // 书签元数据，以 chromeId 为键
  bookmarkMetadata?: Record<string, BookmarkMetadata>;
  
  // 用户设置（保留现有结构）
  userSettings?: UserSettingsV2;
  
  // 迁移状态
  migrationVersion?: number;
  
  // 旧数据（迁移前）
  bookmarks?: unknown[];  // 旧格式，迁移后删除
  folders?: unknown[];    // 旧格式，迁移后删除
}

/**
 * 用户设置（新版本，移除同步相关设置）
 */
export interface UserSettingsV2 {
  // 外观设置
  theme: 'light' | 'dark';
  viewMode: 'list' | 'grid' | 'compact';
  previewPanelVisible: boolean;
  previewPanelWidth: number;
  
  // 功能设置
  autoAnalyze: boolean;
  softDelete: boolean;
  autoArchiveDays: number;
  autoDeleteDays: number;
  
  // 打开方式
  openMode: 'sidebar' | 'popup' | 'tab';
  
  // Pixel Buddy 主题
  pixelBuddyTheme: string;
  
  // 语言设置
  language?: string;
}

// ============ 合并后的类型（UI 使用）============

/**
 * 合并后的书签（Chrome Native + Metadata）
 * UI 层使用这个类型
 */
export interface MergedBookmark {
  // 来自 Chrome Native（主键）
  chromeId: string;
  
  // 来自 Chrome Native（结构数据）
  url: string;
  title: string;
  parentId: string;
  index?: number;
  dateAdded: number;
  
  // 来自 Metadata（扩展数据）
  aiTags: string[];
  aiSummary?: string;
  aiCategory?: string;
  aiSubcategory?: string;
  aiConfidence?: number;
  aiDifficulty?: string;
  aiTechStack: string[];
  
  userTags: string[];
  userNotes?: string;
  starred: boolean;
  pinned: boolean;
  
  analytics: BookmarkAnalytics;
  
  // 计算属性
  favicon: string;
  
  // 状态（软删除等）
  status: 'active' | 'deleted' | 'archived';
}

/**
 * 合并后的文件夹
 */
export interface MergedFolder {
  // 来自 Chrome Native
  chromeId: string;
  title: string;
  parentId: string;
  index?: number;
  dateAdded: number;
  dateGroupModified?: number;
  
  // 计算属性
  bookmarkCount: number;
  subfolderCount: number;
  path: string;  // 完整路径，如 "/AnyMark/Frontend/React"
}

/**
 * 书签或文件夹的联合类型
 */
export type MergedItem = MergedBookmark | MergedFolder;

/**
 * 类型守卫：判断是否为书签
 */
export function isMergedBookmark(item: MergedItem): item is MergedBookmark {
  return 'url' in item && typeof item.url === 'string';
}

/**
 * 类型守卫：判断是否为文件夹
 */
export function isMergedFolder(item: MergedItem): item is MergedFolder {
  return !('url' in item);
}

// ============ 操作相关类型 ============

/**
 * 创建书签的参数
 */
export interface CreateBookmarkParams {
  url: string;
  title: string;
  parentId?: string;  // 默认为 AnyMark_Root
  index?: number;
}

/**
 * 更新书签的参数
 */
export interface UpdateBookmarkParams {
  title?: string;
  url?: string;
}

/**
 * 更新元数据的参数
 */
export interface UpdateMetadataParams {
  aiTags?: string[];
  aiSummary?: string;
  aiCategory?: string;
  aiSubcategory?: string;
  aiConfidence?: number;
  aiDifficulty?: string;
  aiTechStack?: string[];
  userTags?: string[];
  userNotes?: string;
  starred?: boolean;
  pinned?: boolean;
  analytics?: Partial<BookmarkAnalytics>;
}

/**
 * 创建文件夹的参数
 */
export interface CreateFolderParams {
  title: string;
  parentId?: string;  // 默认为 AnyMark_Root
  index?: number;
}

// ============ 事件相关类型 ============

/**
 * 书签事件类型
 */
export type BookmarkEventType = 'created' | 'removed' | 'changed' | 'moved';

/**
 * 书签事件数据
 */
export interface BookmarkEvent {
  type: BookmarkEventType;
  chromeId: string;
  data?: ChromeBookmarkTreeNode | chrome.bookmarks.BookmarkChangeInfo | chrome.bookmarks.BookmarkMoveInfo;
}

// ============ 导出相关类型 ============

/**
 * 导出选项
 */
export interface ExportOptions {
  includeMetadata: boolean;  // 是否包含元数据（作为描述）
  format: 'html' | 'json';
}

/**
 * 导出结果
 */
export interface ExportResult {
  success: boolean;
  data: string;
  bookmarkCount: number;
  folderCount: number;
  error?: string;
}

// ============ 迁移相关类型 ============

/**
 * 迁移状态
 */
export interface MigrationStatus {
  version: number;
  completed: boolean;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  stats?: {
    totalBookmarks: number;
    migratedBookmarks: number;
    failedBookmarks: number;
    totalFolders: number;
    migratedFolders: number;
  };
}

// ============ 常量 ============

/**
 * AnyMark 根文件夹名称
 */
export const ANYMARK_ROOT_FOLDER_NAME = 'AnyMark';

/**
 * Chrome 特殊文件夹 ID
 */
export const CHROME_SPECIAL_FOLDER_IDS = {
  ROOT: '0',
  BOOKMARKS_BAR: '1',
  OTHER_BOOKMARKS: '2',
  MOBILE_BOOKMARKS: '3',
} as const;

/**
 * 当前迁移版本
 */
export const CURRENT_MIGRATION_VERSION = 2;

/**
 * 默认书签元数据
 */
export const DEFAULT_BOOKMARK_METADATA: BookmarkMetadata = {
  aiTags: [],
  userTags: [],
  starred: false,
  pinned: false,
  analytics: {
    visitCount: 0,
    importance: 50,
  },
  importSource: 'browser',
};

/**
 * 默认用户设置
 */
export const DEFAULT_USER_SETTINGS_V2: UserSettingsV2 = {
  theme: 'dark',
  viewMode: 'list',
  previewPanelVisible: true,
  previewPanelWidth: 40,
  autoAnalyze: true,
  softDelete: true,
  autoArchiveDays: 90,
  autoDeleteDays: 180,
  openMode: 'sidebar',
  pixelBuddyTheme: 'classic',
};
