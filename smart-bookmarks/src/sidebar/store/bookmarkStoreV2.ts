/**
 * BookmarkStore V2 - 新架构书签状态管理
 * 
 * 设计原则：
 * 1. Chrome Native 作为唯一数据源
 * 2. chromeId 作为主键
 * 3. 通过 BookmarkService 和 MetadataService 操作数据
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
  DEFAULT_BOOKMARK_METADATA,
  isMergedBookmark,
  isMergedFolder,
} from '../../types/chromeBookmark';
import type { FilterType, SortType, ViewMode, IRecentTab } from '../../types/bookmark';

// ============ 状态接口 ============

interface BookmarkStateV2 {
  // 数据
  bookmarks: MergedBookmark[];
  folders: MergedFolder[];
  anyMarkRootId: string | null;
  
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
  moveBookmark: (chromeId: string, newFolderId: string) => Promise<void>;
  
  // Actions - 文件夹操作
  createFolder: (title: string, parentId?: string) => Promise<string | null>;
  renameFolder: (chromeId: string, newTitle: string) => Promise<void>;
  deleteFolder: (chromeId: string) => Promise<void>;
  moveFolder: (chromeId: string, newParentId: string) => Promise<void>;
  
  // Actions - 元数据操作
  updateMetadata: (chromeId: string, metadata: UpdateMetadataParams) => Promise<void>;
  toggleStarred: (chromeId: string) => Promise<void>;
  togglePinned: (chromeId: string) => Promise<void>;
  addTag: (chromeId: string, tag: string) => Promise<void>;
  removeTag: (chromeId: string, tag: string) => Promise<void>;
  recordVisit: (chromeId: string) => Promise<void>;
  
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
  
  // Computed
  getFilteredItems: () => MergedItem[];
  getBookmarkById: (chromeId: string) => MergedBookmark | undefined;
  getFolderById: (chromeId: string) => MergedFolder | undefined;
  getCurrentFolderItems: () => MergedItem[];
}

// ============ Store 实现 ============

export const useBookmarkStoreV2 = create<BookmarkStateV2>((set, get) => ({
  // 初始状态
  bookmarks: [],
  folders: [],
  anyMarkRootId: null,
  
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
  
  // ============ 初始化 ============
  
  initialize: async () => {
    const state = get();
    if (state.isInitialized) {
      console.log('[BookmarkStoreV2] Already initialized');
      return;
    }
    
    console.log('[BookmarkStoreV2] Initializing...');
    set({ isLoading: true, error: null });
    
    try {
      // 初始化服务
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      
      await bookmarkService.initialize();
      await metadataService.initialize();
      
      const anyMarkRootId = bookmarkService.getAnyMarkRootId();
      
      // 加载数据
      const tree = await bookmarkService.getBookmarkTree();
      const metadata = await metadataService.getAllMetadata();
      
      // 合并数据（使用 Chrome History API 获取访问统计）
      const { bookmarks, folders } = await mergeData(tree, metadata, anyMarkRootId);
      
      // 设置事件监听
      setupEventListeners(bookmarkService, metadataService, get, set);
      
      set({
        bookmarks,
        folders,
        anyMarkRootId,
        isLoading: false,
        isInitialized: true,
      });
      
      console.log('[BookmarkStoreV2] Initialized with', bookmarks.length, 'bookmarks and', folders.length, 'folders');
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
      const tree = await bookmarkService.getBookmarkTree();
      const metadata = await metadataService.getAllMetadata();
      
      const { bookmarks, folders } = await mergeData(tree, metadata, anyMarkRootId);
      
      set({
        bookmarks,
        folders,
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
      
      // 创建书签
      const chromeId = await bookmarkService.createBookmark({
        url,
        title,
        parentId,
      });
      
      // 创建默认元数据
      await metadataService.createDefaultMetadata(chromeId, 'manual');
      
      // 刷新数据
      await get().refresh();
      
      console.log('[BookmarkStoreV2] Added bookmark:', chromeId);
      return chromeId;
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to add bookmark:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },
  
  updateBookmark: async (chromeId, changes) => {
    try {
      const bookmarkService = getBookmarkService();
      await bookmarkService.updateBookmark(chromeId, changes);
      await get().refresh();
      console.log('[BookmarkStoreV2] Updated bookmark:', chromeId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to update bookmark:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  
  deleteBookmark: async (chromeId) => {
    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      
      const bookmark = get().getBookmarkById(chromeId);
      if (!bookmark) {
        // 如果在列表中找不到（可能已经是幽灵书签），尝试直接从 Metadata 删除
        await metadataService.deleteMetadata(chromeId);
        await get().refresh();
        return;
      }

      // 软删除：标记元数据并保存快照
      await metadataService.markAsDeleted(chromeId, {
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        path: '', 
        dateAdded: bookmark.dateAdded,
      });

      // 从 Chrome 物理删除
      await bookmarkService.deleteBookmark(chromeId);
      
      await get().refresh();
      
      console.log('[BookmarkStoreV2] Soft deleted bookmark:', chromeId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to delete bookmark:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  restoreBookmark: async (chromeId) => {
    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      
      const meta = await metadataService.getMetadata(chromeId);
      if (!meta || meta.status !== 'deleted' || !meta.snapshot) {
        throw new Error('Cannot restore: invalid metadata or snapshot');
      }

      // 尝试在原位置创建
      let newChromeId: string;
      try {
        newChromeId = await bookmarkService.createBookmark({
          url: meta.snapshot.url,
          title: meta.snapshot.title,
          parentId: meta.snapshot.parentId
        });
      } catch (e) {
        console.warn('[BookmarkStoreV2] Parent folder missing, restoring to root');
        // 如果原文件夹不存在，恢复到根目录
        newChromeId = await bookmarkService.createBookmark({
          url: meta.snapshot.url,
          title: meta.snapshot.title,
          parentId: undefined // default to root
        });
      }

      // 恢复元数据到新 ID
      await metadataService.setMetadata(newChromeId, {
        ...meta,
        status: 'active',
        snapshot: undefined,
        updatedAt: Date.now()
      });

      // 删除旧的幽灵元数据
      await metadataService.deleteMetadata(chromeId);

      await get().refresh();
      console.log('[BookmarkStoreV2] Restored bookmark:', chromeId, '->', newChromeId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to restore bookmark:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  
  moveBookmark: async (chromeId, newFolderId) => {
    try {
      const bookmarkService = getBookmarkService();
      await bookmarkService.moveBookmark(chromeId, newFolderId);
      await get().refresh();
      console.log('[BookmarkStoreV2] Moved bookmark:', chromeId, 'to', newFolderId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to move bookmark:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  
  // ============ 文件夹操作 ============
  
  createFolder: async (title, parentId) => {
    const state = get();
    const targetParentId = parentId || state.anyMarkRootId || undefined;
    
    try {
      const bookmarkService = getBookmarkService();
      const chromeId = await bookmarkService.createFolder({
        title,
        parentId: targetParentId,
      });
      
      await get().refresh();
      console.log('[BookmarkStoreV2] Created folder:', chromeId);
      return chromeId;
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to create folder:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },
  
  renameFolder: async (chromeId, newTitle) => {
    try {
      const bookmarkService = getBookmarkService();
      await bookmarkService.renameFolder(chromeId, newTitle);
      await get().refresh();
      console.log('[BookmarkStoreV2] Renamed folder:', chromeId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to rename folder:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  
  deleteFolder: async (chromeId) => {
    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      
      // 获取文件夹下所有书签的 ID（用于清理元数据）
      const tree = await bookmarkService.getBookmarkTree();
      const bookmarkIds = collectBookmarkIds(tree, chromeId);
      
      // 删除文件夹
      await bookmarkService.deleteFolder(chromeId);
      
      // 清理元数据
      await metadataService.deleteMetadataBatch(bookmarkIds);
      
      await get().refresh();
      console.log('[BookmarkStoreV2] Deleted folder:', chromeId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to delete folder:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  
  moveFolder: async (chromeId, newParentId) => {
    try {
      const bookmarkService = getBookmarkService();
      await bookmarkService.moveFolder(chromeId, newParentId);
      await get().refresh();
      console.log('[BookmarkStoreV2] Moved folder:', chromeId, 'to', newParentId);
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to move folder:', error);
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  
  // ============ 元数据操作 ============
  
  updateMetadata: async (chromeId, metadata) => {
    try {
      const metadataService = getMetadataService();
      await metadataService.setMetadata(chromeId, metadata);
      await get().refresh();
      console.log('[BookmarkStoreV2] Updated metadata:', chromeId);
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
        filteredBookmarks = filteredBookmarks.filter(b =>
          b.title.toLowerCase().includes(query) ||
          b.url.toLowerCase().includes(query) ||
          b.aiTags.some(t => t.toLowerCase().includes(query)) ||
          b.userTags.some(t => t.toLowerCase().includes(query))
        );
        filteredFolders = filteredFolders.filter(f =>
          f.title.toLowerCase().includes(query)
        );
      }
      
      // 文件夹过滤 (非 Chrome 视图下，如果有 currentFolderId，仍然过滤)
      if (currentFolderId && !searchQuery) {
        filteredBookmarks = filteredBookmarks.filter(b => b.parentId === currentFolderId);
        filteredFolders = filteredFolders.filter(f => f.parentId === currentFolderId);
      }
      
            // 类型过滤
      
            switch (currentFilter) {
      
              case 'trash':
      
                // 回收站：显示所有状态为 deleted 的书签（幽灵书签）
      
                filteredBookmarks = bookmarks.filter(b => b.status === 'deleted');
      
                filteredFolders = [];
      
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
                return b.analytics.lastVisit < thirtyDaysAgo;
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
    return get().bookmarks.find(b => b.chromeId === chromeId);
  },
  
  getFolderById: (chromeId) => {
    return get().folders.find(f => f.chromeId === chromeId);
  },
  
  getCurrentFolderItems: () => {
    const state = get();
    const { bookmarks, folders, currentFolderId, anyMarkRootId } = state;
    const targetId = currentFolderId || anyMarkRootId;
    
    if (!targetId) return [];
    
    const childBookmarks = bookmarks.filter(b => b.parentId === targetId);
    const childFolders = folders.filter(f => f.parentId === targetId);
    
    return [...childFolders, ...childBookmarks];
  },
}));

// ============ 辅助函数 ============

/**
 * 合并 Chrome Native 数据和元数据
 */
