/**
 * MigrationService - 数据迁移服务
 * 
 * 功能：
 * 1. 检测旧格式数据
 * 2. 将旧的 Extension Storage 书签迁移到 Chrome Native AnyMark 文件夹
 * 3. 转换元数据格式
 * 4. 清理旧数据
 */

import { getBookmarkService } from './bookmarkService';
import { getMetadataService } from './metadataService';
import {
  type BookmarkMetadata,
  type MigrationStatus,
  CURRENT_MIGRATION_VERSION,
  ANYMARK_ROOT_FOLDER_NAME,
} from '../types/chromeBookmark';
import type { IBookmark, IFolder } from '../types/bookmark';

// ============ 常量 ============

const MIGRATION_STATUS_KEY = 'migrationStatus';
const OLD_BOOKMARKS_KEY = 'bookmarks';
const OLD_FOLDERS_KEY = 'folders';

// ============ MigrationService 类 ============

/**
 * 数据迁移服务
 */
export class MigrationService {
  private static instance: MigrationService;
  
  private constructor() {}
  
  /**
   * 获取单例实例
   */
  static getInstance(): MigrationService {
    if (!MigrationService.instance) {
      MigrationService.instance = new MigrationService();
    }
    return MigrationService.instance;
  }
  
  // ============ 迁移检测 ============
  
  /**
   * 检查是否需要迁移
   */
  async needsMigration(): Promise<boolean> {
    try {
      // 检查迁移状态
      const stored = await chrome.storage.local.get([MIGRATION_STATUS_KEY, OLD_BOOKMARKS_KEY]);
      const status = stored[MIGRATION_STATUS_KEY] as MigrationStatus | undefined;
      const oldBookmarks = stored[OLD_BOOKMARKS_KEY] as IBookmark[] | undefined;
      
      // 如果已经完成当前版本的迁移，不需要再迁移
      if (status?.version === CURRENT_MIGRATION_VERSION && status?.completed) {
        console.log('[MigrationService] Migration already completed for version:', CURRENT_MIGRATION_VERSION);
        return false;
      }
      
      // 如果存在旧格式的书签数据，需要迁移
      if (oldBookmarks && oldBookmarks.length > 0) {
        console.log('[MigrationService] Found', oldBookmarks.length, 'old format bookmarks, migration needed');
        return true;
      }
      
      console.log('[MigrationService] No migration needed');
      return false;
    } catch (error) {
      console.error('[MigrationService] Error checking migration status:', error);
      return false;
    }
  }
  
  /**
   * 获取迁移状态
   */
  async getMigrationStatus(): Promise<MigrationStatus | null> {
    try {
      const stored = await chrome.storage.local.get(MIGRATION_STATUS_KEY);
      return stored[MIGRATION_STATUS_KEY] as MigrationStatus | null;
    } catch {
      return null;
    }
  }
  
  // ============ 迁移执行 ============
  
  /**
   * 执行迁移
   */
  async migrate(onProgress?: (progress: MigrationProgress) => void): Promise<MigrationResult> {
    console.log('[MigrationService] Starting migration...');
    
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migratedBookmarks: 0,
      migratedFolders: 0,
      failedBookmarks: 0,
      errors: [],
    };
    
