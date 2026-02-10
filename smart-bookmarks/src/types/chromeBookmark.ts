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
  aiTechStack?: string[];
  
  // 用户数据
  userTags?: string[];
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
}

/**
 * 用户设置（新版本，移除同步相关设置）
 */
export interface UserSettingsV2 {
  // 外观设置
  theme: 'light' | 'dark';
  viewMode: 'list' | 'grid' | 'column';
  previewPanelVisible: boolean;
  previewPanelWidth: number;
  
  // 功能设置
  autoAnalyze: boolean;
  
  // 打开方式
  openMode: 'sidebar' | 'popup' | 'tab';
  
  // Pixel Buddy 主题
  pixelBuddyTheme: string;
  
  // 语言设置
  language?: string;
}

// ============ 统一节点模型（文件系统范式）============

/**
 * 统一的书签节点类型（文件系统范式）
 * 书签和文件夹使用同一结构，通过 type 字段区分
 */
export interface BookmarkNode {
  // === 核心标识 ===
  id: string;                    // chromeId
  type: 'bookmark' | 'folder';   // 节点类型
  
  // === 树形结构 ===
  parentId: string | null;       // 父节点 ID
  path: string;                  // 缓存的绝对路径，如 "/AnyMark/Frontend/React"
  index?: number;                // 在父节点中的位置
  
  // === 基础属性 ===
  title: string;
  url?: string;                  // 只有 bookmark 有
  dateAdded: number;
  dateModified?: number;         // 文件夹的 dateGroupModified
  
  // === 扩展元数据（内嵌，避免孤儿数据） ===
  metadata: BookmarkNodeMetadata;
  
  // === 软删除状态 ===
  deleted?: boolean;             // 是否已删除
  deletedAt?: number;            // 删除时间
  deletedSnapshot?: {            // 删除前的快照（用于恢复）
    parentId: string;
    path: string;
  };
  
  // === 计算属性（只对 bookmark 有效） ===
  favicon?: string;              // favicon URL
  
  // === 计算属性（只对 folder 有效） ===
  bookmarkCount?: number;        // 直接子书签数量
  subfolderCount?: number;       // 直接子文件夹数量
}

/**
 * 书签节点元数据（内嵌在 BookmarkNode 中）
 */
export interface BookmarkNodeMetadata {
  // AI 分析结果
  aiSummary?: string;
  aiTags?: string[];
  aiTechStack?: string[];
  
  // 用户数据
  userTags?: string[];
  starred?: boolean;
  
  // 统计数据
  analytics?: BookmarkAnalytics;
}

/**
 * 类型守卫：判断是否为书签
 */
export function isBookmarkNode(node: BookmarkNode): node is BookmarkNode & { type: 'bookmark'; url: string } {
  return node.type === 'bookmark';
}

/**
 * 类型守卫：判断是否为文件夹
 */
export function isFolderNode(node: BookmarkNode): node is BookmarkNode & { type: 'folder' } {
  return node.type === 'folder';
}

/**
 * 默认节点元数据
 */
export const DEFAULT_NODE_METADATA: BookmarkNodeMetadata = {
  aiTags: [],
  userTags: [],
  starred: false,
  analytics: {
    visitCount: 0,
    importance: 50,
  },
};

// ============ 转换函数（兼容层）============

/**
 * 将 MergedBookmark 转换为 BookmarkNode
 */
export function mergedBookmarkToNode(bookmark: MergedBookmark, path: string = ''): BookmarkNode {
  return {
    id: bookmark.chromeId,
    type: 'bookmark',
    parentId: bookmark.parentId,
    path,
    index: bookmark.index,
    title: bookmark.title,
    url: bookmark.url,
    dateAdded: bookmark.dateAdded,
    metadata: {
      aiSummary: bookmark.aiSummary,
      aiTags: bookmark.aiTags,
      aiTechStack: bookmark.aiTechStack,
      userTags: bookmark.userTags,
      starred: bookmark.starred,
      analytics: bookmark.analytics,
    },
    deleted: bookmark.status === 'deleted',
    favicon: bookmark.favicon,
  };
}

/**
 * 将 MergedFolder 转换为 BookmarkNode
 */
export function mergedFolderToNode(folder: MergedFolder): BookmarkNode {
  return {
    id: folder.chromeId,
    type: 'folder',
    parentId: folder.parentId,
    path: folder.path,
    index: folder.index,
    title: folder.title,
    dateAdded: folder.dateAdded,
    dateModified: folder.dateGroupModified,
    metadata: DEFAULT_NODE_METADATA,
    bookmarkCount: folder.bookmarkCount,
    subfolderCount: folder.subfolderCount,
  };
}

/**
 * 将 BookmarkNode 转换为 MergedBookmark（兼容旧代码）
 */
export function nodeToMergedBookmark(node: BookmarkNode): MergedBookmark {
  if (node.type !== 'bookmark') {
    throw new Error('Cannot convert folder node to MergedBookmark');
  }
  return {
    chromeId: node.id,
    url: node.url || '',
    title: node.title,
    parentId: node.parentId || '',
    index: node.index,
    dateAdded: node.dateAdded,
    aiTags: node.metadata.aiTags || [],
    aiSummary: node.metadata.aiSummary,
    aiTechStack: node.metadata.aiTechStack || [],
    userTags: node.metadata.userTags || [],
    starred: node.metadata.starred || false,
    pinned: false,
    analytics: node.metadata.analytics || { visitCount: 0, importance: 50 },
    favicon: node.favicon || '',
    status: node.deleted ? 'deleted' : 'active',
  };
}

/**
 * 将 BookmarkNode 转换为 MergedFolder（兼容旧代码）
 */
export function nodeToMergedFolder(node: BookmarkNode): MergedFolder {
  if (node.type !== 'folder') {
    throw new Error('Cannot convert bookmark node to MergedFolder');
  }
  return {
    chromeId: node.id,
    title: node.title,
    parentId: node.parentId || '',
    index: node.index,
    dateAdded: node.dateAdded,
    dateGroupModified: node.dateModified,
    bookmarkCount: node.bookmarkCount || 0,
    subfolderCount: node.subfolderCount || 0,
    path: node.path,
  };
}

// ============ 合并后的类型（兼容层，渐进废弃）============

/**
 * @deprecated 使用 BookmarkNode 替代
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
  aiTechStack: string[];
  
  userTags: string[];
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
  aiTechStack?: string[];
  userTags?: string[];
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

export interface ChromeBookmarkChangeInfo {
  title: string;
  url?: string;
}

export interface ChromeBookmarkMoveInfo {
  parentId: string;
  index: number;
  oldParentId: string;
  oldIndex: number;
}

/**
 * 书签事件数据
 */
export interface BookmarkEvent {
  type: BookmarkEventType;
  chromeId: string;
  data?: ChromeBookmarkTreeNode | ChromeBookmarkChangeInfo | ChromeBookmarkMoveInfo;
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
  openMode: 'sidebar',
  pixelBuddyTheme: 'classic',
};
