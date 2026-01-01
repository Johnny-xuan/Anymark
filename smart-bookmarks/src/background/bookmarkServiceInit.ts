/**
 * BookmarkService 初始化模块
 * 
 * 用于在 Background Service Worker 中初始化新架构的 BookmarkService
 * 这是 Chrome Sync Redesign 的一部分
 */

// 直接从具体文件导入，避免导入 ExportService（它使用了 document）
import { getBookmarkService } from '../services/bookmarkService';
import { getMetadataService } from '../services/metadataService';
import { getMigrationService } from '../services/migrationService';

let isInitialized = false;

/**
 * 初始化新架构的书签服务
 * 
 * 这个函数应该在 Background Service Worker 启动时调用
 * 它会：
 * 1. 检查是否需要迁移旧数据
 * 2. 初始化 BookmarkService（确保 AnyMark_Root 文件夹存在）
 * 3. 初始化 MetadataService
 * 4. 设置事件监听器
 */
export async function initializeBookmarkServices(): Promise<void> {
  if (isInitialized) {
    console.log('[BookmarkServiceInit] Already initialized');
    return;
  }

  console.log('[BookmarkServiceInit] Starting initialization...');

  try {
    // 1. 检查是否需要迁移
    const migrationService = getMigrationService();
    const needsMigration = await migrationService.needsMigration();

    if (needsMigration) {
      console.log('[BookmarkServiceInit] Migration needed, starting migration...');
      
      const result = await migrationService.migrate((progress) => {
        console.log(`[BookmarkServiceInit] Migration progress: ${progress.current}/${progress.total} - ${progress.message}`);
      });

      if (result.success) {
        console.log('[BookmarkServiceInit] Migration completed successfully:', result);
        
        // 清理旧数据
        await migrationService.cleanupOldData();
        console.log('[BookmarkServiceInit] Old data cleaned up');
      } else {
        console.error('[BookmarkServiceInit] Migration failed:', result.errors);
        // 继续初始化，但记录错误
      }
    }

    // 2. 初始化 BookmarkService
    const bookmarkService = getBookmarkService();
    await bookmarkService.initialize();
    console.log('[BookmarkServiceInit] BookmarkService initialized, AnyMark root ID:', bookmarkService.getAnyMarkRootId());

    // 3. 初始化 MetadataService
    const metadataService = getMetadataService();
    await metadataService.initialize();
    console.log('[BookmarkServiceInit] MetadataService initialized');

    // 4. 设置事件监听器（用于处理外部 Chrome 书签变更）
    setupExternalChangeListeners(bookmarkService, metadataService);

    isInitialized = true;
    console.log('[BookmarkServiceInit] Initialization complete');

  } catch (error) {
    console.error('[BookmarkServiceInit] Initialization failed:', error);
    throw error;
  }
}

/**
 * 设置外部变更监听器
 * 
 * 监听 Chrome 书签的外部变更（用户通过 Chrome 书签管理器操作）
 * 并同步更新元数据
 */
function setupExternalChangeListeners(
  bookmarkService: ReturnType<typeof getBookmarkService>,
  metadataService: ReturnType<typeof getMetadataService>
): void {
  // 书签创建事件 - 为新书签创建默认元数据
  bookmarkService.onBookmarkCreated(async (bookmark) => {
    console.log('[BookmarkServiceInit] External bookmark created:', bookmark.id, bookmark.title);
    
    try {
      // 创建默认元数据
      await metadataService.createDefaultMetadata(bookmark.id, 'browser');
      
      // 通知前端刷新
      notifySidebarUpdate('BOOKMARK_CREATED', { chromeId: bookmark.id });
    } catch (error) {
      console.error('[BookmarkServiceInit] Failed to handle bookmark creation:', error);
    }
  });

  // 书签删除事件 - 清理元数据
  bookmarkService.onBookmarkRemoved(async (chromeId) => {
    console.log('[BookmarkServiceInit] External bookmark removed:', chromeId);
    
    try {
      // 删除元数据
      await metadataService.deleteMetadata(chromeId);
      
      // 通知前端刷新
      notifySidebarUpdate('BOOKMARK_REMOVED', { chromeId });
    } catch (error) {
      console.error('[BookmarkServiceInit] Failed to handle bookmark removal:', error);
    }
  });

  // 书签修改事件
  bookmarkService.onBookmarkChanged(async (chromeId, changeInfo) => {
    console.log('[BookmarkServiceInit] External bookmark changed:', chromeId, changeInfo);
    
    // 通知前端刷新
    notifySidebarUpdate('BOOKMARK_CHANGED', { chromeId, changeInfo });
  });

  // 书签移动事件
  bookmarkService.onBookmarkMoved(async (chromeId, moveInfo) => {
    console.log('[BookmarkServiceInit] External bookmark moved:', chromeId, moveInfo);
    
    // 通知前端刷新
    notifySidebarUpdate('BOOKMARK_MOVED', { chromeId, moveInfo });
  });

  console.log('[BookmarkServiceInit] External change listeners set up');
}

/**
 * 通知 Sidebar 更新
 */
function notifySidebarUpdate(type: string, data: any): void {
  chrome.runtime.sendMessage({
    type: 'BOOKMARKS_UPDATED',
    reason: type,
    data,
  }).catch(() => {
    // Sidebar 可能没有打开，忽略错误
  });
}

/**
 * 检查服务是否已初始化
 */
export function isServicesInitialized(): boolean {
  return isInitialized;
}

/**
 * 获取初始化状态
 */
export async function getInitializationStatus(): Promise<{
  isInitialized: boolean;
  anyMarkRootId: string | null;
  bookmarkCount: number;
  folderCount: number;
}> {
  if (!isInitialized) {
    return {
      isInitialized: false,
      anyMarkRootId: null,
      bookmarkCount: 0,
      folderCount: 0,
    };
  }

  try {
    const bookmarkService = getBookmarkService();
    const tree = await bookmarkService.getBookmarkTree();
    
    let bookmarkCount = 0;
    let folderCount = 0;
    
    const countItems = (node: chrome.bookmarks.BookmarkTreeNode) => {
      if (node.url) {
        bookmarkCount++;
      } else if (node.children) {
        folderCount++;
        node.children.forEach(countItems);
      }
    };
    
    if (tree) {
      countItems(tree);
    }

    return {
      isInitialized: true,
      anyMarkRootId: bookmarkService.getAnyMarkRootId(),
      bookmarkCount,
      folderCount,
    };
  } catch (error) {
    console.error('[BookmarkServiceInit] Failed to get status:', error);
    return {
      isInitialized: true,
      anyMarkRootId: null,
      bookmarkCount: 0,
      folderCount: 0,
    };
  }
}
