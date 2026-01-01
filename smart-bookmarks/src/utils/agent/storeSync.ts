/**
 * Agent Store 同步适配器
 * 
 * 目的：确保 Agent 工具能够访问最新的书签数据
 * 在新旧架构过渡期间，提供数据同步功能
 */

import { useBookmarkStoreV2 } from '../../sidebar/store/bookmarkStoreV2';
import { useBookmarkStore } from '../../sidebar/store/bookmarkStore';
import type { MergedBookmark, MergedFolder } from '../../types/chromeBookmark';
import type { IBookmark, IFolder } from '../../types/bookmark';

/**
 * 将 MergedBookmark 转换为 IBookmark（Agent 使用的旧格式）
 */
function convertBookmarkToLegacy(merged: MergedBookmark): IBookmark {
  // 计算 folderPath（从 parentId 推导）
  // 注意：这是简化版本，实际可能需要遍历父节点
  const folderPath = '/'; // TODO: 需要从 folder 树计算完整路径
  
  return {
    id: merged.chromeId,
    url: merged.url,
    title: merged.title,
    favicon: merged.favicon,
    
    // 文件夹信息
    folderPath: folderPath,
    folderId: `folder-${folderPath}`,
    
    // AI 分析数据
    aiTags: merged.aiTags || [],
    aiSummary: merged.aiSummary,
    aiTechStack: merged.aiTechStack || [],
    
    // 用户数据
    userTags: merged.userTags || [],
    userNotes: merged.userNotes,
    starred: merged.starred || false,
    pinned: merged.pinned || false,
    
    // 统计数据
    analytics: {
      visitCount: merged.analytics.visitCount,
      lastVisit: merged.analytics.lastVisit,
      importance: merged.analytics.importance,
    },
    
    // 时间戳
    createTime: merged.dateAdded,
    updateTime: merged.dateAdded, // 新架构没有 updateTime
    
    // 状态
    status: merged.status,
    importSource: 'browser',
  };
}

/**
 * 将 MergedFolder 转换为 IFolder
 */
function convertFolderToLegacy(merged: MergedFolder): IFolder {
  return {
    id: `folder-${merged.path}`,
    title: merged.title,
    path: merged.path,
    createTime: merged.dateAdded,
    updateTime: merged.dateGroupModified || merged.dateAdded,
    order: 0,
    bookmarkCount: merged.bookmarkCount,
    subfolderCount: merged.subfolderCount,
  };
}

// 同步缓存
let lastSyncTime = 0;
const SYNC_CACHE_MS = 5000; // 5 秒缓存

/**
 * 从 V2 store 同步数据到旧 store
 * Agent 工具在执行前应该调用此函数
 * 
 * 优化：添加缓存机制，5 秒内不重复同步
 */
export async function syncFromV2ToLegacy(): Promise<void> {
  try {
    const now = Date.now();
    
    // 检查缓存：如果距离上次同步不到 5 秒，直接返回
    if (now - lastSyncTime < SYNC_CACHE_MS) {
      console.log('[StoreSync] Using cached data (last sync:', Math.round((now - lastSyncTime) / 1000), 's ago)');
      return;
    }
    
    console.log('[StoreSync] Syncing data from V2 to legacy store...');
    
    // 1. 确保 V2 store 有最新数据
    const v2Store = useBookmarkStoreV2.getState();
    if (!v2Store.isInitialized) {
      await v2Store.initialize();
    } else {
      await v2Store.refresh();
    }
    
    // 2. 转换数据格式
    const legacyBookmarks: IBookmark[] = v2Store.bookmarks.map(convertBookmarkToLegacy);
    const legacyFolders: IFolder[] = v2Store.folders.map(convertFolderToLegacy);
    
    // 3. 更新旧 store
    useBookmarkStore.setState({
      bookmarks: legacyBookmarks,
      folders: legacyFolders,
    });
    
    // 更新缓存时间
    lastSyncTime = now;
    
    console.log(`[StoreSync] Synced ${legacyBookmarks.length} bookmarks and ${legacyFolders.length} folders`);
  } catch (error) {
    console.error('[StoreSync] Failed to sync:', error);
    throw error;
  }
}

/**
 * 强制刷新同步（忽略缓存）
 */
export async function forceSyncFromV2ToLegacy(): Promise<void> {
  lastSyncTime = 0; // 清除缓存
  await syncFromV2ToLegacy();
}

/**
 * 通知 Sidebar 刷新数据
 */
export async function notifySidebarRefresh(): Promise<void> {
  try {
    // 刷新 V2 store
    await useBookmarkStoreV2.getState().refresh();
    
    // 发送消息通知 Sidebar
    chrome.runtime.sendMessage({ type: 'BOOKMARKS_UPDATED' }).catch(() => {
      // Sidebar 可能没有打开，忽略错误
    });
    
    console.log('[StoreSync] Notified sidebar to refresh');
  } catch (error) {
    console.error('[StoreSync] Failed to notify sidebar:', error);
  }
}
