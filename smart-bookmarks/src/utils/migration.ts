/**
 * 数据迁移服务
 * 
 * 负责将 AI 虚拟分类数据迁移到 Chrome 文件夹结构
 * 这是统一书签架构的关键步骤
 */

// 迁移结果接口
export interface MigrationResult {
  migrated: number;      // 成功迁移的书签数量
  skipped: number;       // 跳过的书签数量
  errors: string[];      // 错误信息列表
  message?: string;      // 迁移状态消息
  foldersCreated: number; // 创建的文件夹数量
}

// 迁移日志接口
export interface MigrationLog {
  timestamp: number;
  migrated: number;
  skipped: number;
  foldersCreated: number;
  errors: string[];
  duration: number;
}

// 迁移状态存储键
const MIGRATION_COMPLETED_KEY = 'aiFolderMigrationCompleted';
const MIGRATION_LOG_KEY = 'aiFolderMigrationLog';

/**
 * 检查是否需要迁移
 * @returns true 如果需要迁移，false 如果已完成或无需迁移
 */
export async function needsMigration(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get([MIGRATION_COMPLETED_KEY, 'bookmarks']);
    
    // 如果已标记为完成，不需要迁移
    if (result[MIGRATION_COMPLETED_KEY]) {
      return false;
    }
    
    const bookmarks = (result.bookmarks || []) as any[];
    
    // 检查是否存在需要迁移的书签（有 aiFolderPath 且 folderPath 为根目录）
    const hasAIFolderData = bookmarks.some((b: any) => 
      b.aiFolderPath && 
      b.aiFolderPath !== '/' && 
      b.aiFolderPath.trim() !== '' &&
      (!b.folderPath || b.folderPath === '/')
    );
    
    return hasAIFolderData;
  } catch (error) {
    console.error('[Migration] Failed to check migration status:', error);
    return false;
  }
}

/**
 * 检查迁移是否已完成
 */
export async function isMigrationCompleted(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(MIGRATION_COMPLETED_KEY);
    return !!result[MIGRATION_COMPLETED_KEY];
  } catch (error) {
    console.error('[Migration] Failed to check migration completion:', error);
    return false;
  }
}

/**
 * 标记迁移为已完成
 */
export async function markMigrationCompleted(): Promise<void> {
  try {
    await chrome.storage.local.set({ [MIGRATION_COMPLETED_KEY]: true });
    console.log('[Migration] Migration marked as completed');
  } catch (error) {
    console.error('[Migration] Failed to mark migration as completed:', error);
    throw error;
  }
}

/**
 * 保存迁移日志
 */
async function saveMigrationLog(log: MigrationLog): Promise<void> {
  try {
    await chrome.storage.local.set({ [MIGRATION_LOG_KEY]: log });
    console.log('[Migration] Migration log saved:', log);
  } catch (error) {
    console.error('[Migration] Failed to save migration log:', error);
  }
}

/**
 * 获取迁移日志
 */
export async function getMigrationLog(): Promise<MigrationLog | null> {
  try {
    const result = await chrome.storage.local.get(MIGRATION_LOG_KEY);
    const log = result[MIGRATION_LOG_KEY];
    if (log && typeof log === 'object' && 'timestamp' in log) {
      return log as MigrationLog;
    }
    return null;
  } catch (error) {
    console.error('[Migration] Failed to get migration log:', error);
    return null;
  }
}


/**
 * 从 aiFolderPath 中提取所有需要创建的文件夹路径
 * 包括完整路径和所有父路径
 */
function extractFolderPaths(aiFolderPath: string): string[] {
  const paths: string[] = [];
  const parts = aiFolderPath.split('/').filter(Boolean);
  
  // 添加所有层级的路径
  for (let i = 1; i <= parts.length; i++) {
    paths.push('/' + parts.slice(0, i).join('/'));
  }
  
  return paths;
}

/**
 * 迁移单个书签
 * 将 aiFolderPath 数据迁移到 folderPath
 */
function migrateBookmark(bookmark: any): any {
  // 如果没有 aiFolderPath 或已经有有效的 folderPath，跳过
  if (!bookmark.aiFolderPath || 
      bookmark.aiFolderPath === '/' || 
      bookmark.aiFolderPath.trim() === '') {
    return bookmark;
  }
  
  // 如果 folderPath 已经有值且不是根目录，跳过
  if (bookmark.folderPath && bookmark.folderPath !== '/') {
    return bookmark;
  }
  
  // 执行迁移
  return {
    ...bookmark,
    // 迁移 aiFolderPath 到 folderPath
    folderPath: bookmark.aiFolderPath,
    folderId: `folder-${bookmark.aiFolderPath}`,
    // 清理废弃字段
    aiFolderPath: undefined,
    aiFolderId: undefined,
    aiCategory: undefined,
    aiSubcategory: undefined,
    // 更新时间戳
    updateTime: Date.now(),
  };
}

/**
 * 主迁移函数：将 AI 虚拟分类迁移到 Chrome 文件夹
 * 
 * 迁移流程：
 * 1. 检查是否已迁移
 * 2. 收集需要迁移的书签
 * 3. 创建对应的文件夹结构
 * 4. 更新书签的 folderPath 和 folderId
 * 5. 清理废弃字段
 * 6. 标记迁移完成
 */
