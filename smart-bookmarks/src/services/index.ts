/**
 * Services Index - 统一导出所有服务
 * 
 * 新架构服务：
 * - BookmarkService: Chrome Native 书签操作
 * - MetadataService: 书签元数据管理
 * - ExportService: 书签导出功能
 * - MigrationService: 数据迁移
 */

// BookmarkService - Chrome Native 书签操作
export {
  BookmarkService,
  getBookmarkService,
  BookmarkServiceError,
  BookmarkNotFoundError,
  InvalidOperationError,
} from './bookmarkService';

// MetadataService - 元数据管理
export {
  MetadataService,
  getMetadataService,
  MetadataServiceError,
} from './metadataService';

// ExportService - 导出功能 (仅在 UI 环境使用，background 不可用)
// 注意：ExportService 使用了 document，不能在 Service Worker 中使用
// 需要使用时直接从 './exportService' 导入
// export {
//   ExportService,
//   getExportService,
// } from './exportService';

// MigrationService - 数据迁移
export {
  MigrationService,
  getMigrationService,
  type MigrationProgress,
  type MigrationResult,
} from './migrationService';

// 类型重导出
export type {
  BookmarkMetadata,
  MergedBookmark,
  MergedFolder,
  MergedItem,
  CreateBookmarkParams,
  UpdateBookmarkParams,
  UpdateMetadataParams,
  CreateFolderParams,
  ExportOptions,
  ExportResult,
  MigrationStatus,
} from '../types/chromeBookmark';

// 常量重导出
export {
  ANYMARK_ROOT_FOLDER_NAME,
  CHROME_SPECIAL_FOLDER_IDS,
  CURRENT_MIGRATION_VERSION,
  DEFAULT_BOOKMARK_METADATA,
  DEFAULT_USER_SETTINGS_V2,
} from '../types/chromeBookmark';

// 类型守卫重导出
export {
  isMergedBookmark,
  isMergedFolder,
} from '../types/chromeBookmark';