async function mergeData(
  tree: ChromeBookmarkTreeNode | null,
  metadata: Map<string, BookmarkMetadata>,
  anyMarkRootId: string
): Promise<{ bookmarks: MergedBookmark[]; folders: MergedFolder[] }> {
  const bookmarks: MergedBookmark[] = [];
  const folders: MergedFolder[] = [];
  
  if (!tree) return { bookmarks, folders };
  
  // 批量获取所有书签的访问统计（使用 Chrome History API）
  const visitStatsCache = new Map<string, { visitCount: number; lastVisit: number }>();
  
  async function getVisitStats(url: string): Promise<{ visitCount: number; lastVisit: number }> {
    if (visitStatsCache.has(url)) {
      return visitStatsCache.get(url)!;
    }
    
    try {
      const historyItems = await chrome.history.search({
        text: url,
        maxResults: 1,
      });
      
      if (historyItems.length > 0 && historyItems[0].url === url) {
        const stats = {
          visitCount: historyItems[0].visitCount || 0,
          lastVisit: historyItems[0].lastVisitTime || 0,
        };
        visitStatsCache.set(url, stats);
        return stats;
      }
    } catch (error) {
      console.error('[BookmarkStoreV2] Failed to get visit stats:', error);
    }
    
    const defaultStats = { visitCount: 0, lastVisit: 0 };
    visitStatsCache.set(url, defaultStats);
    return defaultStats;
  }
  
  async function processNode(node: ChromeBookmarkTreeNode, path: string): Promise<void> {
    // 跳过根节点本身
    if (node.id === anyMarkRootId) {
      if (node.children) {
        for (const child of node.children) {
          processNode(child, '');
        }
      }
      return;
    }
    
    const currentPath = path ? `${path}/${node.title}` : `/${node.title}`;
    
    if (node.url) {
      // 书签
      const meta = metadata.get(node.id) || DEFAULT_BOOKMARK_METADATA;
      
      // 从 Chrome History API 获取真实的访问统计
      const visitStats = await getVisitStats(node.url);
      
      bookmarks.push({
        chromeId: node.id,
        url: node.url,
        title: node.title,
        parentId: node.parentId || anyMarkRootId,
        index: node.index,
        dateAdded: node.dateAdded || Date.now(),
        
        aiTags: meta.aiTags || [],
        aiSummary: meta.aiSummary,
        aiCategory: meta.aiCategory,
        aiSubcategory: meta.aiSubcategory,
        aiConfidence: meta.aiConfidence,
        aiDifficulty: meta.aiDifficulty,
        aiTechStack: meta.aiTechStack || [],
        
        userTags: meta.userTags || [],
        userNotes: meta.userNotes,
        starred: meta.starred || false,
        pinned: meta.pinned || false,
        
        // 使用 Chrome History API 的数据，而不是自己统计的
        analytics: {
          visitCount: visitStats.visitCount,
          lastVisit: visitStats.lastVisit,
          importance: meta.analytics?.importance || 50,
        },
        
        favicon: getFaviconUrl(node.url),
        status: 'active',
      });
    } else {
      // 文件夹
      let bookmarkCount = 0;
      let subfolderCount = 0;
      
      if (node.children) {
        for (const child of node.children) {
          if (child.url) bookmarkCount++;
          else subfolderCount++;
        }
      }
      
      folders.push({
        chromeId: node.id,
        title: node.title,
        parentId: node.parentId || anyMarkRootId,
        index: node.index,
        dateAdded: node.dateAdded || Date.now(),
        dateGroupModified: node.dateGroupModified,
        bookmarkCount,
        subfolderCount,
        path: currentPath,
      });
      
      // 递归处理子节点
      if (node.children) {
        for (const child of node.children) {
          await processNode(child, currentPath);
        }
      }
    }
  }
  
  await processNode(tree, '');
  
  // 注入已删除的书签 (Ghosts)
  for (const [id, meta] of metadata.entries()) {
    if (meta.status === 'deleted' && meta.snapshot) {
      bookmarks.push({
        chromeId: id,
        url: meta.snapshot.url,
        title: meta.snapshot.title,
        parentId: meta.snapshot.parentId,
        index: -1,
        dateAdded: meta.snapshot.dateAdded || Date.now(),
        
        aiTags: meta.aiTags || [],
        aiSummary: meta.aiSummary,
        aiCategory: meta.aiCategory,
        aiSubcategory: meta.aiSubcategory,
        aiConfidence: meta.aiConfidence,
        aiDifficulty: meta.aiDifficulty,
        aiTechStack: meta.aiTechStack || [],
        
        userTags: meta.userTags || [],
        userNotes: meta.userNotes,
        starred: meta.starred || false,
        pinned: meta.pinned || false,
        
        analytics: meta.analytics || { visitCount: 0, importance: 50 },
        
        favicon: getFaviconUrl(meta.snapshot.url),
        status: 'deleted',
      });
    }
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
 * 收集文件夹下所有书签的 ID
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
 * 设置事件监听器
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
    
    // 刷新数据
    await get().refresh();
  });
  
  // 书签删除事件
  bookmarkService.onBookmarkRemoved(async (chromeId) => {
    console.log('[BookmarkStoreV2] Bookmark removed event:', chromeId);
    
    // 删除元数据
    await metadataService.deleteMetadata(chromeId);
    
    // 刷新数据
    await get().refresh();
  });
  
  // 书签修改事件
  bookmarkService.onBookmarkChanged(async (chromeId, changeInfo) => {
    console.log('[BookmarkStoreV2] Bookmark changed event:', chromeId, changeInfo);
    
    // 刷新数据
    await get().refresh();
  });
  
  // 书签移动事件
  bookmarkService.onBookmarkMoved(async (chromeId, moveInfo) => {
    console.log('[BookmarkStoreV2] Bookmark moved event:', chromeId, moveInfo);
    
    // 刷新数据
    await get().refresh();
  });
}

// ============ 导出 ============

export type { BookmarkStateV2 };