    try {
      // 更新迁移状态为进行中
      await this.updateMigrationStatus({
        version: CURRENT_MIGRATION_VERSION,
        completed: false,
        startedAt: startTime,
      });
      
      // 1. 加载旧数据
      const stored = await chrome.storage.local.get([OLD_BOOKMARKS_KEY, OLD_FOLDERS_KEY]);
      const oldBookmarks = (stored[OLD_BOOKMARKS_KEY] as IBookmark[]) || [];
      const oldFolders = (stored[OLD_FOLDERS_KEY] as IFolder[]) || [];
      
      console.log('[MigrationService] Found', oldBookmarks.length, 'bookmarks and', oldFolders.length, 'folders to migrate');
      
      if (oldBookmarks.length === 0) {
        // 没有数据需要迁移
        await this.updateMigrationStatus({
          version: CURRENT_MIGRATION_VERSION,
          completed: true,
          completedAt: Date.now(),
          stats: {
            totalBookmarks: 0,
            migratedBookmarks: 0,
            failedBookmarks: 0,
            totalFolders: 0,
            migratedFolders: 0,
          },
        });
        
        result.success = true;
        return result;
      }
      
      // 2. 初始化服务
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      
      await bookmarkService.initialize();
      await metadataService.initialize();
      
      const anyMarkRootId = bookmarkService.getAnyMarkRootId();
      
      // 3. 创建文件夹映射（旧路径 -> 新 chromeId）
      const folderMap = new Map<string, string>();
      folderMap.set('/', anyMarkRootId); // 根目录映射到 AnyMark_Root
      
      // 4. 按路径深度排序文件夹，确保父文件夹先创建
      const sortedFolders = [...oldFolders].sort((a, b) => {
        const depthA = (a.path || '/').split('/').filter(Boolean).length;
        const depthB = (b.path || '/').split('/').filter(Boolean).length;
        return depthA - depthB;
      });
      
      // 5. 迁移文件夹
      for (const folder of sortedFolders) {
        try {
          const folderPath = folder.path || '/';
          if (folderPath === '/') continue; // 跳过根目录
          
          // 获取父路径
          const pathParts = folderPath.split('/').filter(Boolean);
          const parentPath = pathParts.length > 1 
            ? '/' + pathParts.slice(0, -1).join('/')
            : '/';
          const folderName = pathParts[pathParts.length - 1];
          
          // 获取父文件夹的 chromeId
          const parentChromeId = folderMap.get(parentPath) || anyMarkRootId;
          
          // 在 Chrome Native 中创建文件夹
          const newChromeId = await bookmarkService.createFolder({
            title: folderName,
            parentId: parentChromeId,
          });
          
          folderMap.set(folderPath, newChromeId);
          result.migratedFolders++;
          
          console.log('[MigrationService] Migrated folder:', folderPath, '->', newChromeId);
          
          onProgress?.({
            phase: 'folders',
            current: result.migratedFolders,
            total: sortedFolders.length,
            currentItem: folderName,
          });
        } catch (error) {
          console.error('[MigrationService] Failed to migrate folder:', folder.path, error);
          result.errors.push(`Failed to migrate folder ${folder.path}: ${error}`);
        }
      }
      
      // 6. 迁移书签（只迁移 active 状态的书签）
      const activeBookmarks = oldBookmarks.filter(b => b.status === 'active');
      
      for (let i = 0; i < activeBookmarks.length; i++) {
        const bookmark = activeBookmarks[i];
        
        try {
          // 获取目标文件夹的 chromeId
          const folderPath = bookmark.folderPath || '/';
          const parentChromeId = folderMap.get(folderPath) || anyMarkRootId;
          
          // 在 Chrome Native 中创建书签
          const newChromeId = await bookmarkService.createBookmark({
            url: bookmark.url,
            title: bookmark.title,
            parentId: parentChromeId,
          });
          
          // 转换并保存元数据
          const metadata = this.convertToMetadata(bookmark);
          await metadataService.setMetadata(newChromeId, metadata);
          
          result.migratedBookmarks++;
          
          console.log('[MigrationService] Migrated bookmark:', bookmark.title, '->', newChromeId);
          
          onProgress?.({
            phase: 'bookmarks',
            current: result.migratedBookmarks,
            total: activeBookmarks.length,
            currentItem: bookmark.title,
          });
        } catch (error) {
          console.error('[MigrationService] Failed to migrate bookmark:', bookmark.title, error);
          result.errors.push(`Failed to migrate bookmark ${bookmark.title}: ${error}`);
          result.failedBookmarks++;
        }
      }
      
      // 7. 更新迁移状态为完成
      await this.updateMigrationStatus({
        version: CURRENT_MIGRATION_VERSION,
        completed: true,
        startedAt: startTime,
        completedAt: Date.now(),
        stats: {
          totalBookmarks: activeBookmarks.length,
          migratedBookmarks: result.migratedBookmarks,
          failedBookmarks: result.failedBookmarks,
          totalFolders: sortedFolders.length,
          migratedFolders: result.migratedFolders,
        },
      });
      
      result.success = result.failedBookmarks === 0;
      
      console.log('[MigrationService] Migration completed:', result);
      return result;
    } catch (error) {
      console.error('[MigrationService] Migration failed:', error);
      
      // 更新迁移状态为失败
      await this.updateMigrationStatus({
        version: CURRENT_MIGRATION_VERSION,
        completed: false,
        startedAt: startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      
      result.errors.push(`Migration failed: ${error}`);
      return result;
    }
  }
  
  /**
   * 清理旧数据（迁移成功后调用）
   */
  async cleanupOldData(): Promise<void> {
    console.log('[MigrationService] Cleaning up old data...');
    
    try {
      // 备份旧数据（以防万一）
      const stored = await chrome.storage.local.get([OLD_BOOKMARKS_KEY, OLD_FOLDERS_KEY]);
      const backupKey = `backup_${Date.now()}`;
      await chrome.storage.local.set({
        [backupKey]: {
          bookmarks: stored[OLD_BOOKMARKS_KEY],
          folders: stored[OLD_FOLDERS_KEY],
        },
      });
      
      // 删除旧数据
      await chrome.storage.local.remove([OLD_BOOKMARKS_KEY, OLD_FOLDERS_KEY]);
      
      console.log('[MigrationService] Old data cleaned up, backup saved as:', backupKey);
    } catch (error) {
      console.error('[MigrationService] Failed to cleanup old data:', error);
      throw error;
    }
  }
  
  // ============ 私有方法 ============
  
  /**
   * 更新迁移状态
   */
  private async updateMigrationStatus(status: Partial<MigrationStatus>): Promise<void> {
    const current = await this.getMigrationStatus();
    const updated: MigrationStatus = {
      version: CURRENT_MIGRATION_VERSION,
      completed: false,
      ...current,
      ...status,
    };
    
    await chrome.storage.local.set({ [MIGRATION_STATUS_KEY]: updated });
  }
  
  /**
   * 将旧的 IBookmark 转换为新的 BookmarkMetadata
   */
  private convertToMetadata(bookmark: IBookmark): BookmarkMetadata {
    return {
      // AI 分析结果
      aiTags: bookmark.aiTags || [],
      aiSummary: bookmark.aiSummary,
      aiConfidence: bookmark.aiConfidence,
      aiDifficulty: bookmark.aiDifficulty,
      aiTechStack: bookmark.aiTechStack,
      
      // 用户数据
      userTags: bookmark.userTags || [],
      userNotes: bookmark.userNotes,
      starred: bookmark.starred || false,
      pinned: bookmark.pinned || false,
      
      // 统计数据
      analytics: bookmark.analytics ? {
        visitCount: bookmark.analytics.visitCount || 0,
        lastVisit: bookmark.analytics.lastVisit,
        importance: bookmark.analytics.importance || 50,
        readTime: bookmark.analytics.readTime,
      } : {
        visitCount: 0,
        importance: 50,
      },
      
      // 元信息
      createdAt: bookmark.createTime,
      updatedAt: bookmark.updateTime,
      importSource: bookmark.importSource === 'import' ? 'browser' : bookmark.importSource,
    };
  }
}

// ============ 类型定义 ============

/**
 * 迁移进度
 */
export interface MigrationProgress {
  phase: 'folders' | 'bookmarks';
  current: number;
  total: number;
  currentItem?: string;
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  success: boolean;
  migratedBookmarks: number;
  migratedFolders: number;
  failedBookmarks: number;
  errors: string[];
}

// ============ 导出 ============

/**
 * 获取 MigrationService 单例
 */
export function getMigrationService(): MigrationService {
  return MigrationService.getInstance();
}
