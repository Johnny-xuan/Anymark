/**
 * BookmarkStore - 书签状态管理
 *
 * 设计原则：
 * 1. Chrome Native 作为唯一数据源
 * 2. chromeId 作为主键
 * 3. 通过 BookmarkService 和 MetadataService 操作数据
 * 4. 使用增量更新减少全量刷新
 */

import { create } from 'zustand';
import { getBookmarkService } from '../../services/bookmarkService';
import { getMetadataService } from '../../services/metadataService';
import { recentTabsService } from '../../services/recentTabsService';
import {
  type ChromeBookmarkTreeNode,
  type MergedBookmark,
  type MergedFolder,
  type MergedItem,
  type BookmarkMetadata,
  type UpdateMetadataParams,
  type BookmarkNode,
  CHROME_SPECIAL_FOLDER_IDS,
  DEFAULT_BOOKMARK_METADATA,
  DEFAULT_NODE_METADATA,
  isMergedBookmark,
  isMergedFolder,
  isBookmarkNode,
  isFolderNode,
  mergedBookmarkToNode,
  mergedFolderToNode,
} from '../../types/chromeBookmark';
import type { FilterType, SortType, ViewMode, IRecentTab } from '../../types/bookmark';

// ============ 防抖工具函数 ============

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============ 状态接口 ============

interface BookmarkStateV2 {
  // 数据（新统一模型）
  nodes: BookmarkNode[];
  
  // 数据（兼容层，渐进废弃）
  bookmarks: MergedBookmark[];
  folders: MergedFolder[];
  anyMarkRootId: string | null;
  
  // 文件系统索引（类似 inode 索引，提升查询性能）
  childrenIndex: Map<string, MergedItem[]>;      // parentId -> children (O(1) 查询子节点)
  pathIndex: Map<string, MergedFolder>;          // path -> folder (O(1) 路径查找)
  idIndex: Map<string, MergedItem>;              // chromeId -> item (O(1) ID 查找)
  
  // UI 状态
  selectedId: string | null;
  selectedIds: Set<string>;
  expandedFolderIds: Set<string>;
  currentFolderId: string | null;
  searchQuery: string;
  currentFilter: FilterType;
  currentSort: SortType;
  viewMode: ViewMode;
  
  // 加载状态
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  
  // Actions - 初始化
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  
  // Actions - 书签操作
  addBookmark: (url: string, title: string, folderId?: string) => Promise<string | null>;
  updateBookmark: (chromeId: string, changes: { title?: string; url?: string }) => Promise<void>;
  deleteBookmark: (chromeId: string) => Promise<void>;
  restoreBookmark: (chromeId: string) => Promise<void>;
  moveBookmark: (chromeId: string, newFolderId: string, index?: number) => Promise<void>;
  reorderItem: (chromeId: string, targetId: string, position: 'before' | 'after') => Promise<void>;
  
  // Actions - 文件夹操作
  createFolder: (title: string, parentId?: string) => Promise<string | null>;
  renameFolder: (chromeId: string, newTitle: string) => Promise<void>;
  deleteFolder: (chromeId: string) => Promise<void>;
  restoreFolder: (chromeId: string) => Promise<void>;
  moveFolder: (chromeId: string, newParentId: string, index?: number) => Promise<void>;
  
  // Actions - 回收站操作
  getTrashItems: () => Promise<ChromeBookmarkTreeNode[]>;
  emptyTrash: () => Promise<number>;
  getTrashFolderId: () => string | null;
  
  // Actions - 元数据操作
  updateMetadata: (chromeId: string, metadata: UpdateMetadataParams) => Promise<void>;
  toggleStarred: (chromeId: string) => Promise<void>;
  togglePinned: (chromeId: string) => Promise<void>;
  addTag: (chromeId: string, tag: string) => Promise<void>;
  removeTag: (chromeId: string, tag: string) => Promise<void>;
  recordVisit: (chromeId: string) => Promise<void>;

  // Actions - 置顶标签（词云自定义）
  pinnedTags: string[];
  loadPinnedTags: () => Promise<void>;
  addPinnedTag: (tag: string) => Promise<void>;
  removePinnedTag: (tag: string) => Promise<void>;
  
  // Actions - Recent Tabs
  getRecentTabs: () => Promise<IRecentTab[]>;
  addTabToBookmarks: (tab: IRecentTab, folderId?: string) => Promise<void>;
  
