/**
 * Mock Bookmark Environment - 类型定义
 * 
 * 定义模拟书签存储的接口和类型
 */

import type { MergedBookmark, MergedFolder, BookmarkAnalytics } from '../../types/chromeBookmark';

// ============ 核心接口 ============

/**
 * 书签存储接口 - BashExecutor 的依赖抽象
 * 
 * 这个接口定义了 BashExecutor 需要的所有书签操作
 * MockBookmarkStore 和真实的 bookmarkStore 都实现这个接口
 */
export interface IBookmarkStore {
  // 数据访问
  readonly bookmarks: MergedBookmark[];
  readonly folders: MergedFolder[];
  
  // 书签操作
  addBookmark(url: string, title: string, folderId?: string): Promise<string | null>;
  updateBookmark(chromeId: string, changes: { title?: string; url?: string }): Promise<void>;
  deleteBookmark(chromeId: string): Promise<void>;
  moveBookmark(chromeId: string, newFolderId: string): Promise<void>;
  
  // 文件夹操作
  createFolder(title: string, parentId?: string): Promise<string | null>;
  renameFolder(chromeId: string, newTitle: string): Promise<void>;
  deleteFolder(chromeId: string): Promise<void>;
  moveFolder(chromeId: string, newParentId: string): Promise<void>;
  
  // 元数据操作
  toggleStarred(chromeId: string): Promise<void>;
  
  // 查询方法（可选，用于测试断言）
  getBookmarkById?(chromeId: string): MergedBookmark | undefined;
  getFolderById?(chromeId: string): MergedFolder | undefined;
}

// ============ 错误类型 ============

/**
 * 错误模式枚举
 */
export enum ErrorMode {
  NOT_FOUND = 'not_found',
  PERMISSION_DENIED = 'permission_denied',
  OPERATION_FAILED = 'operation_failed',
  NETWORK_ERROR = 'network_error',
}

/**
 * Mock Store 错误
 */
export interface MockStoreError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * 创建 MockStoreError
 */
export function createMockStoreError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): MockStoreError {
  return { code, message, details };
}

// ============ 事件类型 ============

/**
 * Store 事件类型
 */
export type StoreEventType =
  | 'bookmark:added'
  | 'bookmark:updated'
  | 'bookmark:deleted'
  | 'bookmark:moved'
  | 'folder:created'
  | 'folder:renamed'
  | 'folder:deleted'
  | 'folder:moved'
  | 'store:reset'
  | 'store:cleared';

/**
 * Store 事件
 */
export interface StoreEvent {
  type: StoreEventType;
  payload: unknown;
  timestamp: number;
}

/**
 * 事件监听器
 */
export type StoreEventListener = (event: StoreEvent) => void;

// ============ Fixture 类型 ============

/**
 * Mock Fixture 定义
 */
export interface MockFixture {
  name: string;
  description: string;
  bookmarks: MockBookmarkData[];
  folders: MockFolderData[];
}

/**
 * Mock 书签数据（用于 Fixture）
 */
export interface MockBookmarkData {
  chromeId: string;
  url: string;
  title: string;
  parentId: string;
  index?: number;
  dateAdded?: number;
  
  // AI 分析数据
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
  analytics?: Partial<BookmarkAnalytics>;
  
  // 状态
  status?: 'active' | 'archived' | 'deleted';
}

/**
 * Mock 文件夹数据（用于 Fixture）
 */
export interface MockFolderData {
  chromeId: string;
  title: string;
  parentId: string;
  index?: number;
  dateAdded?: number;
  dateGroupModified?: number;
}

// ============ 快照类型 ============

/**
 * Store 快照（用于 snapshot/restore）
 */
export interface StoreSnapshot {
  bookmarks: MergedBookmark[];
  folders: MergedFolder[];
  timestamp: number;
}

// ============ 测试环境类型 ============

/**
 * 测试环境配置
 */
export interface TestEnvironmentConfig {
  fixtureName?: string;
  errorMode?: ErrorMode | null;
}

// ============ 辅助函数 ============

/**
 * 生成唯一 ID
 */
export function generateId(prefix: string = 'mock'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 深拷贝对象
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