export async function migrateAIFoldersToChrome(): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    migrated: 0,
    skipped: 0,
    errors: [],
    foldersCreated: 0,
  };

  console.log('[Migration] Starting AI folder migration...');

  try {
    // 1. 检查是否已迁移
    const completed = await isMigrationCompleted();
    if (completed) {
      result.message = '迁移已完成，无需重复执行';
      result.skipped = -1;
      console.log('[Migration] Migration already completed, skipping');
      return result;
    }

    // 2. 获取所有书签
    const storageResult = await chrome.storage.local.get(['bookmarks', 'folders']);
    const bookmarks = (storageResult.bookmarks || []) as any[];
    const existingFolders = (storageResult.folders || []) as any[];

    if (bookmarks.length === 0) {
      result.message = '没有书签需要迁移';
      await markMigrationCompleted();
      console.log('[Migration] No bookmarks to migrate');
      return result;
    }

    // 3. 找出需要迁移的书签
    const toMigrate = bookmarks.filter((b: any) => 
      b.aiFolderPath && 
      b.aiFolderPath !== '/' && 
      b.aiFolderPath.trim() !== '' &&
      (!b.folderPath || b.folderPath === '/')
    );

    if (toMigrate.length === 0) {
      result.message = '没有 AI 分类数据需要迁移';
      await markMigrationCompleted();
      console.log('[Migration] No AI folder data to migrate');
      return result;
    }

    console.log(`[Migration] Found ${toMigrate.length} bookmarks to migrate`);

    // 4. 收集所有需要创建的文件夹路径
    const folderPathsSet = new Set<string>();
    toMigrate.forEach((b: any) => {
      if (b.aiFolderPath) {
        const paths = extractFolderPaths(b.aiFolderPath);
        paths.forEach(p => folderPathsSet.add(p));
      }
    });

    const folderPaths = Array.from(folderPathsSet).sort();
    console.log(`[Migration] Need to create ${folderPaths.length} folders:`, folderPaths);

    // 5. 创建文件夹（如果不存在）
    const newFolders: any[] = [];
    const existingFolderIds = new Set(existingFolders.map((f: any) => f.id));

    for (const path of folderPaths) {
      const folderId = `folder-${path}`;
      
      if (!existingFolderIds.has(folderId)) {
        const name = path.split('/').filter(Boolean).pop() || '';
        const parentPath = '/' + path.split('/').filter(Boolean).slice(0, -1).join('/');
        const parentId = parentPath === '/' ? undefined : `folder-${parentPath}`;

        const newFolder = {
          id: folderId,
          title: name,
          path,
          parentId,
          description: `从 AI 分类迁移: ${name}`,
          bookmarkCount: 0,
          subfolderCount: 0,
          createTime: Date.now(),
          updateTime: Date.now(),
          order: existingFolders.length + newFolders.length,
        };

        newFolders.push(newFolder);
        existingFolderIds.add(folderId);
        result.foldersCreated++;
        
        console.log(`[Migration] Created folder: ${path}`);
      }
    }

    // 6. 迁移书签
    const updatedBookmarks = bookmarks.map((b: any) => {
      // 检查是否需要迁移
      if (b.aiFolderPath && 
          b.aiFolderPath !== '/' && 
          b.aiFolderPath.trim() !== '' &&
          (!b.folderPath || b.folderPath === '/')) {
        try {
          const migrated = migrateBookmark(b);
          result.migrated++;
          console.log(`[Migration] Migrated bookmark: "${b.title}" -> ${migrated.folderPath}`);
          return migrated;
        } catch (error) {
          const errorMsg = `Failed to migrate bookmark "${b.title}": ${(error as Error).message}`;
          result.errors.push(errorMsg);
          console.error(`[Migration] ${errorMsg}`);
          return b;
        }
      }
      
      result.skipped++;
      return b;
    });

    // 7. 更新文件夹的书签计数
    const folderBookmarkCounts = new Map<string, number>();
    updatedBookmarks.forEach((b: any) => {
      if (b.folderPath && b.folderPath !== '/' && b.status === 'active') {
        const folderId = `folder-${b.folderPath}`;
        folderBookmarkCounts.set(folderId, (folderBookmarkCounts.get(folderId) || 0) + 1);
      }
    });

    // 更新新创建的文件夹的书签计数
    newFolders.forEach(folder => {
      folder.bookmarkCount = folderBookmarkCounts.get(folder.id) || 0;
    });

    // 8. 保存迁移结果
    const allFolders = [...existingFolders, ...newFolders];
    
    await chrome.storage.local.set({
      bookmarks: updatedBookmarks,
      folders: allFolders,
    });

    // 9. 标记迁移完成并保存日志
    await markMigrationCompleted();
    
    const duration = Date.now() - startTime;
    const migrationLog: MigrationLog = {
      timestamp: Date.now(),
      migrated: result.migrated,
      skipped: result.skipped,
      foldersCreated: result.foldersCreated,
      errors: result.errors,
      duration,
    };
    
    await saveMigrationLog(migrationLog);

    result.message = `迁移完成：${result.migrated} 个书签已迁移，${result.foldersCreated} 个文件夹已创建`;
    
    console.log(`[Migration] Migration completed in ${duration}ms:`, result);

    return result;

  } catch (error) {
    const errorMsg = `Migration failed: ${(error as Error).message}`;
    result.errors.push(errorMsg);
    result.message = errorMsg;
    console.error('[Migration]', errorMsg, error);
    return result;
  }
}

/**
 * 重置迁移状态（仅用于测试或调试）
 */
export async function resetMigrationStatus(): Promise<void> {
  try {
    await chrome.storage.local.remove([MIGRATION_COMPLETED_KEY, MIGRATION_LOG_KEY]);
    console.log('[Migration] Migration status reset');
  } catch (error) {
    console.error('[Migration] Failed to reset migration status:', error);
    throw error;
  }
}

// 导出用于测试的内部函数
export const _internal = {
  extractFolderPaths,
  migrateBookmark,
};