  // Actions - UI 状态
  setSelectedId: (id: string | null) => void;
  toggleSelectItem: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  toggleFolderExpanded: (folderId: string) => void;
  setCurrentFolder: (folderId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setCurrentFilter: (filter: FilterType) => void;
  setCurrentSort: (sort: SortType) => void;
  setViewMode: (mode: ViewMode) => void;
  setError: (error: string | null) => void;
  
  // Computed - 新 API（基于 BookmarkNode）
  getNodes: () => BookmarkNode[];
  getBookmarkNodes: () => BookmarkNode[];
  getFolderNodes: () => BookmarkNode[];
  getDeletedNodes: () => BookmarkNode[];
  getNodeById: (id: string) => BookmarkNode | undefined;
  getChildNodes: (parentId: string) => BookmarkNode[];
  
  // Computed - 兼容层（渐进废弃）
  getFilteredItems: () => MergedItem[];
  getBookmarkById: (chromeId: string) => MergedBookmark | undefined;
  getFolderById: (chromeId: string) => MergedFolder | undefined;
  getFolderByPath: (path: string) => MergedFolder | undefined;  // 新增：通过路径查找（O(1)）
  getCurrentFolderItems: () => MergedItem[];
  getChildrenByParentId: (parentId: string) => MergedItem[];    // 新增：查询子节点（O(1)）

  // 内部方法 - 增量更新（不暴露给 UI）
  _addBookmarkToList: (bookmark: MergedBookmark) => void;
  _updateBookmarkInList: (chromeId: string, changes: Partial<MergedBookmark>) => void;
  _removeBookmarkFromList: (chromeId: string) => void;
  _addFolderToList: (folder: MergedFolder) => void;
  _updateFolderInList: (chromeId: string, changes: Partial<MergedFolder>) => void;
  _removeFolderFromList: (chromeId: string) => void;
  _rebuildIndexes: () => void;  // 新增：重建所有索引
  _scheduleRefresh: () => void;
}

// ============ Store 实现 ============

// ============ 索引构建函数 ============

/**
 * 构建文件系统索引（类似 inode 索引）
 * 提升查询性能：O(n) -> O(1)
 */
function buildIndexes(
  bookmarks: MergedBookmark[],
  folders: MergedFolder[]
): {
  childrenIndex: Map<string, MergedItem[]>;
  pathIndex: Map<string, MergedFolder>;
  idIndex: Map<string, MergedItem>;
} {
  const childrenIndex = new Map<string, MergedItem[]>();
  const pathIndex = new Map<string, MergedFolder>();
  const idIndex = new Map<string, MergedItem>();

  console.log('[buildIndexes] Starting index build:', {
    totalBookmarks: bookmarks.length,
    totalFolders: folders.length,
  });

  // 打印所有唯一的 parentId 值（调试用）
  const allParentIds = new Set<string>();
  for (const b of bookmarks) allParentIds.add(b.parentId || '');
  for (const f of folders) allParentIds.add(f.parentId || '');
  console.log('[buildIndexes] All unique parentId values:', Array.from(allParentIds));

  // 构建 childrenIndex: parentId -> children[]
  for (const bookmark of bookmarks) {
    const parentId = bookmark.parentId || '';
    if (!childrenIndex.has(parentId)) {
      childrenIndex.set(parentId, []);
    }
    childrenIndex.get(parentId)!.push(bookmark);
    idIndex.set(bookmark.chromeId, bookmark);

    // DEBUG: 打印前10个书签的索引信息
    if (bookmarks.indexOf(bookmark) < 10) {
      console.log('[buildIndexes] Bookmark indexed:', {
        chromeId: bookmark.chromeId,
        title: bookmark.title,
        parentId: bookmark.parentId,
        indexedUnder: parentId,
      });
    }
  }

  for (const folder of folders) {
    const parentId = folder.parentId || '';
    if (!childrenIndex.has(parentId)) {
      childrenIndex.set(parentId, []);
    }
    childrenIndex.get(parentId)!.push(folder);
    idIndex.set(folder.chromeId, folder);

    // 构建 pathIndex: path -> folder
    if (folder.path) {
      pathIndex.set(folder.path, folder);
    }

    // DEBUG: 打印所有文件夹的索引信息
    console.log('[buildIndexes] Folder indexed:', {
      chromeId: folder.chromeId,
      title: folder.title,
      path: folder.path,
      parentId: folder.parentId,
      indexedUnder: parentId,
      subfolderCount: folder.subfolderCount,
      bookmarkCount: folder.bookmarkCount,
    });
  }

  // DEBUG: 打印索引构建结果
  const indexKeys = Array.from(childrenIndex.keys());
  console.log('[buildIndexes] Index keys sample:', {
    totalKeys: indexKeys.length,
    sampleKeys: indexKeys.slice(0, 10),
    childrenCounts: Object.fromEntries(
      indexKeys.slice(0, 10).map(key => [key, childrenIndex.get(key)!.length])
    ),
  });

  return { childrenIndex, pathIndex, idIndex };
}

export const useBookmarkStore = create<BookmarkStateV2>((set, get) => ({
  // 初始状态（新统一模型）
  nodes: [],
  
  // 初始状态（兼容层）
  bookmarks: [],
  folders: [],
  anyMarkRootId: null,
  
  // 文件系统索引（初始化为空）
  childrenIndex: new Map(),
  pathIndex: new Map(),
  idIndex: new Map(),
  
  selectedId: null,
  selectedIds: new Set(),
  expandedFolderIds: new Set(),
  currentFolderId: null,
  searchQuery: '',
  currentFilter: 'chrome',
  currentSort: 'date',
  viewMode: 'list',
  
  isLoading: false,
  isInitialized: false,
  error: null,

  // 置顶标签
  pinnedTags: [],

  // ============ 增量更新方法 ============

  // 添加单个书签到列表（增量更新）
  _addBookmarkToList: (bookmark) => {
    set(state => {
      const newBookmarks = [...state.bookmarks, bookmark];
      const indexes = buildIndexes(newBookmarks, state.folders);
      return {
        bookmarks: newBookmarks,
        ...indexes,  // 更新索引
      };
    });
  },

  // 更新列表中的单个书签（增量更新）
  _updateBookmarkInList: (chromeId, changes) => {
    set(state => {
      const newBookmarks = state.bookmarks.map(b =>
        b.chromeId === chromeId ? { ...b, ...changes } : b
      );
      const indexes = buildIndexes(newBookmarks, state.folders);
      return {
        bookmarks: newBookmarks,
        ...indexes,  // 更新索引
      };
    });
  },

  // 从列表中移除书签（增量更新）
  _removeBookmarkFromList: (chromeId) => {
    set(state => {
      const newBookmarks = state.bookmarks.filter(b => b.chromeId !== chromeId);
      const indexes = buildIndexes(newBookmarks, state.folders);
      return {
        bookmarks: newBookmarks,
        ...indexes,  // 更新索引
      };
    });
  },

  // 添加单个文件夹到列表（增量更新）
  _addFolderToList: (folder) => {
    set(state => {
      const newFolders = [...state.folders, folder];
      const indexes = buildIndexes(state.bookmarks, newFolders);
      return {
        folders: newFolders,
        ...indexes,  // 更新索引
      };
    });
  },

  // 更新列表中的单个文件夹（增量更新）
  _updateFolderInList: (chromeId, changes) => {
    set(state => {
      const newFolders = state.folders.map(f =>
        f.chromeId === chromeId ? { ...f, ...changes } : f
      );
      const indexes = buildIndexes(state.bookmarks, newFolders);
      return {
        folders: newFolders,
        ...indexes,  // 更新索引（特别是 pathIndex，如果 path 变化）
      };
    });
  },

  // 从列表中移除文件夹（增量更新）
  _removeFolderFromList: (chromeId) => {
    set(state => {
      const newFolders = state.folders.filter(f => f.chromeId !== chromeId);
      const indexes = buildIndexes(state.bookmarks, newFolders);
      return {
        folders: newFolders,
        ...indexes,  // 更新索引
      };
    });
  },

  // 调度延迟刷新（使用防抖，300ms 后执行）
  _scheduleRefresh: (() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        get().refresh();
        refreshTimer = null;
      }, 300);
    };
  })(),

  // ============ 初始化 ============
  
  initialize: async () => {
    const state = get();
    if (state.isInitialized) {
      console.log('[BookmarkStore] Already initialized');
      return;
    }

    console.log('[BookmarkStore] Initializing...');
    set({ isLoading: true, error: null });

    try {
      // 初始化服务
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();

      await bookmarkService.initialize();
      await metadataService.initialize();

      const anyMarkRootId = bookmarkService.getAnyMarkRootId();

      // 加载基础数据（快速加载，不等待 History API）
      const tree = await bookmarkService.getBookmarkTree();
      const metadata = await metadataService.getAllMetadata();

      const trashFolderId = bookmarkService.getTrashFolderId();

      // 第一步：快速加载基础数据（不包含访问统计）
      const { bookmarks: initialBookmarks, folders: initialFolders } = await mergeDataBasic(tree, metadata, anyMarkRootId, trashFolderId);

      // 构建索引
      const indexes = buildIndexes(initialBookmarks, initialFolders);

      // 立即显示 UI，让用户看到书签
      set({
        bookmarks: initialBookmarks,
        folders: initialFolders,
        anyMarkRootId,
        ...indexes,  // 同时设置索引
        isInitialized: true,
        isLoading: false,
      });

      console.log('[BookmarkStoreV2] Initial load complete:', initialBookmarks.length, 'bookmarks');

      // 加载置顶标签
      get().loadPinnedTags();

      // 设置事件监听
      setupEventListeners(bookmarkService, metadataService, get, set);

      // 第二步：在后台加载访问统计（并行处理，不阻塞 UI）
      mergeDataWithVisitStats(tree, metadata, anyMarkRootId, trashFolderId).then(({ bookmarks: updatedBookmarks, folders: updatedFolders }) => {
        // 静默更新访问统计和重建索引
        console.log('[BookmarkStoreV2] Visit stats loaded, updating bookmarks and rebuilding indexes');
        const indexes = buildIndexes(updatedBookmarks, updatedFolders || initialFolders);
        set({
          bookmarks: updatedBookmarks,
          folders: updatedFolders || initialFolders,
          ...indexes,  // 重建索引以确保数据一致性
        });
      }).catch(error => {
        console.warn('[BookmarkStoreV2] Failed to load visit stats:', error);
        // 失败不影响已显示的基础数据
      });

    } catch (error) {
      console.error('[BookmarkStoreV2] Initialization failed:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  
  refresh: async () => {
    console.log('[BookmarkStoreV2] Refreshing...');
    set({ isLoading: true, error: null });
    
    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      
      const anyMarkRootId = bookmarkService.getAnyMarkRootId();
      const trashFolderId = bookmarkService.getTrashFolderId();
      const tree = await bookmarkService.getBookmarkTree();
      const metadata = await metadataService.getAllMetadata();

      const { bookmarks, folders } = await mergeData(tree, metadata, anyMarkRootId, trashFolderId);
      
      // 重建索引
      const indexes = buildIndexes(bookmarks, folders);
      
      set({
        bookmarks,
        folders,
        ...indexes,  // 更新索引
        isLoading: false,
      });
      
      console.log('[BookmarkStoreV2] Refreshed');
    } catch (error) {
      console.error('[BookmarkStoreV2] Refresh failed:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  
  // ============ 书签操作 ============
  
  addBookmark: async (url, title, folderId) => {
    const state = get();
    const parentId = folderId || state.anyMarkRootId || undefined;

    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();

      // 1. 乐观更新：先在本地创建临时书签
      const tempId = `temp-${Date.now()}`;
      const tempBookmark: MergedBookmark = {
        chromeId: tempId,
        url,
        title,
        parentId: parentId || state.anyMarkRootId || '',
        index: state.bookmarks.filter(b => b.parentId === parentId).length,
        dateAdded: Date.now(),

        aiTags: [],
        aiSummary: undefined,
        aiCategory: undefined,
        aiSubcategory: undefined,
        aiConfidence: undefined,
        aiTechStack: [],

        userTags: [],
        starred: false,
        pinned: false,

        analytics: {
          visitCount: 0,
          lastVisit: 0,
          importance: 50,
        },

        favicon: getFaviconUrl(url),
        status: 'active',
      };

      state._addBookmarkToList(tempBookmark);

      // 2. 同步到 Chrome Native
      const chromeId = await bookmarkService.createBookmark({
        url,
        title,
        parentId,
      });

      // 3. 用真实的 chromeId 替换临时 ID
      const bookmarks = [...state.bookmarks];
      const bookmarkIndex = bookmarks.findIndex(b => b.chromeId === tempId);
      if (bookmarkIndex !== -1) {
        bookmarks[bookmarkIndex] = {
          ...bookmarks[bookmarkIndex],
          chromeId,
        };
        set({ bookmarks });
      }

      // 4. 创建默认元数据
      await metadataService.createDefaultMetadata(chromeId, 'manual');

      // 5. 调度延迟刷新以确保最终一致性
      get()._scheduleRefresh();

      console.log('[BookmarkStoreV2] Added bookmark:', chromeId);
      return chromeId;
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to add bookmark:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      // 失败时刷新以恢复正确状态
      await get().refresh();
      return null;
    }
  },
  
  updateBookmark: async (chromeId, changes) => {
    try {
      const bookmarkService = getBookmarkService();

      // 1. 立即更新本地状态（乐观更新）
      const state = get();
      const bookmark = state.bookmarks.find(b => b.chromeId === chromeId);
      if (bookmark) {
        state._updateBookmarkInList(chromeId, changes);
      }

      // 2. 后台同步到 Chrome
      await bookmarkService.updateBookmark(chromeId, changes);

      // 3. 调度延迟刷新以确保最终一致性
      get()._scheduleRefresh();

      console.log('[BookmarkStoreV2] Updated bookmark:', chromeId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to update bookmark:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      // 失败时刷新以恢复正确状态
      await get().refresh();
    }
  },

  deleteBookmark: async (chromeId) => {
    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      const state = get();

      const bookmark = state.getBookmarkById(chromeId);
      if (!bookmark) {
        // 如果在列表中找不到，尝试直接从 Metadata 删除
        await metadataService.deleteMetadata(chromeId);
        return;
      }

      // 1. 立即从本地列表移除（乐观更新）
      state._removeBookmarkFromList(chromeId);

      // 2. 标记为已删除并保存原始位置到元数据（用于恢复）
      await metadataService.setMetadata(chromeId, {
        status: 'deleted',
        snapshot: {
          title: bookmark.title,
          url: bookmark.url,
          parentId: bookmark.parentId,
          path: '',
          dateAdded: bookmark.dateAdded,
        },
      });

      // 3. 移动到 .Trash 文件夹（软删除）
      await bookmarkService.moveToTrash(chromeId);

      // 4. 调度延迟刷新
      get()._scheduleRefresh();

      console.log('[BookmarkStoreV2] Moved to trash:', chromeId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to delete bookmark:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      await get().refresh();
    }
  },

  restoreBookmark: async (chromeId) => {
    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      const state = get();

      // 获取保存的原始位置
      const meta = await metadataService.getMetadata(chromeId);
      if (!meta?.snapshot?.parentId) {
        throw new Error('Cannot restore: no snapshot found');
      }

      // 确定恢复目标位置
      let targetParentId = meta.snapshot.parentId;
      
      // 验证目标文件夹是否存在
      const targetFolder = state.getFolderById(targetParentId);
      if (!targetFolder) {
        // 如果原文件夹不存在，恢复到根目录
        targetParentId = state.anyMarkRootId || '';
        console.warn('[BookmarkStoreV2] Original folder missing, restoring to root');
      }

      // 从 .Trash 移动回原位置
      await bookmarkService.restoreFromTrash(chromeId, targetParentId);

      // 清除恢复快照
      await metadataService.setMetadata(chromeId, {
        ...meta,
        snapshot: undefined,
        updatedAt: Date.now(),
      });

      // 调度刷新
      get()._scheduleRefresh();

      console.log('[BookmarkStoreV2] Restored bookmark:', chromeId, 'to', targetParentId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to restore bookmark:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      await get().refresh();
    }
  },
  
  moveBookmark: async (chromeId, newFolderId, index?) => {
    try {
      const bookmarkService = getBookmarkService();

      // 1. 立即更新本地状态（乐观更新）
      const state = get();
      const bookmarks = [...state.bookmarks];
      const bookmarkIndex = bookmarks.findIndex(b => b.chromeId === chromeId);

      if (bookmarkIndex !== -1) {
        bookmarks[bookmarkIndex] = {
          ...bookmarks[bookmarkIndex],
          parentId: newFolderId,
          dateAdded: Date.now()
        };
        set({ bookmarks });
        console.log('[BookmarkStoreV2] Optimistic update: moved bookmark locally');
      }

      // 2. 同步到 Chrome Native
      await bookmarkService.moveBookmark(chromeId, newFolderId, index);
      console.log('[BookmarkStoreV2] Moved bookmark in Chrome:', chromeId);

      // 3. 调度延迟刷新以确保最终一致性
      get()._scheduleRefresh();

    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to move bookmark:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      // 失败时刷新以恢复正确状态
      await get().refresh();
    }
  },
  
  reorderItem: async (chromeId, targetId, position) => {
    try {
      const bookmarkService = getBookmarkService();
      const state = get();

      // 找到目标项以确定它的 parentId
      const targetBookmark = state.bookmarks.find(b => b.chromeId === targetId);
      const targetFolder = state.folders.find(f => f.chromeId === targetId);
      const targetParentId = targetBookmark?.parentId || targetFolder?.parentId;

      if (!targetParentId) {
        console.error('[BookmarkStoreV2] Cannot reorder: target parent not found');
        return;
      }

      // 通过 Chrome API 获取目标父文件夹的子项以确定准确的 index
      const children = await chrome.bookmarks.getChildren(targetParentId);
      const targetIndex = children.findIndex(c => c.id === targetId);
      if (targetIndex === -1) {
        console.error('[BookmarkStoreV2] Cannot reorder: target not found in children');
        return;
      }

      // 确定被拖拽项是否在同一父目录
      const draggedItem = children.find(c => c.id === chromeId);
      const isSameParent = !!draggedItem;
      const draggedIndex = isSameParent ? children.findIndex(c => c.id === chromeId) : -1;

      // 计算目标 index
      let newIndex: number;
      if (position === 'before') {
        newIndex = targetIndex;
      } else {
        newIndex = targetIndex + 1;
      }

      // Chrome bookmarks.move 的 index 规则：
      // 如果在同一父目录内移动，且源在目标之前，移除源后 index 会偏移
      if (isSameParent && draggedIndex < newIndex) {
        newIndex = newIndex - 1;
      }

      // 判断源项类型并执行移动
      const isFolder = state.folders.some(f => f.chromeId === chromeId);
      if (isFolder) {
        await bookmarkService.moveFolder(chromeId, targetParentId, newIndex);
      } else {
        await bookmarkService.moveBookmark(chromeId, targetParentId, newIndex);
      }

      console.log('[BookmarkStoreV2] Reordered item:', chromeId, position, targetId, 'index:', newIndex);

      // 刷新以获取正确状态
      get()._scheduleRefresh();

    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to reorder:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      await get().refresh();
    }
  },

  // ============ 文件夹操作 ============

  restoreFolder: async (chromeId) => {
    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      const state = get();

      // 获取保存的原始位置
      const folderMeta = await metadataService.getMetadata(`folder:${chromeId}`);
      if (!folderMeta?.snapshot?.parentId) {
        throw new Error('Cannot restore folder: no snapshot found');
      }

      // 确定恢复目标位置
      let targetParentId = folderMeta.snapshot.parentId;
      
      // 验证目标文件夹是否存在
      const targetFolder = state.getFolderById(targetParentId);
      if (!targetFolder && targetParentId !== state.anyMarkRootId) {
        // 如果原父文件夹不存在，恢复到根目录
        targetParentId = state.anyMarkRootId || '';
        console.warn('[BookmarkStoreV2] Original parent folder missing, restoring to root');
      }

      // 从 .Trash 移动回原位置（整个文件夹及其内容）
      await bookmarkService.restoreFromTrash(chromeId, targetParentId);

      // 清除恢复快照
      await metadataService.deleteMetadata(`folder:${chromeId}`);

      // 调度刷新
      get()._scheduleRefresh();

      console.log('[BookmarkStoreV2] Restored folder:', chromeId, 'to', targetParentId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to restore folder:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      await get().refresh();
    }
  },
  
  createFolder: async (title, parentId) => {
    const state = get();
    const targetParentId = parentId || state.anyMarkRootId || undefined;

    try {
      const bookmarkService = getBookmarkService();

      // 1. 乐观更新：先在本地创建临时文件夹
      const tempId = `temp-${Date.now()}`;
      const tempFolder: MergedFolder = {
        chromeId: tempId,
        title,
        parentId: targetParentId || state.anyMarkRootId || '',
        index: state.folders.filter(f => f.parentId === targetParentId).length,
        dateAdded: Date.now(),
        bookmarkCount: 0,
        subfolderCount: 0,
        path: '', // 会在刷新时更新
      };

      state._addFolderToList(tempFolder);

      // 2. 同步到 Chrome Native
      const chromeId = await bookmarkService.createFolder({
        title,
        parentId: targetParentId,
      });

      // 3. 用真实的 chromeId 替换临时 ID
      const folders = [...state.folders];
      const folderIndex = folders.findIndex(f => f.chromeId === tempId);
      if (folderIndex !== -1) {
        folders[folderIndex] = {
          ...folders[folderIndex],
          chromeId,
        };
        set({ folders });
      }

      // 4. 调度延迟刷新以确保最终一致性（获取正确的 path）
      get()._scheduleRefresh();

      console.log('[BookmarkStoreV2] Created folder:', chromeId);
      return chromeId;
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to create folder:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      // 失败时刷新以恢复正确状态
      await get().refresh();
      return null;
    }
  },
  
  renameFolder: async (chromeId, newTitle) => {
    try {
      const bookmarkService = getBookmarkService();
      const state = get();

      // 1. 立即更新本地状态（乐观更新）
      state._updateFolderInList(chromeId, { title: newTitle });

      // 2. 后台同步到 Chrome
      await bookmarkService.renameFolder(chromeId, newTitle);

      // 3. 调度延迟刷新以确保最终一致性
      get()._scheduleRefresh();

      console.log('[BookmarkStoreV2] Renamed folder:', chromeId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to rename folder:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      // 失败时刷新以恢复正确状态
      await get().refresh();
    }
  },

  deleteFolder: async (chromeId) => {
    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      const state = get();

      const folder = state.getFolderById(chromeId);
      if (!folder) {
        console.warn('[BookmarkStoreV2] Folder not found:', chromeId);
        return;
      }

      // 1. 立即从本地列表移除（乐观更新）
      state._removeFolderFromList(chromeId);
      // 同时移除该文件夹下的所有书签（它们会随文件夹一起移动到 Trash）
      const bookmarkIds = await collectDescendantBookmarkIds(chromeId);
      for (const id of bookmarkIds) {
        state._removeBookmarkFromList(id);
      }

      // 2. 标记为已删除并保存文件夹原始位置到元数据（用于恢复）
      await metadataService.setMetadata(`folder:${chromeId}`, {
        status: 'deleted',
        snapshot: {
          title: folder.title,
          url: '',
          parentId: folder.parentId,
          path: folder.path,
          dateAdded: folder.dateAdded,
        },
      });

      // 3. 移动整个文件夹到 .Trash（保留文件夹结构）
      await bookmarkService.moveToTrash(chromeId);

      // 4. 调度延迟刷新
      get()._scheduleRefresh();

      console.log('[BookmarkStoreV2] Moved folder to trash:', chromeId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to delete folder:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      await get().refresh();
    }
  },

  // ============ 回收站操作 ============

  getTrashItems: async () => {
    const bookmarkService = getBookmarkService();
    return bookmarkService.getTrashContents();
  },

  emptyTrash: async () => {
    const bookmarkService = getBookmarkService();
    const deleted = await bookmarkService.emptyTrash();
    get()._scheduleRefresh();
    return deleted;
  },

  getTrashFolderId: () => {
    const bookmarkService = getBookmarkService();
    return bookmarkService.getTrashFolderId();
  },

  moveFolder: async (chromeId, newParentId, index?) => {
    try {
      const bookmarkService = getBookmarkService();
      const state = get();

      // 1. 立即更新本地状态（乐观更新）
      const folders = [...state.folders];
      const folderIndex = folders.findIndex(f => f.chromeId === chromeId);

      if (folderIndex !== -1) {
        folders[folderIndex] = {
          ...folders[folderIndex],
          parentId: newParentId,
          dateGroupModified: Date.now(),
        };
        set({ folders });
        console.log('[BookmarkStoreV2] Optimistic update: moved folder locally');
      }

      // 2. 同步到 Chrome Native
      await bookmarkService.moveFolder(chromeId, newParentId, index);
      console.log('[BookmarkStoreV2] Moved folder in Chrome:', chromeId);

      // 3. 调度延迟刷新以确保最终一致性
      get()._scheduleRefresh();

      console.log('[BookmarkStoreV2] Moved folder:', chromeId, 'to', newParentId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to move folder:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      // 失败时刷新以恢复正确状态
      await get().refresh();
    }
  },

  // ============ 元数据操作 ============
  
  updateMetadata: async (chromeId, metadata) => {
    try {
      const metadataService = getMetadataService();
      await metadataService.setMetadata(chromeId, metadata as Partial<BookmarkMetadata>);

      // 增量更新本地状态，避免全量刷新
      const state = get();
      const bookmark = state.bookmarks.find(b => b.chromeId === chromeId);

      if (bookmark) {
        // 安全地合并元数据字段到书签对象
        const changes: Partial<MergedBookmark> = {};

        if (metadata.aiTags !== undefined) changes.aiTags = metadata.aiTags;
        if (metadata.aiSummary !== undefined) changes.aiSummary = metadata.aiSummary;
        if (metadata.aiCategory !== undefined) changes.aiCategory = metadata.aiCategory;
        if (metadata.aiSubcategory !== undefined) changes.aiSubcategory = metadata.aiSubcategory;
        if (metadata.aiConfidence !== undefined) changes.aiConfidence = metadata.aiConfidence;
        if (metadata.aiTechStack !== undefined) changes.aiTechStack = metadata.aiTechStack;
        if (metadata.userTags !== undefined) changes.userTags = metadata.userTags;
        if (metadata.starred !== undefined) changes.starred = metadata.starred;
        if (metadata.pinned !== undefined) changes.pinned = metadata.pinned;

        state._updateBookmarkInList(chromeId, changes);
        console.log('[BookmarkStoreV2] Updated metadata locally:', chromeId);
      }

      // 调度延迟刷新以确保最终一致性（但不立即全量刷新）
      get()._scheduleRefresh();

    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to update metadata:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  
  toggleStarred: async (chromeId) => {
    const bookmark = get().getBookmarkById(chromeId);
    if (!bookmark) return;
    
    await get().updateMetadata(chromeId, { starred: !bookmark.starred });
  },
  
  togglePinned: async (chromeId) => {
    const bookmark = get().getBookmarkById(chromeId);
    if (!bookmark) return;
    
    await get().updateMetadata(chromeId, { pinned: !bookmark.pinned });
  },
  
  addTag: async (chromeId, tag) => {
    const bookmark = get().getBookmarkById(chromeId);
    if (!bookmark) return;
    
    const currentTags = bookmark.userTags || [];
    if (!currentTags.includes(tag)) {
      await get().updateMetadata(chromeId, { userTags: [...currentTags, tag] });
    }
  },
  
  removeTag: async (chromeId, tag) => {
    const bookmark = get().getBookmarkById(chromeId);
    if (!bookmark) return;

    const currentTags = bookmark.userTags || [];
    await get().updateMetadata(chromeId, { userTags: currentTags.filter(t => t !== tag) });
  },

  // ============ 置顶标签（词云自定义） ============

  loadPinnedTags: async () => {
    try {
      const result = await chrome.storage.local.get('pinned_tags');
      set({ pinnedTags: result.pinned_tags || [] });
    } catch (error) {
      console.error('[Store] Failed to load pinned tags:', error);
    }
  },

  addPinnedTag: async (tag) => {
    const current = get().pinnedTags;
    if (current.includes(tag)) return;
    const updated = [...current, tag];
    set({ pinnedTags: updated });
    try {
      await chrome.storage.local.set({ pinned_tags: updated });
    } catch (error) {
      console.error('[Store] Failed to save pinned tags:', error);
    }
  },

  removePinnedTag: async (tag) => {
    const updated = get().pinnedTags.filter(t => t !== tag);
    set({ pinnedTags: updated });
    try {
      await chrome.storage.local.set({ pinned_tags: updated });
    } catch (error) {
      console.error('[Store] Failed to save pinned tags:', error);
    }
  },

  recordVisit: async (chromeId) => {
    try {
      const metadataService = getMetadataService();
      await metadataService.updateVisitStats(chromeId);
      // 不调用 refresh，避免每次点击都全量刷新导致列表闪烁
      // 只更新本地 store 中的 visitCount
      const state = get();
      const bookmark = state.bookmarks.find(b => b.chromeId === chromeId);
      if (bookmark) {
        const updatedBookmark = {
          ...bookmark,
          analytics: {
            ...bookmark.analytics,
            visitCount: (bookmark.analytics.visitCount || 0) + 1,
            lastVisit: Date.now()
          }
        };
        set({
          bookmarks: state.bookmarks.map(b => b.chromeId === chromeId ? updatedBookmark : b)
        });
      }
      console.log('[BookmarkStoreV2] Recorded visit for:', chromeId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to record visit:', error);
    }
  },
  
  // ============ Recent Tabs ============
  
  getRecentTabs: async () => {
    try {
      const tabs = await recentTabsService.getRecentTabs(50);
      return tabs.map(tab => ({
        id: `tab-${tab.id}`,
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
        windowId: tab.windowId,
        lastAccessed: tab.lastAccessed || Date.now(),
        isActive: tab.isActive || false,
        isTab: true as const,
      }));
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to get recent tabs:', error);
      return [];
    }
  },

  addTabToBookmarks: async (tab, folderId) => {
    try {
      const state = get();
      
      // 检查是否已存在相同 URL 的书签
      const existingBookmark = state.bookmarks.find(b => b.url === tab.url);
      if (existingBookmark) {
        console.log('[BookmarkStoreV2] Bookmark already exists:', tab.url);
        set({ error: '此页面已在书签中' });
        return;
      }

      // 使用 BookmarkService 添加书签到 Chrome Native
      const targetFolderId = folderId || state.anyMarkRootId;
      if (!targetFolderId) {
        throw new Error('No target folder available');
      }

      const chromeId = await state.addBookmark(tab.url, tab.title, targetFolderId);
      
      if (chromeId) {
        // 从最近标签页列表中移除
        await recentTabsService.removeTab(tab.url);
        console.log('[BookmarkStoreV2] Added tab to bookmarks:', tab.title);
      }
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to add tab to bookmarks:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  
  // ============ UI 状态 ============
  
  setSelectedId: (id) => set({ selectedId: id }),
  
  toggleSelectItem: (id) => set((state) => {
    const newSelectedIds = new Set(state.selectedIds);
    if (newSelectedIds.has(id)) {
      newSelectedIds.delete(id);
    } else {
      newSelectedIds.add(id);
    }
    return { selectedIds: newSelectedIds };
  }),
  
  selectAll: () => set((state) => {
    const allIds = new Set([
      ...state.bookmarks.map(b => b.chromeId),
      ...state.folders.map(f => f.chromeId),
    ]);
    return { selectedIds: allIds };
  }),
  
  clearSelection: () => set({ selectedIds: new Set() }),
  
  toggleFolderExpanded: (folderId) => set((state) => {
    const newExpandedIds = new Set(state.expandedFolderIds);
    if (newExpandedIds.has(folderId)) {
      newExpandedIds.delete(folderId);
    } else {
      newExpandedIds.add(folderId);
    }
    return { expandedFolderIds: newExpandedIds };
  }),
  
  setCurrentFolder: (folderId) => set({ currentFolderId: folderId }),
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  setCurrentFilter: (filter) => set({ currentFilter: filter }),
  
  setCurrentSort: (sort) => set({ currentSort: sort }),
  
  setViewMode: (mode) => set({ viewMode: mode }),
  
  setError: (error) => set({ error }),
  
  // ============ Computed ============
  
  getFilteredItems: () => {
    const state = get();
    const { bookmarks, folders, searchQuery, currentFilter, currentSort, currentFolderId, anyMarkRootId, expandedFolderIds } = state;
    
    // 如果有搜索查询，或者不是 Chrome 视图，使用扁平列表过滤
    if (searchQuery || currentFilter !== 'chrome') {
      let filteredBookmarks = [...bookmarks];
      let filteredFolders = [...folders];
      
      // 搜索过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        
        // 1. 先找出所有匹配的文件夹
        filteredFolders = filteredFolders.filter(f =>
          f.title.toLowerCase().includes(query)
        );
        
        // 2. 创建匹配文件夹的 ID 集合（包括递归的子文件夹）
        const matchedFolderIds = new Set(filteredFolders.map(f => f.chromeId));
        
        // 3. 过滤书签：匹配搜索词 且 父文件夹不在匹配列表中
        filteredBookmarks = filteredBookmarks.filter(b => {
          const matchesQuery = 
            b.title.toLowerCase().includes(query) ||
            b.url.toLowerCase().includes(query) ||
            b.aiTags.some(t => t.toLowerCase().includes(query)) ||
            b.userTags.some(t => t.toLowerCase().includes(query));
          
          // 如果书签匹配，但父文件夹也匹配了，则不单独显示该书签
          const parentFolderMatched = matchedFolderIds.has(b.parentId);
          
          return matchesQuery && !parentFolderMatched;
        });
      }
      
      // 文件夹过滤 (非 Chrome 视图下，如果有 currentFolderId，仍然过滤)
      if (currentFolderId && !searchQuery) {
        filteredBookmarks = filteredBookmarks.filter(b => b.parentId === currentFolderId);
        filteredFolders = filteredFolders.filter(f => f.parentId === currentFolderId);
      }
      
            // 类型过滤
      
            switch (currentFilter) {
      
              case 'trash':

                // 回收站：显示所有状态为 deleted 的书签和 .Trash 中的文件夹

                filteredBookmarks = bookmarks.filter(b => b.status === 'deleted');

                filteredFolders = folders.filter(f => f.path.startsWith('/.Trash/'));

                break;
      
              case 'starred':
      
                filteredBookmarks = filteredBookmarks.filter(b => b.starred);
      
                filteredFolders = [];
      
                break;
        case 'recent':
          filteredBookmarks = filteredBookmarks
            .sort((a, b) => b.dateAdded - a.dateAdded)
            .slice(0, 50);
          filteredFolders = [];
          break;
        case 'popular':
          // 访问次数最多的前 20 个书签
          filteredBookmarks = filteredBookmarks
            .filter(b => b.analytics.visitCount > 0)
            .sort((a, b) => b.analytics.visitCount - a.analytics.visitCount)
            .slice(0, 20);
          filteredFolders = [];
          break;
        case 'longtail':
          // 长尾书签 - 智能判断被遗忘的书签
          // 设计原则：
          // 1. 如果书签有访问记录，且超过 30 天未访问 -> longtail
          // 2. 如果书签从未访问，但创建时间超过 30 天 -> longtail
          // 3. 如果书签是最近创建的（30天内）且从未访问 -> 不算 longtail（可能还没来得及用）
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          filteredBookmarks = filteredBookmarks
            .filter(b => {
              const hasVisited = b.analytics.lastVisit && b.analytics.lastVisit > 0;
              const bookmarkAge = Date.now() - b.dateAdded;
              const isOldBookmark = bookmarkAge > 30 * 24 * 60 * 60 * 1000;
              
              if (hasVisited) {
                // 有访问记录：超过 30 天未访问
                return (b.analytics.lastVisit || 0) < thirtyDaysAgo;
              } else {
                // 从未访问：只有创建超过 30 天的才算 longtail
                // 这样可以避免把刚导入的书签误判为 longtail
                return isOldBookmark;
              }
            })
            .sort((a, b) => {
              // 优先显示有访问记录但很久未访问的（这些更值得关注）
              const aHasVisit = a.analytics.lastVisit && a.analytics.lastVisit > 0;
              const bHasVisit = b.analytics.lastVisit && b.analytics.lastVisit > 0;
              
              if (aHasVisit && !bHasVisit) return -1;
              if (!aHasVisit && bHasVisit) return 1;
              
              // 都有访问记录：按最后访问时间升序（越久未访问越靠前）
              if (aHasVisit && bHasVisit) {
                return (a.analytics.lastVisit || 0) - (b.analytics.lastVisit || 0);
              }
              
              // 都没访问记录：按创建时间升序（越老越靠前）
              return a.dateAdded - b.dateAdded;
            });
          filteredFolders = [];
          break;
        case 'frequent':
          filteredBookmarks = filteredBookmarks
            .filter(b => b.analytics.visitCount > 0)
            .sort((a, b) => b.analytics.visitCount - a.analytics.visitCount);
          filteredFolders = [];
          break;
        case 'unvisited':
          filteredBookmarks = filteredBookmarks.filter(b => b.analytics.visitCount === 0);
          filteredFolders = [];
          break;
        case 'important':
          filteredBookmarks = filteredBookmarks
            .filter(b => b.analytics.importance > 70)
            .sort((a, b) => b.analytics.importance - a.analytics.importance);
          filteredFolders = [];
          break;
      }
      
      // 排序
      if (!searchQuery) { // 搜索时通常按相关性，这里简化为不排序或保持原序
        switch (currentSort) {
          case 'title':
            filteredBookmarks.sort((a, b) => a.title.localeCompare(b.title));
            filteredFolders.sort((a, b) => a.title.localeCompare(b.title));
            break;
          case 'date':
            filteredBookmarks.sort((a, b) => b.dateAdded - a.dateAdded);
            filteredFolders.sort((a, b) => b.dateAdded - a.dateAdded);
            break;
          case 'visits':
            filteredBookmarks.sort((a, b) => b.analytics.visitCount - a.analytics.visitCount);
            break;
          case 'importance':
            filteredBookmarks.sort((a, b) => b.analytics.importance - a.analytics.importance);
            break;
        }
      }
      
      return [...filteredFolders, ...filteredBookmarks];
    }

    // Chrome 视图 (Tree View) Logic
    const result: (MergedItem & { depth: number })[] = [];
    const rootId = currentFolderId || anyMarkRootId;
    
    if (!rootId) return [];

    // 递归构建树形列表，带有深度信息
    const buildTree = (parentId: string, depth: number = 0) => {
      // 获取当前层级的文件夹和书签
      let currentFolders = folders.filter(f => f.parentId === parentId);
      let currentBookmarks = bookmarks.filter(b => b.parentId === parentId);

      // 排序
      switch (currentSort) {
        case 'title':
          currentFolders.sort((a, b) => a.title.localeCompare(b.title));
          currentBookmarks.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'date':
          currentFolders.sort((a, b) => b.dateAdded - a.dateAdded);
          currentBookmarks.sort((a, b) => b.dateAdded - a.dateAdded);
          break;
        case 'visits':
          currentBookmarks.sort((a, b) => b.analytics.visitCount - a.analytics.visitCount);
          break;
        case 'importance':
          currentBookmarks.sort((a, b) => b.analytics.importance - a.analytics.importance);
          break;
      }

      // 添加到结果列表，并递归处理展开的文件夹
      // 文件夹优先
      for (const folder of currentFolders) {
        result.push({ ...folder, depth });
        if (expandedFolderIds.has(folder.chromeId)) {
          buildTree(folder.chromeId, depth + 1);
        }
      }
      
      // 添加书签
      for (const bookmark of currentBookmarks) {
        result.push({ ...bookmark, depth });
      }
    };

    buildTree(rootId, 0);
    return result;
  },
  
  getBookmarkById: (chromeId) => {
    const state = get();
    const item = state.idIndex.get(chromeId);
    return item && 'url' in item ? item as MergedBookmark : undefined;
  },
  
  getFolderById: (chromeId) => {
    const state = get();
    const item = state.idIndex.get(chromeId);
    return item && !('url' in item) ? item as MergedFolder : undefined;
  },
  
  getFolderByPath: (path) => {
    return get().pathIndex.get(path);
  },
  
  getChildrenByParentId: (parentId) => {
    return get().childrenIndex.get(parentId || '') || [];
  },
  
  // ============ 新 API（基于 BookmarkNode）============
  
  getNodes: () => {
    const state = get();
    // 从 bookmarks 和 folders 动态生成 nodes（渐进迁移期间）
    const bookmarkNodes = state.bookmarks.map(b => {
      const folder = state.folders.find(f => f.chromeId === b.parentId);
      return mergedBookmarkToNode(b, folder?.path ? `${folder.path}/${b.title}` : `/${b.title}`);
    });
    const folderNodes = state.folders.map(f => mergedFolderToNode(f));
    return [...folderNodes, ...bookmarkNodes];
  },
  
  getBookmarkNodes: () => {
    return get().getNodes().filter(n => n.type === 'bookmark');
  },
  
  getFolderNodes: () => {
    return get().getNodes().filter(n => n.type === 'folder');
  },
  
  getDeletedNodes: () => {
    return get().getNodes().filter(n => n.deleted === true);
  },
  
  getNodeById: (id) => {
    return get().getNodes().find(n => n.id === id);
  },
  
  getChildNodes: (parentId) => {
    return get().getNodes().filter(n => n.parentId === parentId);
  },
  
  getCurrentFolderItems: () => {
    const state = get();
    const { currentFolderId, anyMarkRootId } = state;
    const targetId = currentFolderId || anyMarkRootId;
    
    if (!targetId) return [];
    
    // 使用索引查询（O(1)）
    return state.getChildrenByParentId(targetId);
  },
  
  _rebuildIndexes: () => {
    const state = get();
    const indexes = buildIndexes(state.bookmarks, state.folders);
    set(indexes);
  },
}));

// ============ 辅助函数 ============

/**
 * 合并 Chrome Native 数据和元数据
 * 虚拟根架构：处理三个顶级文件夹
 */
async function mergeData(
  tree: ChromeBookmarkTreeNode | null,
  metadata: Map<string, BookmarkMetadata>,
  anyMarkRootId: string,
  trashFolderId?: string | null
): Promise<{ bookmarks: MergedBookmark[]; folders: MergedFolder[] }> {
  const bookmarks: MergedBookmark[] = [];
  const folders: MergedFolder[] = [];

  if (!tree) return { bookmarks, folders };

  // 顶级文件夹的中文名称映射
  const TOP_LEVEL_FOLDER_NAMES: Record<string, string> = {
    '1': '书签栏',
    '2': '其他书签',
    '3': '移动设备书签',
  };

  // 第一步：收集所有唯一的 URL
  const uniqueUrls = new Set<string>();

  function collectUrls(node: ChromeBookmarkTreeNode): void {
    if (node.url) {
      uniqueUrls.add(node.url);
    }
    if (node.children) {
      for (const child of node.children) {
        collectUrls(child);
      }
    }
  }

  collectUrls(tree);

  // 第二步：批量获取访问统计（并行处理，大幅提升性能）
  const visitStatsCache = new Map<string, { visitCount: number; lastVisit: number }>();

  if (uniqueUrls.size > 0) {
    console.log(`[BookmarkStoreV2] Fetching visit stats for ${uniqueUrls.size} unique URLs...`);

    // 单个 URL 的 history 查询（带超时和重试）
    async function fetchVisitStatsForUrl(
      url: string,
      timeoutMs: number,
      maxRetries: number
    ): Promise<{ url: string; stats: { visitCount: number; lastVisit: number } }> {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const historyPromise = chrome.history.search({
            text: url,
            maxResults: 1,
          });

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('History search timeout')), timeoutMs)
          );

          const historyItems = await Promise.race([historyPromise, timeoutPromise]) as chrome.history.HistoryItem[];

          const stats =
            historyItems.length > 0 && historyItems[0].url === url
              ? {
                  visitCount: historyItems[0].visitCount || 0,
                  lastVisit: historyItems[0].lastVisitTime || 0,
                }
              : { visitCount: 0, lastVisit: 0 };

          return { url, stats };
        } catch {
          if (attempt < maxRetries) {
            // 重试前等待，递增延迟
            await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }
          // 最终失败，静默返回默认值（不再逐条打 warn）
          return { url, stats: { visitCount: 0, lastVisit: 0 } };
        }
      }
      return { url, stats: { visitCount: 0, lastVisit: 0 } };
    }

    // 分批处理：每批 20 个并发，批间串行，降低 Chrome history API 压力
    const batchSize = 20;
    const maxRetries = 1;
    const timeoutMs = 5000;
    const urlArray = Array.from(uniqueUrls);
    let failedCount = 0;

    for (let i = 0; i < urlArray.length; i += batchSize) {
      const batch = urlArray.slice(i, Math.min(i + batchSize, urlArray.length));

      try {
        const results = await Promise.all(
          batch.map(url => fetchVisitStatsForUrl(url, timeoutMs, maxRetries))
        );

        for (const { url, stats } of results) {
          visitStatsCache.set(url, stats);
          if (stats.visitCount === 0 && stats.lastVisit === 0) {
            failedCount++;
          }
        }
      } catch (error) {
        console.warn('[BookmarkStoreV2] Batch processing error:', error);
        // 整批失败时填充默认值
        for (const url of batch) {
          visitStatsCache.set(url, { visitCount: 0, lastVisit: 0 });
          failedCount++;
        }
      }

      // 批间短暂让出主线程，避免阻塞 UI
      if (i + batchSize < urlArray.length) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    const successCount = visitStatsCache.size - failedCount;
    console.log(`[BookmarkStoreV2] Visit stats fetched: ${successCount} success, ${failedCount} failed/empty, ${visitStatsCache.size} total`);
  }

  // 辅助函数：获取访问统计（从缓存中读取）
  function getVisitStats(url: string): { visitCount: number; lastVisit: number } {
    return visitStatsCache.get(url) || { visitCount: 0, lastVisit: 0 };
  }
  
  // 递归收集 .Trash 文件夹中的书签和文件夹，标记为 deleted
  function collectTrashItems(node: ChromeBookmarkTreeNode, trashPath = '/.Trash'): void {
    if (node.url) {
      const meta = metadata.get(node.id) || DEFAULT_BOOKMARK_METADATA;
      bookmarks.push({
        chromeId: node.id,
        url: node.url,
        title: node.title || '未命名书签（已删除）',
        parentId: meta.snapshot?.parentId || node.parentId || '',
        index: -1,
        dateAdded: node.dateAdded || Date.now(),
        aiTags: meta.aiTags || [],
        aiSummary: meta.aiSummary,
        aiCategory: meta.aiCategory,
        aiSubcategory: meta.aiSubcategory,
        aiConfidence: meta.aiConfidence,
        aiTechStack: meta.aiTechStack || [],
        userTags: meta.userTags || [],
        starred: meta.starred || false,
        pinned: meta.pinned || false,
        analytics: meta.analytics || { visitCount: 0, importance: 50 },
        favicon: getFaviconUrl(node.url),
        status: 'deleted',
      });
    } else if (node.children) {
      const folderTitle = node.title || '未命名文件夹';
      const currentPath = `${trashPath}/${folderTitle}`;

      // 跳过 .Trash 根节点本身，只收集其子文件夹
      if (trashPath !== '/.Trash' || node.title !== '.Trash') {
        let bookmarkCount = 0;
        let subfolderCount = 0;
        for (const child of node.children) {
          if (child.url) bookmarkCount++;
          else subfolderCount++;
        }
        folders.push({
          chromeId: node.id,
          title: folderTitle,
          parentId: node.parentId || '',
          index: node.index,
          dateAdded: node.dateAdded || Date.now(),
          dateGroupModified: node.dateGroupModified,
          bookmarkCount,
          subfolderCount,
          path: currentPath,
        });
      }

      for (const child of node.children) {
        collectTrashItems(child, currentPath);
      }
    }
  }

  // 递归处理节点（同步处理，因为访问统计已预先加载）
  function processNode(node: ChromeBookmarkTreeNode, path: string, parentNodeId: string): void {
    // 数据验证：确保 title 有效（防止空值或 undefined）
    // 对于顶级文件夹，使用中文名称
    let nodeTitle = node.title;
    
    // 检查是否是顶级文件夹
    const isTopLevelFolder = TOP_LEVEL_FOLDER_NAMES[node.id] !== undefined;
    if (isTopLevelFolder) {
      nodeTitle = TOP_LEVEL_FOLDER_NAMES[node.id];
    } else if (!nodeTitle || nodeTitle.trim() === '') {
      if (node.url) {
        // 书签：尝试从 URL 提取域名
        try {
          const urlObj = new URL(node.url);
          nodeTitle = urlObj.hostname.replace(/^www\./, '') || '未命名书签';
        } catch {
          nodeTitle = '未命名书签';
        }
      } else {
        // 文件夹：使用 ID 作为 fallback（这种情况不应该发生，但需要处理）
        nodeTitle = `未命名文件夹_${node.id.slice(0, 8)}`;
        console.warn('[BookmarkStore] 检测到无名称的文件夹:', node.id);
      }
    }

    const currentPath = path ? `${path}/${nodeTitle}` : `/${nodeTitle}`;

    if (node.url) {
      // 书签
      const meta = metadata.get(node.id) || DEFAULT_BOOKMARK_METADATA;

      // 从缓存中获取访问统计（已预先批量加载）
      const visitStats = getVisitStats(node.url);
      
      bookmarks.push({
        chromeId: node.id,
        url: node.url,
        title: nodeTitle,
        parentId: parentNodeId,
        index: node.index,
        dateAdded: node.dateAdded || Date.now(),
        
        aiTags: meta.aiTags || [],
        aiSummary: meta.aiSummary,
        aiCategory: meta.aiCategory,
        aiSubcategory: meta.aiSubcategory,
        aiConfidence: meta.aiConfidence,
        aiTechStack: meta.aiTechStack || [],
        
        userTags: meta.userTags || [],
        starred: meta.starred || false,
        pinned: meta.pinned || false,
        
        // 使用 Chrome History API 的数据，而不是自己统计的
        analytics: {
          visitCount: visitStats.visitCount,
          lastVisit: visitStats.lastVisit,
          importance: meta.analytics?.importance || 50,
        },
        
        favicon: getFaviconUrl(node.url),
        status: 'active' as const,
      });
    } else {
      // 文件夹

      // 跳过 .Trash 文件夹，将其内容作为 deleted 书签收集
      if (trashFolderId && node.id === trashFolderId) {
        collectTrashItems(node);
        return;
      }

      let bookmarkCount = 0;
      let subfolderCount = 0;

      if (node.children) {
        for (const child of node.children) {
          if (child.url) bookmarkCount++;
          else subfolderCount++;
        }
      }

      const folderObj = {
        chromeId: node.id,
        title: nodeTitle,
        parentId: parentNodeId,
        index: node.index,
        dateAdded: node.dateAdded || Date.now(),
        dateGroupModified: node.dateGroupModified,
        bookmarkCount,
        subfolderCount,
        path: currentPath,
      };
      folders.push(folderObj);

      // DEBUG: 打印文件夹创建信息（仅前5个）
      if (folders.length <= 5) {
        console.log('[mergeData] Created folder:', {
          id: folderObj.chromeId,
          title: folderObj.title,
          parentId: folderObj.parentId,
          path: folderObj.path,
        });
      }

      // 递归处理子节点
      if (node.children) {
        for (const child of node.children) {
          processNode(child, currentPath, node.id);  // 传递当前节点 ID 作为父 ID
        }
      }
    }
  }

  // 虚拟根架构：处理虚拟根节点（id: "0"）
  // 虚拟根的 children 是三个顶级文件夹
  if (tree.id === anyMarkRootId && tree.children) {
    for (const topLevelFolder of tree.children) {
      // 处理每个顶级文件夹
      processNode(topLevelFolder, '', anyMarkRootId);
    }
  } else {
    // 兼容旧逻辑：如果不是虚拟根，直接处理
    processNode(tree, '', anyMarkRootId);
  }
  
  return { bookmarks, folders };
}

/**
 * 获取 favicon URL
 */
function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch {
    return '';
  }
}

/**
 * 快速加载基础数据（不包含访问统计）
 * 虚拟根架构：处理三个顶级文件夹
 * 用于初始化时立即显示 UI，避免卡在 loading 状态
 */
async function mergeDataBasic(
  tree: ChromeBookmarkTreeNode | null,
  metadata: Map<string, BookmarkMetadata>,
  anyMarkRootId: string,
  trashFolderId?: string | null
): Promise<{ bookmarks: MergedBookmark[]; folders: MergedFolder[] }> {
  const bookmarks: MergedBookmark[] = [];
  const folders: MergedFolder[] = [];

  if (!tree) return { bookmarks, folders };

  // 顶级文件夹的中文名称映射
  const TOP_LEVEL_FOLDER_NAMES: Record<string, string> = {
    '1': '书签栏',
    '2': '其他书签',
    '3': '移动设备书签',
  };

  console.log('[BookmarkStoreV2] mergeDataBasic: Starting fast load without visit stats');

  // DEBUG: 打印树的根节点信息
  console.log('[mergeDataBasic] Root tree info:', {
    treeId: tree.id,
    treeTitle: tree.title,
    treeIdMatchesAnyMark: tree.id === anyMarkRootId,
    hasChildren: !!tree.children,
    childrenCount: tree.children?.length || 0,
    first3Children: tree.children?.slice(0, 3).map(c => ({
      id: c.id,
      title: c.title,
      url: c.url,
      hasChildren: !!c.children,
      childrenCount: c.children?.length || 0,
      parentId: c.parentId,
    })),
  });

  // 递归收集 .Trash 文件夹中的书签和文件夹，标记为 deleted
  function collectTrashItems(node: ChromeBookmarkTreeNode, trashPath = '/.Trash'): void {
    if (node.url) {
      const meta = metadata.get(node.id) || DEFAULT_BOOKMARK_METADATA;
      bookmarks.push({
        chromeId: node.id,
        url: node.url,
        title: node.title || '未命名书签（已删除）',
        parentId: meta.snapshot?.parentId || node.parentId || '',
        index: -1,
        dateAdded: node.dateAdded || Date.now(),
        aiTags: meta.aiTags || [],
        aiSummary: meta.aiSummary,
        aiCategory: meta.aiCategory,
        aiSubcategory: meta.aiSubcategory,
        aiConfidence: meta.aiConfidence,
        aiTechStack: meta.aiTechStack || [],
        userTags: meta.userTags || [],
        starred: meta.starred || false,
        pinned: meta.pinned || false,
        analytics: meta.analytics || { visitCount: 0, importance: 50 },
        favicon: getFaviconUrl(node.url),
        status: 'deleted',
      });
    } else if (node.children) {
      const folderTitle = node.title || '未命名文件夹';
      const currentPath = `${trashPath}/${folderTitle}`;

      // 跳过 .Trash 根节点本身，只收集其子文件夹
      if (trashPath !== '/.Trash' || node.title !== '.Trash') {
        let bookmarkCount = 0;
        let subfolderCount = 0;
        for (const child of node.children) {
          if (child.url) bookmarkCount++;
          else subfolderCount++;
        }
        folders.push({
          chromeId: node.id,
          title: folderTitle,
          parentId: node.parentId || '',
          index: node.index,
          dateAdded: node.dateAdded || Date.now(),
          dateGroupModified: node.dateGroupModified,
          bookmarkCount,
          subfolderCount,
          path: currentPath,
        });
      }

      for (const child of node.children) {
        collectTrashItems(child, currentPath);
      }
    }
  }

  // 递归处理节点（不调用 Chrome History API）
  function processNode(node: ChromeBookmarkTreeNode, path: string, parentNodeId: string): void {
    // 数据验证：确保 title 有效（防止空值或 undefined）
    // 对于顶级文件夹，使用中文名称
    let nodeTitle = node.title;

    // 检查是否是顶级文件夹
    const isTopLevelFolder = TOP_LEVEL_FOLDER_NAMES[node.id] !== undefined;
    if (isTopLevelFolder) {
      nodeTitle = TOP_LEVEL_FOLDER_NAMES[node.id];
    } else if (!nodeTitle || nodeTitle.trim() === '') {
      if (node.url) {
        // 书签：尝试从 URL 提取域名
        try {
          const urlObj = new URL(node.url);
          nodeTitle = urlObj.hostname.replace(/^www\./, '') || '未命名书签';
        } catch {
          nodeTitle = '未命名书签';
        }
      } else {
        // 文件夹：使用 ID 作为 fallback
        nodeTitle = `未命名文件夹_${node.id.slice(0, 8)}`;
        console.warn('[BookmarkStore] 检测到无名称的文件夹:', node.id);
      }
    }

    const currentPath = path ? `${path}/${nodeTitle}` : `/${nodeTitle}`;

    if (node.url) {
      // 书签 - 使用默认访问统计（0）
      const meta = metadata.get(node.id) || DEFAULT_BOOKMARK_METADATA;

      const bookmarkObj = {
        chromeId: node.id,
        url: node.url,
        title: nodeTitle,
        parentId: parentNodeId,
        index: node.index,
        dateAdded: node.dateAdded || Date.now(),

        aiTags: meta.aiTags || [],
        aiSummary: meta.aiSummary,
        aiCategory: meta.aiCategory,
        aiSubcategory: meta.aiSubcategory,
        aiConfidence: meta.aiConfidence,
        aiTechStack: meta.aiTechStack || [],

        userTags: meta.userTags || [],
        starred: meta.starred || false,
        pinned: meta.pinned || false,

        // 使用默认值，稍后通过 mergeDataWithVisitStats 更新
        analytics: {
          visitCount: 0,
          lastVisit: 0,
          importance: meta.analytics?.importance || 50,
        },

        favicon: getFaviconUrl(node.url),
        status: 'active' as const,
      };
      bookmarks.push(bookmarkObj);

      // DEBUG: 打印前10个书签的详细信息
      if (bookmarks.length <= 10) {
        console.log('[mergeDataBasic] Bookmark created:', {
          chromeId: bookmarkObj.chromeId,
          title: bookmarkObj.title,
          parentId: bookmarkObj.parentId,
          url: bookmarkObj.url.substring(0, 50),
        });
      }
    } else {
      // 文件夹

      // .Trash 文件夹：收集其书签为 deleted，不加入正常文件夹列表
      if (trashFolderId && node.id === trashFolderId) {
        collectTrashItems(node);
        return;
      }

      let bookmarkCount = 0;
      let subfolderCount = 0;

      if (node.children) {
        for (const child of node.children) {
          if (child.url) bookmarkCount++;
          else subfolderCount++;
        }
      }

      const folderObj = {
        chromeId: node.id,
        title: nodeTitle,
        parentId: parentNodeId,
        index: node.index,
        dateAdded: node.dateAdded || Date.now(),
        dateGroupModified: node.dateGroupModified,
        bookmarkCount,
        subfolderCount,
        path: currentPath,
      };
      folders.push(folderObj);

      // DEBUG: 打印每个文件夹的详细信息
      console.log('[mergeDataBasic] Folder created:', {
        chromeId: folderObj.chromeId,
        title: folderObj.title,
        path: folderObj.path,
        parentId: folderObj.parentId,
        bookmarkCount,
        subfolderCount,
        hasChildren: !!node.children,
      });

      // 递归处理子节点
      if (node.children) {
        for (const child of node.children) {
          processNode(child, currentPath, node.id);  // 传递当前节点 ID 作为父 ID
        }
      }
    }
  }

  // 虚拟根架构：处理虚拟根节点（id: "0"）
  // 虚拟根的 children 是三个顶级文件夹
  if (tree.id === anyMarkRootId && tree.children) {
    for (const topLevelFolder of tree.children) {
      // 处理每个顶级文件夹
      processNode(topLevelFolder, '', anyMarkRootId);
    }
  } else {
    // 兼容旧逻辑：如果不是虚拟根，直接处理
    processNode(tree, '', anyMarkRootId);
  }

  console.log('[BookmarkStoreV2] mergeDataBasic: Loaded', bookmarks.length, 'bookmarks,', folders.length, 'folders');
  return { bookmarks, folders };
}

/**
 * 在后台加载访问统计并更新书签数据
 * 这个函数在 UI 显示后异步执行，不阻塞用户交互
 */
async function mergeDataWithVisitStats(
  tree: ChromeBookmarkTreeNode | null,
  metadata: Map<string, BookmarkMetadata>,
  anyMarkRootId: string,
  trashFolderId?: string | null
): Promise<{ bookmarks: MergedBookmark[]; folders: MergedFolder[] }> {
  // 复用原有的 mergeData 逻辑，只返回书签（文件夹不需要更新）
  const result = await mergeData(tree, metadata, anyMarkRootId, trashFolderId);
  console.log('[BookmarkStoreV2] mergeDataWithVisitStats: Loaded visit stats for', result.bookmarks.length, 'bookmarks');
  return result;
}

/**
 * 收集文件夹下所有书签的 ID（旧版本 - 需要 tree 参数，效率较低）
 */
function collectBookmarkIds(tree: ChromeBookmarkTreeNode | null, folderId: string): string[] {
  const ids: string[] = [];

  if (!tree) return ids;

  function findFolder(node: ChromeBookmarkTreeNode): ChromeBookmarkTreeNode | null {
    if (node.id === folderId) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findFolder(child);
        if (found) return found;
      }
    }
    return null;
  }

  function collectIds(node: ChromeBookmarkTreeNode): void {
    if (node.url) {
      ids.push(node.id);
    }
    if (node.children) {
      for (const child of node.children) {
        collectIds(child);
      }
    }
  }

  const folder = findFolder(tree);
  if (folder) {
    collectIds(folder);
  }

  return ids;
}

/**
 * 收集文件夹下所有书签的 ID（优化版本 - 并行递归）
 * 使用 Promise.all 并行处理子文件夹，提高大文件夹的删除速度
 */
async function collectDescendantBookmarkIds(folderId: string): Promise<string[]> {
  const ids: string[] = [];

  async function collectRecursive(id: string): Promise<void> {
    try {
      const children = await chrome.bookmarks.getChildren(id);

      // 分离书签和文件夹
      const bookmarkIds: string[] = [];
      const folderIds: string[] = [];

      for (const child of children) {
        if (child.url) {
          bookmarkIds.push(child.id);
        } else {
          folderIds.push(child.id);
        }
      }

      // 立即添加当前层级的书签 ID
      ids.push(...bookmarkIds);

      // 并行处理所有子文件夹
      await Promise.all(folderIds.map(subFolderId => collectRecursive(subFolderId)));
    } catch (error) {
      console.error('[collectDescendantBookmarkIds] Failed to get children for', id, error);
    }
  }

  await collectRecursive(folderId);
  return ids;
}

/**
 * 设置事件监听器（使用防抖刷新，避免频繁的全量刷新）
 */
function setupEventListeners(
  bookmarkService: ReturnType<typeof getBookmarkService>,
  metadataService: ReturnType<typeof getMetadataService>,
  get: () => BookmarkStateV2,
  set: (state: Partial<BookmarkStateV2>) => void
): void {
  // 书签创建事件
  bookmarkService.onBookmarkCreated(async (bookmark) => {
    console.log('[BookmarkStoreV2] Bookmark created event:', bookmark.id);

    // 为新书签创建默认元数据
    await metadataService.createDefaultMetadata(bookmark.id, 'browser');

    // 使用防抖刷新，避免频繁刷新
    get()._scheduleRefresh();
  });

  // 书签删除事件
  bookmarkService.onBookmarkRemoved(async (chromeId) => {
    console.log('[BookmarkStoreV2] Bookmark removed event:', chromeId);

    // 删除元数据
    await metadataService.deleteMetadata(chromeId);

    // 立即从列表移除（乐观更新）
    const state = get();
    state._removeBookmarkFromList(chromeId);

    // 使用防抖刷新确保最终一致性
    get()._scheduleRefresh();
  });

  // 书签修改事件
  bookmarkService.onBookmarkChanged(async (chromeId, changeInfo) => {
    console.log('[BookmarkStoreV2] Bookmark changed event:', chromeId, changeInfo);

    // 使用防抖刷新，避免频繁刷新
    get()._scheduleRefresh();
  });

  // 书签移动事件
  bookmarkService.onBookmarkMoved(async (chromeId, moveInfo) => {
    console.log('[BookmarkStoreV2] Bookmark moved event:', chromeId, moveInfo);

    // 使用防抖刷新，避免频繁刷新
    get()._scheduleRefresh();
  });
}

// ============ 导出 ============

export type { BookmarkStateV2 };
