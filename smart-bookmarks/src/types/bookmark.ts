/**
 * 书签和目录的数据类型定义
 */

// 书签类型
export interface IBookmark {
  // 基础信息
  id: string;
  url: string;
  title: string;
  favicon?: string;

  // 分类信息
  // folderPath 是书签位置的唯一来源（统一架构）
  // 所有书签操作都基于此字段，不再使用 AI 虚拟分类
  folderId: string;
  folderPath: string;

  // 用户数据
  userTitle?: string; // 用户自定义标题
  userTags: string[]; // 用户手动标签
  userNotes?: string; // 用户备注
  starred: boolean; // 是否星标
  pinned: boolean; // 是否固定

  // AI生成数据（由 AI 智能分析自动生成）
  aiSummary?: string; // AI摘要
  aiTags: string[]; // AI标签
  aiConfidence?: number; // AI置信度 (0-1)
  aiDifficulty?: 'beginner' | 'intermediate' | 'advanced'; // AI评估难度
  aiTechStack?: string[]; // AI识别的技术栈
  lastAnalyzed?: number; // 最后AI分析时间戳

  // ❌ 已移除 AI 虚拟分类字段（统一使用 folderPath）：
  // aiFolderPath, aiFolderId, aiCategory, aiSubcategory

  // 元数据
  createTime: number; // 创建时间戳
  updateTime: number; // 更新时间戳
  importSource?: 'browser' | 'manual' | 'import'; // 导入来源

  // 统计数据
  analytics: IBookmarkAnalytics;

  // 关系数据
  relatedBookmarks?: string[]; // 相关书签ID列表
  duplicateOf?: string; // 如果是重复项，指向原始书签ID

  // 状态
  status: 'active' | 'archived' | 'deleted';
  archiveTime?: number;

  // Chrome同步
  chromeId?: string; // Chrome书签ID（同步开启时使用）
}

// 书签统计数据
export interface IBookmarkAnalytics {
  visitCount: number; // 访问次数
  lastVisit?: number; // 最后访问时间
  importance: number; // 重要性评分 (0-100)
  readTime?: number; // 阅读时长（秒）
}

// 最近标签页类型（用于 Recent 过滤器）
export interface IRecentTab {
  id: string; // 使用 'tab-' + tabId 作为唯一标识
  tabId: number; // Chrome 标签页 ID
  url: string;
  title: string;
  favicon?: string;
  windowId: number;
  lastAccessed: number;
  isActive: boolean; // 是否当前打开
  isTab: true; // 标记为标签页类型
}

// 目录类型
export interface IFolder {
  id: string;
  title: string;
  parentId?: string; // 父目录ID
  path: string; // 完整路径
  description?: string;
  colorTag?: string; // 颜色标签
  createTime: number;
  updateTime: number;
  order: number; // 排序序号

  // 统计
  bookmarkCount: number;
  subfolderCount: number;

  // Chrome同步
  chromeId?: string; // Chrome 原生文件夹 ID（同步开启时使用）

  // ❌ 已移除 isAIFolder 字段（统一架构，不再区分 AI 文件夹）
}

// AI分析结果
export interface IAIAnalysis {
  summary: string; // 内容摘要（50-80字符）
  tags: string[]; // 推荐标签（3-5个）
  confidence: number; // 置信度（0-1）
  difficulty?: 'beginner' | 'intermediate' | 'advanced'; // 内容难度
  
  // ❌ 已移除分类相关字段（由 Agent 负责分类）：
  // category: string;
  // subcategory?: string;
  // suggestedFolder?: IFolderSuggestion[];
  
  // 保留的可选字段
  duplicates?: IDuplicateMatch[]; // 重复检测结果
  contentType?: string; // 内容类型
  estimatedReadTime?: number; // 预计阅读时间（分钟）
}

// 目录推荐
export interface IFolderSuggestion {
  path: string;
  folderId: string;
  confidence: number;
  reason: string;
}

// 重复匹配
export interface IDuplicateMatch {
  bookmark: IBookmark;
  type: 'exact' | 'similar_title' | 'similar_url';
  similarity: number;
}

// 搜索结果
export interface ISearchResult {
  item: IBookmark;
  score: number; // 相关度评分
  matches: ISearchMatch[]; // 匹配信息
  highlights: Record<string, string>; // 高亮片段
}

// 搜索匹配
export interface ISearchMatch {
  field: string; // 匹配字段
  value: string; // 匹配值
  indices: [number, number][]; // 匹配位置
}

// 过滤器类型
// ❌ 已移除 'ai_category'（统一架构，不再使用 AI 虚拟分类视图）
export type FilterType = 'chrome' | 'starred' | 'recent' | 'popular' | 'longtail' | 'trash' | 'frequent' | 'unvisited' | 'important';

// 排序类型
export type SortType = 'title' | 'date' | 'visits' | 'importance' | 'manual';

// 视图模式
export type ViewMode = 'list' | 'compact';

// 用户设置
export interface IUserSettings {
  // 同步设置
  syncEnabled: boolean;
  chromeSyncEnabled: boolean; // Chrome 双向同步开关（默认 false）
  // ❌ 已移除 syncMode 字段（简化为单一双向同步）
  autoAnalyze: boolean; // 自动AI分析

  // UI设置
  theme: 'light' | 'dark' | 'auto';
  viewMode: ViewMode;
  previewPanelVisible: boolean;
  previewPanelWidth: number; // 百分比
  pixelBuddyTheme: 'classic' | 'cyber' | 'grow' | 'flare' | 'noir';
  openMode: 'sidebar' | 'tab'; // 打开方式：侧边栏或新标签页

  // 功能设置
  softDelete: boolean; // 软删除
  autoArchiveDays: number; // 自动归档天数
  autoDeleteDays: number; // 自动删除天数
  indexedDBEnabled: boolean; // 是否启用IndexedDB用于存储（适用于大量书签）

  // 快捷键
  customKeyBindings?: Record<string, string>;
}

// 导入选项
export interface IImportOptions {
  keepStructure: boolean;
  generateSummaries: boolean;
  detectDuplicates: boolean;
  importFavicons: boolean;
}

// 导入进度
export interface IImportProgress {
  total: number;
  imported: number;
  skipped: number;
  duplicates: number;
  currentItem?: string;
}
