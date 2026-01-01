/**
 * 书签管理的全局状态Store
 * 使用 Zustand 进行状态管理
 */

import { getSearchEngine as getSemanticSearchEngine } from '../../utils/semanticSearchV2';
import { getChromeSyncService, type FolderSyncAction } from '../../utils/chromeSyncCompat';
import { getBookmarkService } from '../../services/bookmarkService';
import { getOperationHistoryService } from '../../utils/operationHistory';
import { create } from 'zustand';
import type {
  IBookmark,
  IFolder,
  FilterType,
  SortType,
  ViewMode,
  IUserSettings,
} from '../../types/bookmark';

interface BookmarkState {
  // 数据
  bookmarks: IBookmark[];
  folders: IFolder[];
  folderOrder: Record<string, string[]>; // 文件夹排序：parentPath -> [folderId1, folderId2, ...]

  // UI状态
  selectedIndex: number;
  selectedBookmark: IBookmark | null;
  selectedIds: Set<string>; // 多选状态
  lastSelectedId: string | null; // 用于 Shift 范围选择
  currentFilter: FilterType;
  currentSort: SortType;
  viewMode: ViewMode;
  searchQuery: string;
  previewPanelVisible: boolean;
  theme: 'light' | 'dark'; // 添加主题状态

  // 当前目录
  currentFolderId: string | null;
  expandedFolderIds: Set<string>;

  // 高级过滤器（已移除 category，统一架构）
  activeFilters: {
    tag?: string;
    folderId?: string;
    starred?: boolean;
  };

  // 加载状态
  isLoading: boolean;
  error: string | null;

  // 用户设置
  settings: IUserSettings;

  // Actions
  setBookmarks: (bookmarks: IBookmark[]) => void;
  addBookmark: (bookmark: IBookmark) => Promise<void>;
  updateBookmark: (id: string, updates: Partial<IBookmark>) => Promise<void>;
  deleteBookmark: (id: string) => void;
  restoreBookmark: (id: string) => void;
  restoreFolder: (folderPath: string) => void; // 恢复文件夹及其所有书签
  permanentlyDeleteBookmark: (id: string) => Promise<void>;
  reorderBookmarks: (startIndex: number, endIndex: number) => void;
  reorderFolders: (draggedFolderId: string, targetFolderId: string) => void;
  moveBookmarkToFolder: (bookmarkId: string, folderId: string) => Promise<void>;
  moveFolderToFolder: (folderId: string, targetFolderId: string) => Promise<void>;

  setFolders: (folders: IFolder[]) => void;
  addFolder: (folder: IFolder) => void;
  updateFolder: (id: string, updates: Partial<IFolder>) => void;
  deleteFolder: (id: string) => Promise<void>;

  setSelectedIndex: (index: number) => void;
  setSelectedBookmark: (bookmark: IBookmark | null) => void;
  navigateUp: () => void;
  navigateDown: () => void;

  setCurrentFilter: (filter: FilterType) => void;
  setCurrentSort: (sort: SortType) => void;
  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  togglePreviewPanel: () => void;
  toggleTheme: () => void; // 添加主题切换

  setCurrentFolder: (folderId: string | null) => void;
  toggleFolderExpanded: (folderId: string) => void;
  expandFolder: (folderId: string) => void;
  collapseFolder: (folderId: string) => void;

  // 多选操作
  toggleSelectItem: (id: string) => void;
  selectRange: (endId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  deleteSelectedBookmarks: () => void;
  starSelectedBookmarks: (starred: boolean) => void;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  updateSettings: (updates: Partial<IUserSettings>) => Promise<void>;
  loadSettings: () => Promise<void>;
  forceSyncSettings: () => Promise<void>;

  // 搜索和过滤（已移除 category，统一架构）
  setFilters: (filters: {
    tag?: string;
    folderId?: string;
    starred?: boolean;
  }) => void;
  clearFilters: () => void;

  // Computed
  getFilteredBookmarks: () => (IBookmark | IFolder)[];
  getCurrentFolderBookmarks: () => IBookmark[];
  getFirstBookmarkIndex: () => number; // 获取搜索结果的第一个书签索引
  // 已移除 getBookmarksGroupedByCategory（统一架构，不再使用 AI 虚拟分类）
}


// 默认设置
const defaultSettings: IUserSettings = {
  syncEnabled: false, // 默认不与Chrome同步，用户可以在设置中开启
  chromeSyncEnabled: false, // Chrome 双向同步开关（默认关闭）
  autoAnalyze: true,
  theme: 'dark',
  viewMode: 'list',
  previewPanelVisible: true,
  previewPanelWidth: 40,
  pixelBuddyTheme: 'classic',
  openMode: 'sidebar', // 默认使用侧边栏
  softDelete: true,
  autoArchiveDays: 90,
  autoDeleteDays: 180,
  indexedDBEnabled: false, // 默认禁用IndexedDB，用户可以在设置中开启
};

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  // 初始状态
  bookmarks: [],
  folders: [],
  folderOrder: {}, // 文件夹排序

  selectedIndex: 0,
  selectedBookmark: null,
  selectedIds: new Set(),
  lastSelectedId: null,
  currentFilter: 'chrome',
  currentSort: 'date',
  viewMode: 'list',
  searchQuery: '',
  previewPanelVisible: true,
  theme: 'dark', // 默认主题

  currentFolderId: null,
  expandedFolderIds: new Set(),

  activeFilters: {},

  isLoading: false,
  error: null,

  settings: defaultSettings,

  // Actions实现
  setBookmarks: (bookmarks) => set({ bookmarks }),

  addBookmark: async (bookmark) => {
    const state = get();

    // Optimistic UI update
    set((state) => ({
      bookmarks: [...state.bookmarks, bookmark],
    }));

    // 记录操作历史（支持撤销）
    try {
      const historyService = getOperationHistoryService();
      await historyService.record({
        type: 'create',
        targetType: 'bookmark',
        targetId: bookmark.id,
        newState: {
          folderPath: bookmark.folderPath,
          folderId: bookmark.folderId,
          title: bookmark.title,
        },
      });
    } catch (error) {
      console.error('[Store] Failed to record addBookmark operation:', error);
    }

    // 同步保存到 Chrome Storage
    try {
      await chrome.storage.local.set({ bookmarks: [...state.bookmarks, bookmark] });
    } catch (error) {
      console.error('[Store] Failed to persist new bookmark:', error);
    }

    // Sync with Chrome (只有开启同步时才执行)
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    if (syncService.isEnabled()) {
      console.log('[Store] addBookmark - sync enabled, syncing to Chrome Native:', bookmark.title);
      try {
        // 尝试查找目标文件夹的 Chrome ID
        const targetFolder = state.folders.find(f => f.id === bookmark.folderId);
        const targetChromeId = targetFolder?.chromeId;

        // 使用原子性回调机制，确保 chromeId 更新在同一操作中完成
        await syncService.ensureChromeId(
          bookmark,
          targetChromeId,
          true, // shouldCreate: true，创建新书签到 Chrome Native
          async (chromeId) => {
            // 在回调中立即更新本地书签的 chromeId
            get().updateBookmark(bookmark.id, { chromeId });
          }
        );
      } catch (error) {
        console.error('[Sync] Failed to add bookmark to Chrome:', error);
        get().setError('Failed to sync new bookmark with Chrome.');
      }
    } else {
      console.log('[Store] addBookmark - sync disabled, skipping Chrome sync');
    }
  },

  updateBookmark: async (id, updates) => {
    const state = get();
    const bookmarkToUpdate = state.bookmarks.find((b) => b.id === id);

    if (!bookmarkToUpdate) return;

    // 如果是重命名操作，记录操作历史（支持撤销）
    if (updates.title && updates.title !== bookmarkToUpdate.title) {
      try {
        const historyService = getOperationHistoryService();
        await historyService.record({
          type: 'rename',
          targetType: 'bookmark',
          targetId: id,
          previousState: {
            title: bookmarkToUpdate.title,
          },
        });
      } catch (error) {
        console.error('[Store] Failed to record updateBookmark operation:', error);
      }
    }

    const updatedBookmark: IBookmark = { ...bookmarkToUpdate, ...updates };

    set((state) => {
      const newState: Partial<BookmarkState> = {
        bookmarks: state.bookmarks.map((b) =>
          b.id === id ? updatedBookmark : b
        ),
      };

      // 如果更新的是当前选中的书签，同步更新 selectedBookmark
      if (state.selectedBookmark && state.selectedBookmark.id === id) {
        newState.selectedBookmark = updatedBookmark;
      }

      return newState;
    });

    // 获取最新的书签列表进行保存
    const finalBookmarks = get().bookmarks;
    chrome.storage.local.set({ bookmarks: finalBookmarks }).catch(err => {
      console.error('[Store] Failed to sync updateBookmark to Chrome Storage:', err);
    });

    // Sync with Chrome (只有开启同步时才执行)
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    if (syncService.isEnabled()) {
      console.log('[Store] updateBookmark - sync enabled, syncing to Chrome Native:', updatedBookmark.title);
      try {
        // 确保书签有 chromeId
        const chromeId = await syncService.ensureChromeId(updatedBookmark, undefined, false);

        if (chromeId) {
          // 如果是新创建的 chromeId，更新书签
          if (chromeId !== updatedBookmark.chromeId) {
            // 更新本地书签的 chromeId
            set((state) => ({
              bookmarks: state.bookmarks.map((b) =>
                b.id === id ? { ...b, chromeId } : b
              ),
            }));
          }

          // 同步更新到 Chrome Native
          // Strict Mode for Update
          await syncService.ensureChromeId({ ...updatedBookmark, chromeId }, undefined, false);
          await syncService.syncBookmarkToChrome({ ...updatedBookmark, chromeId }, 'update');
        }
      } catch (error) {
        console.error('[Sync] Failed to update bookmark in Chrome:', error);
        get().setError('Failed to sync updated bookmark with Chrome.');
      }
    } else {
      console.log('[Store] updateBookmark - sync disabled, skipping Chrome sync');
    }
  },

  deleteBookmark: (id) => {
    const state = get();
    const bookmarkToDelete = state.bookmarks.find(b => b.id === id);

    // 记录操作历史（支持撤销）
    if (bookmarkToDelete) {
      const historyService = getOperationHistoryService();
      historyService.record({
        type: 'delete',
        targetType: 'bookmark',
        targetId: id,
        previousState: {
          folderPath: bookmarkToDelete.folderPath,
          folderId: bookmarkToDelete.folderId,
          title: bookmarkToDelete.title,
          url: bookmarkToDelete.url,
          chromeId: bookmarkToDelete.chromeId,
          bookmarkData: { ...bookmarkToDelete },
        },
      }).catch(error => {
        console.error('[Store] Failed to record deleteBookmark operation:', error);
      });
    }

    const updatedBookmarks = state.bookmarks.map((b) =>
      b.id === id
        ? { ...b, status: 'deleted' as const, updateTime: Date.now() }
        : b
    );

    // 更新 store
    set({ bookmarks: updatedBookmarks });

    // 同步到 Chrome Storage
    chrome.storage.local.set({ bookmarks: updatedBookmarks }).catch(err => {
      console.error('[Store] Failed to sync deleteBookmark to Chrome Storage:', err);
    });

    // 如果开启了 Chrome 双向同步，同步删除到 Chrome Native
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    const syncEnabled = syncService.isEnabled();
    console.log('[Store] deleteBookmark - syncService.isEnabled():', syncEnabled, 'chromeId:', bookmarkToDelete?.chromeId);
    if (syncEnabled && bookmarkToDelete && bookmarkToDelete.chromeId) {
      console.log('[Store] deleteBookmark - sync enabled, deleting from Chrome Native:', bookmarkToDelete.title);
      syncService.syncBookmarkToChrome(bookmarkToDelete, 'delete')
        .then(() => {
          console.log('[Store] Bookmark deleted from Chrome Native:', bookmarkToDelete.chromeId);
        })
        .catch(err => {
          console.error('[Store] Failed to delete bookmark from Chrome Native:', err);
        });
    } else {
      console.log('[Store] deleteBookmark - sync disabled or no chromeId, skipping Chrome sync');
    }
  },

  restoreBookmark: (id) => {
    const state = get();
    const bookmarkToRestore = state.bookmarks.find(b => b.id === id);

    // 记录操作历史（恢复操作也可以撤销）
    if (bookmarkToRestore) {
      const historyService = getOperationHistoryService();
      historyService.record({
        type: 'create', // 恢复相当于重新创建
        targetType: 'bookmark',
        targetId: id,
        newState: {
          folderPath: bookmarkToRestore.folderPath,
          folderId: bookmarkToRestore.folderId,
          title: bookmarkToRestore.title,
        },
      }).catch(error => {
        console.error('[Store] Failed to record restoreBookmark operation:', error);
      });
    }

    const updatedBookmarks = state.bookmarks.map((b) =>
      b.id === id
        ? { ...b, status: 'active' as const, updateTime: Date.now() }
        : b
    );

    // 更新 store
    set({ bookmarks: updatedBookmarks });

    // 同步到 Chrome Storage
    chrome.storage.local.set({ bookmarks: updatedBookmarks }).catch(err => {
      console.error('[Store] Failed to sync restoreBookmark to Chrome Storage:', err);
    });

    // 如果开启了 Chrome 双向同步，在 Chrome Native 中重新创建书签
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    if (syncService.isEnabled() && bookmarkToRestore) {
      console.log('[Store] restoreBookmark - sync enabled, recreating in Chrome Native:', bookmarkToRestore.title);

      // 尝试查找目标文件夹的 Chrome ID
      const targetFolder = state.folders.find(f => f.id === bookmarkToRestore.folderId);
      const targetChromeId = targetFolder?.chromeId;

      // 使用 ensureChromeId 在 Chrome 中创建书签（会返回新的 chromeId）
      syncService.ensureChromeId(bookmarkToRestore, targetChromeId)
        .then((newChromeId) => {
          if (newChromeId) {
            // 更新书签的 chromeId
            set((state) => ({
              bookmarks: state.bookmarks.map((b) =>
                b.id === id ? { ...b, chromeId: newChromeId } : b
              ),
            }));
          }
        })
        .catch((err) => {
          console.error('[Store] Failed to recreate bookmark in Chrome Native:', err);
        });
    } else {
      console.log('[Store] restoreBookmark - sync disabled, skipping Chrome sync');
    }
  },

  restoreFolder: (folderPath) => {
    const state = get();

    // 找出该文件夹路径下所有已删除的书签
    const bookmarksToRestore = state.bookmarks.filter(b => {
      if (b.status !== 'deleted') return false;
      const path = b.folderPath || '/';
      // 匹配当前文件夹或子文件夹下的所有书签
      return path === folderPath || path.startsWith(folderPath + '/');
    });

    if (bookmarksToRestore.length === 0) {
      console.log('[Store] No bookmarks to restore in folder:', folderPath);
      return;
    }

    console.log('[Store] Restoring folder:', folderPath, 'with', bookmarksToRestore.length, 'bookmarks');

    // 记录操作历史（支持撤销）
    const historyService = getOperationHistoryService();
    const folderName = folderPath.split('/').filter(Boolean).pop() || '根目录';

    // 构建批量操作项
    const batchItems = bookmarksToRestore.map(b => ({
      targetId: b.id,
      targetType: 'bookmark' as const,
      previousState: {
        folderPath: b.folderPath,
        folderId: b.folderId,
        title: b.title,
        url: b.url,
        chromeId: b.chromeId,
        bookmarkData: { ...b },
      },
    }));

    historyService.record({
      type: 'create', // 恢复相当于重新创建
      targetType: 'folder',
      targetId: `folder-${folderPath}`,
      batchItems,
      newState: {
        title: folderName,
        folderPath: folderPath,
      },
    }).catch(error => {
      console.error('[Store] Failed to record restoreFolder operation:', error);
    });

    // 恢复所有书签
    const bookmarkIdsToRestore = new Set(bookmarksToRestore.map(b => b.id));
    const updatedBookmarks = state.bookmarks.map((b) =>
      bookmarkIdsToRestore.has(b.id)
        ? { ...b, status: 'active' as const, updateTime: Date.now() }
        : b
    );

    // 更新 store
    set({ bookmarks: updatedBookmarks });

    // 同步到 Chrome Storage
    chrome.storage.local.set({ bookmarks: updatedBookmarks }).catch(err => {
      console.error('[Store] Failed to sync restoreFolder to Chrome Storage:', err);
    });

    // 如果开启了 Chrome 双向同步，在 Chrome Native 中重新创建所有书签
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    if (syncService.isEnabled()) {
      console.log('[Store] restoreFolder - sync enabled, recreating', bookmarksToRestore.length, 'bookmarks in Chrome Native');

      // 异步批量重新创建书签
      (async () => {
        for (const bookmark of bookmarksToRestore) {
          try {
            // 尝试查找目标文件夹的 Chrome ID
            const targetFolder = state.folders.find(f => f.id === bookmark.folderId);
            const targetChromeId = targetFolder?.chromeId;

            // 使用 ensureChromeId 在 Chrome 中创建书签
            const newChromeId = await syncService.ensureChromeId(bookmark, targetChromeId);
            if (newChromeId) {
              // 更新书签的 chromeId
              set((state) => ({
                bookmarks: state.bookmarks.map((b) =>
                  b.id === bookmark.id ? { ...b, chromeId: newChromeId } : b
                ),
              }));
              console.log('[Store] Bookmark recreated in Chrome Native:', bookmark.title, 'chromeId:', newChromeId);
            }
          } catch (err) {
            console.error('[Store] Failed to recreate bookmark in Chrome Native:', bookmark.title, err);
          }
        }

        // 批量更新完成后，同步到 Chrome Storage
        const finalBookmarks = get().bookmarks;
        chrome.storage.local.set({ bookmarks: finalBookmarks }).catch(err => {
          console.error('[Store] Failed to sync restored bookmarks to Chrome Storage:', err);
        });
      })();
    } else {
      console.log('[Store] restoreFolder - sync disabled, skipping Chrome sync');
    }
  },

  permanentlyDeleteBookmark: async (id) => {
    const state = get();
    const bookmarkToDelete = state.bookmarks.find((b) => b.id === id);

    // Sync with Chrome (只有开启同步时才执行)
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    if (syncService.isEnabled() && bookmarkToDelete && bookmarkToDelete.chromeId) {
      console.log('[Store] permanentlyDeleteBookmark - sync enabled, deleting from Chrome Native:', bookmarkToDelete.title);
      try {
        await syncService.syncBookmarkToChrome(bookmarkToDelete, 'delete');
      } catch (error) {
        console.error('[Sync] Failed to delete bookmark from Chrome:', error);
        get().setError('Failed to sync deleted bookmark with Chrome.');
        // Do not proceed with local deletion if sync fails
        return;
      }
    } else {
      console.log('[Store] permanentlyDeleteBookmark - sync disabled or no chromeId, skipping Chrome sync');
    }

    const updatedBookmarks = state.bookmarks.filter((b) => b.id !== id);

    // 更新 store
    set({ bookmarks: updatedBookmarks });

    // 同步到 Chrome Storage
    chrome.storage.local.set({ bookmarks: updatedBookmarks }).catch(err => {
      console.error('[Store] Failed to sync permanentlyDeleteBookmark to Chrome Storage:', err);
    });
  },

  reorderBookmarks: (startIndex, endIndex) =>
    set((state) => {
      console.log('[Store] reorderBookmarks called:', startIndex, '->', endIndex);

      // Get the filtered bookmarks that the user sees
      const filteredItems = get().getFilteredBookmarks();
      const draggedItem = filteredItems[startIndex];
      const targetItem = filteredItems[endIndex];

      // 验证拖拽项和目标项存在
      if (!draggedItem || !targetItem) {
        console.log('[Store] Invalid items:', { draggedItem, targetItem });
        return state;
      }

      const isDraggedFolder = 'bookmarkCount' in draggedItem;
      const isTargetFolder = 'bookmarkCount' in targetItem;

      console.log('[Store] Item types:', { isDraggedFolder, isTargetFolder });

      // 如果是文件夹之间的排序，使用 reorderFolders
      if (isDraggedFolder && isTargetFolder) {
        // 调用 reorderFolders 处理文件夹排序
        console.log('[Store] Delegating to reorderFolders');
        setTimeout(() => {
          get().reorderFolders(draggedItem.id, targetItem.id);
        }, 0);
        return state;
      }

      // 文件夹和书签之间不能排序
      if (isDraggedFolder !== isTargetFolder) {
        console.log('[Store] Cannot reorder between folder and bookmark');
        return state;
      }

      const draggedBookmark = draggedItem as IBookmark;
      const targetBookmark = targetItem as IBookmark;

      // 检查是否在同一文件夹内（同级排序）
      // 统一架构：只使用 folderPath，不再区分 AI 分类视图

      // 规范化路径：确保空值、undefined、空字符串都统一为 '/'
      const normalizePath = (path: string | undefined | null): string => {
        if (!path || path.trim() === '') return '/';
        return path;
      };

      const draggedPath = normalizePath(draggedBookmark.folderPath);
      const targetPath = normalizePath(targetBookmark.folderPath);

      console.log('[Store] Path comparison:', {
        draggedBookmark: draggedBookmark.title,
        targetBookmark: targetBookmark.title,
        draggedFolderPath: draggedBookmark.folderPath,
        targetFolderPath: targetBookmark.folderPath,
        draggedPath,
        targetPath,
        pathsMatch: draggedPath === targetPath
      });

      // 只允许同级排序
      if (draggedPath !== targetPath) {
        console.log('[Store] Cross-folder reordering not allowed, use moveBookmarkToFolder instead');
        return state;
      }

      // Make a copy of all bookmarks
      const allBookmarks = [...state.bookmarks];

      // Find the actual indices in the full bookmarks array
      const actualDraggedIndex = allBookmarks.findIndex(b => b.id === draggedBookmark.id);
      const actualTargetIndex = allBookmarks.findIndex(b => b.id === targetBookmark.id);

      if (actualDraggedIndex === -1 || actualTargetIndex === -1) {
        return state;
      }

      // Remove the dragged bookmark from its original position
      const [removed] = allBookmarks.splice(actualDraggedIndex, 1);

      // Find the new insertion index (which may have shifted after removal)
      const newTargetIndex = allBookmarks.findIndex(b => b.id === targetBookmark.id);

      // Insert after the target if moving down, before if moving up
      const insertIndex = startIndex < endIndex ? newTargetIndex + 1 : newTargetIndex;
      allBookmarks.splice(insertIndex, 0, removed);

      console.log('[Store] Reordered bookmark:', draggedBookmark.title, 'from', actualDraggedIndex, 'to', insertIndex);

      // 同步到 Chrome Storage
      setTimeout(() => {
        chrome.storage.local.set({ bookmarks: allBookmarks }).catch(err => {
          console.error('[Store] Failed to sync reorder to Chrome Storage:', err);
        });
      }, 0);

      // 拖拽排序后，自动切换到手动排序模式，保持用户的排序
      return { bookmarks: allBookmarks, currentSort: 'manual' as const };
    }),

  reorderFolders: (draggedFolderId, targetFolderId) =>
    set((state) => {
      // 解析文件夹路径（统一架构：只使用 folder- 前缀）
      const prefix = 'folder-';

      const draggedPath = draggedFolderId.substring(prefix.length);
      const targetPath = targetFolderId.substring(prefix.length);

      // 获取父路径（用于确定同级）
      const getParentPath = (path: string): string => {
        const parts = path.split('/').filter(Boolean);
        if (parts.length <= 1) return '/'; // 一级文件夹的父路径是根
        return '/' + parts.slice(0, -1).join('/');
      };

      const draggedParent = getParentPath(draggedPath);
      const targetParent = getParentPath(targetPath);

      // 只允许同级排序
      if (draggedParent !== targetParent) {
        console.log('[Store] Cross-level folder reordering not allowed');
        return state;
      }

      // 获取当前的文件夹排序
      const orderKey = `${prefix}${draggedParent}`;
      const currentOrder = state.folderOrder[orderKey] || [];

      // 如果没有现有排序，需要先收集同级文件夹
      let folderIds: string[];
      if (currentOrder.length === 0) {
        // 从书签中收集同级文件夹（统一架构：只使用 folderPath）
        const siblingPaths = new Set<string>();

        state.bookmarks.forEach(bookmark => {
          const path = bookmark.folderPath || '/';

          if (path === '/') return;

          // 找到直接子文件夹
          const parts = path.split('/').filter(Boolean);
          const parentParts = draggedParent === '/' ? 0 : draggedParent.split('/').filter(Boolean).length;

          if (parts.length > parentParts) {
            const childPath = '/' + parts.slice(0, parentParts + 1).join('/');
            if (getParentPath(childPath) === draggedParent) {
              siblingPaths.add(childPath);
            }
          }
        });

        // 按字母顺序排序作为初始顺序
        folderIds = Array.from(siblingPaths)
          .sort((a, b) => a.localeCompare(b))
          .map(p => `${prefix}${p}`);
      } else {
        folderIds = [...currentOrder];
      }

      // 确保拖拽和目标文件夹都在列表中
      if (!folderIds.includes(draggedFolderId)) {
        folderIds.push(draggedFolderId);
      }
      if (!folderIds.includes(targetFolderId)) {
        folderIds.push(targetFolderId);
      }

      // 执行排序
      const draggedIndex = folderIds.indexOf(draggedFolderId);
      const targetIndex = folderIds.indexOf(targetFolderId);

      if (draggedIndex === -1 || targetIndex === -1) {
        console.log('[Store] Folder not found in order list');
        return state;
      }

      // 移除拖拽项
      folderIds.splice(draggedIndex, 1);
      // 插入到目标位置
      folderIds.splice(targetIndex, 0, draggedFolderId);

      console.log('[Store] Reordered folder:', draggedFolderId, 'to position', targetIndex);
      console.log('[Store] New folder order:', folderIds);

      // 更新文件夹排序
      const newFolderOrder = {
        ...state.folderOrder,
        [orderKey]: folderIds,
      };

      // 同步到 Chrome Storage
      setTimeout(() => {
        chrome.storage.local.set({ folderOrder: newFolderOrder }).catch(err => {
          console.error('[Store] Failed to sync folder order to Chrome Storage:', err);
        });
      }, 0);

      // 文件夹拖拽排序后，自动切换到手动排序模式，保持用户的排序
      return { folderOrder: newFolderOrder, currentSort: 'manual' as const };
    }),

  moveBookmarkToFolder: async (bookmarkId, folderId) => {
    const state = get();

    // 统一架构：只使用 folder- 前缀，不再支持 AI 文件夹
    // 获取文件夹路径
    const folderPath = folderId.startsWith('folder-')
      ? folderId.substring(7) // 移除 'folder-' 前缀
      : folderId;

    const bookmarkToMove = state.bookmarks.find(b => b.id === bookmarkId);

    // 记录操作历史（支持撤销）
    if (bookmarkToMove) {
      const historyService = getOperationHistoryService();
      historyService.record({
        type: 'move',
        targetType: 'bookmark',
        targetId: bookmarkId,
        previousState: {
          folderPath: bookmarkToMove.folderPath,
          folderId: bookmarkToMove.folderId,
          title: bookmarkToMove.title,
        },
      }).catch(error => {
        console.error('[Store] Failed to record moveBookmarkToFolder operation:', error);
      });
    }

    const updatedBookmarks = state.bookmarks.map((b) => {
      if (b.id !== bookmarkId) return b;

      // 统一更新 folderPath 和 folderId
      return {
        ...b,
        folderId,
        folderPath,
        updateTime: Date.now()
      };
    });

    // 更新 store
    set({ bookmarks: updatedBookmarks });

    // 同步到 Chrome Storage
    chrome.storage.local.set({ bookmarks: updatedBookmarks }).catch(err => {
      console.error('[Store] Failed to sync moveBookmarkToFolder to Chrome Storage:', err);
    });

    // 如果开启了 Chrome 双向同步，同步到 Chrome Native
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    if (syncService.isEnabled() && bookmarkToMove) {
      console.log('[Store] moveBookmarkToFolder - sync enabled, syncing move operation:', bookmarkToMove.title);

      // 尝试查找目标文件夹的 Chrome ID
      const targetFolder = state.folders.find(f => f.id === folderId);
      const targetChromeId = targetFolder?.chromeId;
      console.log('[Store] Target folder:', folderId, 'chromeId:', targetChromeId);

      // 获取更新后的书签（包含新的 folderPath）
      const updatedBookmark = updatedBookmarks.find(b => b.id === bookmarkId);
      if (updatedBookmark) {
        console.log('[Store] Moving bookmark:', updatedBookmark.title, 'to:', folderPath);

        // 确保书签有 chromeId (Strict Mode for Move)
        // 传入 targetChromeId，这样如果需要查找，会尽量在正确的位置 (although finding happens in OLD location usually)
        // ensureChromeId uses folderPath to find. 
        const chromeId = await syncService.ensureChromeId(updatedBookmark, targetChromeId, false);
        console.log('[Store] ensureChromeId result:', chromeId, 'original:', bookmarkToMove.chromeId);

        if (chromeId) {
          // 更新本地 chromeId（如果是新创建的）
          if (chromeId !== bookmarkToMove.chromeId) {
            set((state) => ({
              bookmarks: state.bookmarks.map((b) =>
                b.id === bookmarkId ? { ...b, chromeId } : b
              ),
            }));
          }

          // 强制执行移动操作，确保层级正确
          // 即使 ensureChromeId 刚刚创建了书签，再次调用 move 也是安全的（Chrome 会忽略无效移动）
          // 这样可以解决 "AnyMark 路径正确但 Chrome 实际位置不对" 的问题
          console.log('[Store] Executing move in Chrome Native...');
          syncService.syncBookmarkToChrome(
            { ...updatedBookmark, chromeId },
            'move',
            { targetParentId: targetChromeId }
          ).then(() => {
            console.log('[Store] Bookmark moved in Chrome Native:', chromeId);
          }).catch(err => {
            console.error('[Store] Failed to move bookmark in Chrome Native:', err);
          });
        } else {
          console.warn('[Store] ensureChromeId returned null, sync skipped');
        }
      }
    } else {
      console.log('[Store] moveBookmarkToFolder - sync disabled or bookmark not found, skipping sync');
    }
  },

  moveFolderToFolder: async (folderId, targetFolderId) => {
    const state = get();

    // 统一架构：只使用 folder- 前缀
    const prefix = 'folder-';
    const prefixLength = prefix.length;

    // 从 folder.id 中提取 path
    const folderPath = folderId.startsWith(prefix) ? folderId.substring(prefixLength) : folderId;
    const targetPath = targetFolderId.startsWith(prefix) ? targetFolderId.substring(prefixLength) : targetFolderId;

    // 提取文件夹名称（路径的最后一部分）
    const folderName = folderPath.split('/').filter(Boolean).pop() || '';

    // 计算新的path
    const newPath = targetPath === '/' ? `/${folderName}` : `${targetPath}/${folderName}`;

    console.log('[Store] Moving folder:', folderPath, '→', newPath);

    // 记录操作历史（支持撤销）
    const historyService = getOperationHistoryService();
    historyService.record({
      type: 'move',
      targetType: 'folder',
      targetId: folderId,
      previousState: {
        path: folderPath,
        title: folderName,
      },
    }).catch(error => {
      console.error('[Store] Failed to record moveFolderToFolder operation:', error);
    });

    // 1. 更新书签的路径字段
    const updatedBookmarks = state.bookmarks.map(b => {
      const bookmarkPath = b.folderPath || '/';

      // 如果书签在当前文件夹
      if (bookmarkPath === folderPath) {
        return { ...b, folderPath: newPath, folderId: `folder-${newPath}`, updateTime: Date.now() };
      }

      // 如果书签在子文件夹
      if (bookmarkPath.startsWith(folderPath + '/')) {
        const relativePath = bookmarkPath.substring(folderPath.length);
        const newBookmarkPath = newPath + relativePath;
        return { ...b, folderPath: newBookmarkPath, folderId: `folder-${newBookmarkPath}`, updateTime: Date.now() };
      }

      return b;
    });

    // 2. 更新文件夹结构（递归更新所有子文件夹）
    const updatedFolders = state.folders.map(f => {
      // 更新被移动的文件夹自身
      if (f.id === folderId) {
        return {
          ...f,
          path: newPath,
          id: `folder-${newPath}`,
          parentId: targetFolderId,
          updateTime: Date.now()
        };
      }

      // 更新子文件夹
      if (f.path.startsWith(folderPath + '/')) {
        const relativePath = f.path.substring(folderPath.length);
        const newFolderPath = newPath + relativePath;

        // 重新计算 parentId：
        // 1. 如果子文件夹的直接父就是被移动的文件夹，parentId 应该指向新路径
        // 2. 否则，需要基于新路径重新计算 parentId
        let newParentId: string | undefined;

        if (f.parentId === folderId) {
          // 直接子文件夹，父 ID 指向移动后的新路径
          newParentId = `folder-${newPath}`;
        } else if (f.parentId && f.parentId.startsWith(folderId)) {
          // 嵌套子文件夹，需要替换前缀
          // 提取相对部分并附加到新路径
          const relativeParentPath = f.parentId.substring(folderId.length);
          newParentId = `folder-${newPath}${relativeParentPath}`;
        } else {
          // parentId 不在被移动的文件夹树下，保持不变
          newParentId = f.parentId;
        }

        return {
          ...f,
          path: newFolderPath,
          id: `folder-${newFolderPath}`,
          parentId: newParentId,
          updateTime: Date.now()
        };
      }

      return f;
    });

    console.log('[Store] Total bookmarks moved:', updatedBookmarks.length - state.bookmarks.length + (state.bookmarks.length - updatedBookmarks.filter(b => b.folderPath === folderPath).length));

    // 更新 store
    set({
      bookmarks: updatedBookmarks,
      folders: updatedFolders
    });

    // 同步到 Chrome Storage
    Promise.all([
      chrome.storage.local.set({ bookmarks: updatedBookmarks }),
      chrome.storage.local.set({ folders: updatedFolders })
    ]).catch(err => {
      console.error('[Store] Failed to sync moveFolderToFolder to Chrome Storage:', err);
    });

    // 如果开启了 Chrome 双向同步，同步到 Chrome Native
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    if (syncService.isEnabled()) {
      console.log('[Store] moveFolderToFolder - sync enabled, syncing to Chrome Native');
      const sourceFolder = state.folders.find(f => f.id === folderId);

      // 尝试查找目标文件夹的 Chrome ID
      const targetFolder = state.folders.find(f => f.id === targetFolderId);
      let targetChromeId = targetFolder?.chromeId;

      // 修复：如果目标文件夹存在，确保其 chromeId 有效，允许创建
      // 这是关键修复：之前 shouldCreate=false 导致目标文件夹没有 chromeId 时无法移动
      if (targetFolder) {
        const validatedTargetId = await syncService.ensureFolderChromeId(
          targetFolder, 
          undefined, 
          true  // 修复：允许创建目标文件夹
        );
        if (validatedTargetId) {
          targetChromeId = validatedTargetId;
          // 如果 ID 变了，更新 store
          if (targetChromeId !== targetFolder.chromeId) {
            get().updateFolder(targetFolderId, { chromeId: targetChromeId });
          }
        }
      } else if (targetFolderId === 'folder-/' || targetPath === '/') {
        // 移动到根目录，使用 "Other Bookmarks" (ID: "2")
        targetChromeId = '2';
      }

      // 如果目标 chromeId 仍然为空，记录警告
      if (!targetChromeId) {
        console.warn('[Store] Target folder chromeId is undefined, move may fail');
      }

      if (sourceFolder) {
        // 修复：确保源文件夹有 chromeId，允许创建（如果在 Chrome 中不存在）
        const sourceChromeId = await syncService.ensureFolderChromeId(
          sourceFolder, 
          undefined, 
          true  // 修复：允许创建源文件夹
        );

        if (sourceChromeId) {
          // 如果是新创建的 chromeId，更新文件夹
          if (sourceChromeId !== sourceFolder.chromeId) {
            get().updateFolder(folderId, { chromeId: sourceChromeId });
          }

          // 执行移动操作
          const movedFolderForSync = {
            ...sourceFolder,
            chromeId: sourceChromeId,
            parentId: targetFolderId,
            path: newPath
          };

          // 修复：使用 await 确保移动操作完成，并添加更详细的日志
          try {
            await syncService.syncFolderToChrome(movedFolderForSync, 'move', { targetParentId: targetChromeId });
            console.log('[Store] Folder moved in Chrome Native:', sourceChromeId, '→ parent:', targetChromeId);
          } catch (err) {
            console.error('[Store] Failed to move folder in Chrome Native:', err);
          }
        } else {
          // Fallback: 源文件夹在 Chrome 中不存在时的处理
          console.warn('[Store] Source folder not found in Chrome during move. Using fallback sync.');

          // 1. 同步书签到新位置
          const movedBookmarks = updatedBookmarks.filter(b => {
            const path = b.folderPath;
            return path === newPath || (path && path.startsWith(newPath + '/'));
          });

          for (const bookmark of movedBookmarks) {
            let chromeId = await syncService.ensureChromeId(bookmark, undefined, false);

            if (!chromeId) {
              // 书签在 Chrome 中不存在，跳过
              console.warn('[Store] Bookmark not found in Chrome during folder move:', bookmark.title);
              continue;
            }

            syncService.syncBookmarkToChrome({ ...bookmark, chromeId }, 'move')
              .catch(e => console.error('[Store] Failed to move bookmark:', e));
          }

          // 2. 同步子文件夹（新增）
          const movedSubfolders = updatedFolders.filter(f => {
            // 找出被移动文件夹的所有子文件夹
            return f.path.startsWith(newPath + '/') || f.path === newPath;
          });

          for (const subfolder of movedSubfolders) {
            // 如果是主文件夹，使用目标父 ID
            let folderTargetParentId = targetChromeId;
            // 如果是子文件夹，需要递归找到其父文件夹的 Chrome ID
            if (subfolder.path !== newPath) {
              // 获取父路径
              const parentPath = subfolder.path.substring(0, subfolder.path.lastIndexOf('/'));
              const parentFolder = updatedFolders.find(f => f.path === parentPath);
              if (parentFolder && parentFolder.chromeId) {
                folderTargetParentId = parentFolder.chromeId;
              }
            }

            // 尝试同步子文件夹
            if (subfolder.chromeId) {
              // 已有 chromeId，尝试移动
              syncService.syncFolderToChrome(
                { ...subfolder, parentId: targetFolderId },
                'move',
                { targetParentId: folderTargetParentId }
              ).catch(e => console.error('[Store] Failed to move subfolder:', e));
            } else {
              // 没有 chromeId，尝试创建
              const newChromeId = await syncService.ensureFolderChromeId(
                { ...subfolder, parentId: targetFolderId },
                folderTargetParentId,
                true
              );
              if (newChromeId) {
                get().updateFolder(subfolder.id, { chromeId: newChromeId });
              }
            }
          }

          console.log('[Store] Fallback sync completed:', movedBookmarks.length, 'bookmarks,', movedSubfolders.length, 'subfolders');
        }
      }
    }
  },

  setFolders: (folders) => set({ folders }),

  addFolder: async (folder) => {
    // Optimistic UI update
    const updatedFolders = [...get().folders, folder];
    set(() => ({
      folders: updatedFolders,
    }));

    // 持久化到 Chrome Storage
    chrome.storage.local.set({ folders: updatedFolders }).catch(err => {
      console.error('[Store] Failed to sync addFolder to Chrome Storage:', err);
    });

    // 记录操作历史（支持撤销）
    try {
      const historyService = getOperationHistoryService();
      historyService.record({
        type: 'create',
        targetType: 'folder',
        targetId: folder.id,
        newState: {
          title: folder.title,
          folderPath: folder.path,
        },
      }).catch(error => {
        console.error('[Store] Failed to record addFolder operation:', error);
      });
    } catch (error) {
      console.error('[Store] Failed to record addFolder operation:', error);
    }

    // 如果开启了 Chrome 双向同步，使用原子性回调机制同步到 Chrome Native
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    if (syncService.isEnabled()) {
      console.log('[Store] addFolder - sync enabled, creating folder in Chrome Native:', folder.title);
      try {
        // 使用原子性回调机制，确保 chromeId 更新在同一操作中完成
        await syncService.ensureFolderChromeId(
          folder,
          undefined, // targetParentId
          true, // shouldCreate: 创建新文件夹
          async (chromeId) => {
            // 在回调中立即更新本地文件夹的 chromeId
            get().updateFolder(folder.id, { chromeId });
          }
        );
      } catch (error) {
        console.error('[Store] Failed to create folder in Chrome Native:', error);
      }
    } else {
      console.log('[Store] addFolder - sync disabled, skipping Chrome sync');
    }
  },

  updateFolder: async (id, updates) => {
    const state = get();
    const folderToUpdate = state.folders.find(f => f.id === id);

    // 如果是重命名操作，记录操作历史（支持撤销）
    if (folderToUpdate && updates.title && updates.title !== folderToUpdate.title) {
      try {
        const historyService = getOperationHistoryService();
        historyService.record({
          type: 'rename',
          targetType: 'folder',
          targetId: id,
          previousState: {
            title: folderToUpdate.title,
            path: folderToUpdate.path,
          },
        }).catch(error => {
          console.error('[Store] Failed to record updateFolder operation:', error);
        });
      } catch (error) {
        console.error('[Store] Failed to record updateFolder operation:', error);
      }
    }

    // 更新本地状态
    const updatedFolders = state.folders.map((f) =>
      f.id === id ? { ...f, ...updates } : f
    );
    set(() => ({
      folders: updatedFolders,
    }));

    // 持久化到 Chrome Storage
    chrome.storage.local.set({ folders: updatedFolders }).catch(err => {
      console.error('[Store] Failed to sync updateFolder to Chrome Storage:', err);
    });

    // 如果开启了 Chrome 双向同步，根据更新类型同步到 Chrome Native
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    if (syncService.isEnabled() && folderToUpdate) {
      // 检测更新类型
      const isRename = updates.title && updates.title !== folderToUpdate.title;
      const isParentChange = updates.parentId && updates.parentId !== folderToUpdate.parentId;

      // 只有重命名或移动操作需要同步到 Chrome Native
      // chromeId 等其他属性更新不需要同步（是从 Chrome 获取的）
      if (isRename || isParentChange) {
        console.log('[Store] updateFolder - sync enabled, syncing to Chrome Native');
        try {
          const updatedFolder = { ...folderToUpdate, ...updates };

          // 确定同步动作类型
          const syncAction: FolderSyncAction = isRename ? 'rename' : 'move';

          console.log('[Store] Chrome sync enabled, syncing folder to Chrome Native:', syncAction, updatedFolder.title);

          if (syncAction === 'rename') {
            // 重命名操作
            await syncService.ensureFolderChromeId(
              updatedFolder,
              undefined, // targetParentId
              false, // shouldCreate: false，不自动创建
              async (chromeId) => {
                // 在回调中立即更新本地文件夹的 chromeId
                if (chromeId !== updatedFolder.chromeId) {
                  get().updateFolder(id, { chromeId });
                }
                // 同步重命名到 Chrome Native
                await syncService.syncFolderToChrome({ ...updatedFolder, chromeId }, 'rename');
              }
            );
          } else if (syncAction === 'move' && updatedFolder.chromeId) {
            // 移动操作（需要 chromeId）
            // 获取新父文件夹的 Chrome ID
            let targetChromeId = undefined;
            if (updates.parentId) {
              // 如果 parentId 变化，需要找到新父文件夹的 chromeId
              const newParentFolder = updatedFolders.find(f => f.id === updates.parentId);
              if (newParentFolder && newParentFolder.chromeId) {
                targetChromeId = newParentFolder.chromeId;
              } else {
                // 尝试在 Chrome 中创建或查找父文件夹
                const parentPath = updates.parentId.replace(/^folder-/, '');
                targetChromeId = await syncService.ensureFolderChromeId(
                  { id: updates.parentId, path: parentPath, title: parentPath.split('/').pop() || '',
                    bookmarkCount: 0, subfolderCount: 0, createTime: Date.now(), updateTime: Date.now(), order: 0 },
                  undefined,
                  true
                );
              }
            }

            if (targetChromeId) {
              await syncService.syncFolderToChrome(
                { ...updatedFolder, chromeId: updatedFolder.chromeId },
                'move',
                { targetParentId: targetChromeId }
              );
            }
          }
        } catch (error) {
          console.error('[Store] Failed to sync folder to Chrome Native:', error);
        }
      }
    }
  },

  deleteFolder: async (id) => {
    const state = get();

    // 统一架构：只使用 folder- 前缀
    const prefix = 'folder-';

    // 从 folder.id 中提取 path
    const folderPath = id.substring(prefix.length);
    const folderName = folderPath.split('/').filter(Boolean).pop() || '';

    console.log('[Store] Deleting folder:', id, 'path:', folderPath);

    // 找出文件夹内所有要删除的书签（用于撤销时恢复）
    const bookmarksInFolder = state.bookmarks.filter((b) => {
      const bookmarkPath = b.folderPath || '/';
      return bookmarkPath === folderPath || bookmarkPath.startsWith(folderPath + '/');
    });

    // 记录操作历史（支持撤销）
    // 关键：使用 batchItems 记录文件夹内的所有书签，撤销时一起恢复
    const historyService = getOperationHistoryService();

    // 构建批量操作项（包含文件夹内所有书签）
    const batchItems = bookmarksInFolder.map(b => ({
      targetId: b.id,
      targetType: 'bookmark' as const,
      previousState: {
        folderPath: b.folderPath,
        folderId: b.folderId,
        title: b.title,
        url: b.url,
        chromeId: b.chromeId,
        bookmarkData: { ...b },
      },
    }));

    historyService.record({
      type: 'delete',
      targetType: 'folder',
      targetId: id,
      previousState: {
        path: folderPath,
        title: folderName,
        folderData: {
          id,
          title: folderName,
          path: folderPath,
        },
      },
      // 关键：记录文件夹内的书签，撤销时一起恢复
      batchItems: batchItems.length > 0 ? batchItems : undefined,
    }).catch(error => {
      console.error('[Store] Failed to record deleteFolder operation:', error);
    });

    // 删除文件夹下的所有书签（移到回收站）
    const updatedBookmarks = state.bookmarks.map((b) => {
      const bookmarkPath = b.folderPath || '/';

      // 匹配当前文件夹或子文件夹下的所有书签
      const shouldUpdate = bookmarkPath === folderPath || bookmarkPath.startsWith(folderPath + '/');

      if (shouldUpdate) {
        console.log('[Store] Updating bookmark:', b.title, 'from path:', bookmarkPath);
        // 移到回收站
        return { ...b, status: 'deleted' as const, updateTime: Date.now() };
      }
      return b;
    });

    console.log('[Store] Total bookmarks deleted:', bookmarksInFolder.length);

    // 在删除文件夹之前，先保存要删除的文件夹引用（用于 Chrome Native 同步）
    // 需要保存主文件夹和所有子文件夹
    const foldersToDelete = state.folders.filter(f => {
      const currentFolderPath = f.id.startsWith('folder-') ? f.id.substring(7) : f.id;
      return currentFolderPath === folderPath || currentFolderPath.startsWith(folderPath + '/');
    });

    // 同时从 folders 数组中删除文件夹（包括被删除文件夹的所有子文件夹）
    const updatedFolders = state.folders.filter(f => {
      const currentFolderPath = f.id.startsWith('folder-') ? f.id.substring(7) : f.id;
      // 删除当前文件夹及其所有子文件夹
      // 保留不匹配的文件夹（删除匹配的）
      return currentFolderPath !== folderPath && !currentFolderPath.startsWith(folderPath + '/');
    });

    console.log('[Store] Total folders deleted:', foldersToDelete.length);

    // 更新 store（同时更新 bookmarks 和 folders）
    set({
      bookmarks: updatedBookmarks,
      folders: updatedFolders
    });

    // 同步到 Chrome Storage（同时保存 bookmarks 和 folders）
    chrome.storage.local.set({
      bookmarks: updatedBookmarks,
      folders: updatedFolders
    }).catch(err => {
      console.error('[Store] Failed to sync deleteFolder to Chrome Storage:', err);
    });

    // 如果开启了 Chrome 双向同步，同步删除到 Chrome Native
    // 修复：使用 syncService.isEnabled() 作为唯一检查点
    const syncService = getChromeSyncService();
    if (syncService.isEnabled()) {
      console.log('[Store] deleteFolder - sync enabled, syncing delete to Chrome Native');
      // 使用之前保存的 foldersToDelete 引用（不是旧的 state.folders）

      // 从子文件夹到父文件夹的顺序删除（避免父文件夹先删除导致子文件夹找不到）
      const sortedFolders = [...foldersToDelete].sort((a, b) => {
        // 按路径深度排序，深的先删除
        const aDepth = a.path.split('/').filter(Boolean).length;
        const bDepth = b.path.split('/').filter(Boolean).length;
        return bDepth - aDepth;
      });

      for (const folder of sortedFolders) {
        console.log('[Store] deleteFolder - syncing delete folder:', folder.title);

        // 异步执行，不阻塞 UI
        // 修复：删除操作使用 shouldCreate=false，不需要在 Chrome 中创建新文件夹
        // 如果文件夹在 Chrome 中不存在，直接跳过（目标已经不存在了）
        syncService.ensureFolderChromeId(folder, undefined, false).then(chromeId => {
          if (chromeId) {
            return syncService.syncFolderToChrome({ ...folder, chromeId }, 'delete');
          } else {
            // 文件夹在 Chrome 中不存在，无需删除，静默跳过
            console.log('[Store] Folder not found in Chrome, skipping delete:', folder.title);
          }
        }).catch(error => {
          console.error('[Store] Failed to sync delete folder to Chrome:', error);
        });
      }
    } else {
      console.log('[Store] deleteFolder - sync disabled, skipping Chrome sync');
    }

    // 软删除会同步删除 Chrome Native 中的内容
    // 这样可以保持 AnyMark 和 Chrome Native 的一致性
    // 用户可以从 AnyMark 的回收站恢复书签，恢复时会重新创建到 Chrome Native
  },

  setSelectedIndex: (index) => {
    const filteredBookmarks = get().getFilteredBookmarks();

    // 如果列表为空，不做任何操作
    if (filteredBookmarks.length === 0) {
      set({
        selectedIndex: -1,
        selectedBookmark: null,
      });
      return;
    }

    const maxIndex = filteredBookmarks.length - 1;
    const clampedIndex = Math.max(0, Math.min(index, maxIndex));

    // 只有当选中的是书签时，才设置 selectedBookmark
    const selectedItem = filteredBookmarks[clampedIndex];
    const isBookmark = selectedItem && !('bookmarkCount' in selectedItem);

    set({
      selectedIndex: clampedIndex,
      selectedBookmark: isBookmark ? selectedItem as IBookmark : null,
    });
  },

  setSelectedBookmark: (bookmark) =>
    set({ selectedBookmark: bookmark }),

  navigateUp: () => {
    const { selectedIndex } = get();
    get().setSelectedIndex(Math.max(0, selectedIndex - 1));
  },

  navigateDown: () => {
    const { selectedIndex } = get();
    const filteredBookmarks = get().getFilteredBookmarks();
    get().setSelectedIndex(
      Math.min(filteredBookmarks.length - 1, selectedIndex + 1)
    );
  },

  setCurrentFilter: (filter) => set({ currentFilter: filter }),

  setCurrentSort: (sort) => set({ currentSort: sort }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    // 搜索查询变化时，重置选中索引
    // 注意：不要在这里直接设置 selectedIndex，因为搜索结果可能为空
    // 让 BookmarkList 组件在渲染时处理选中逻辑
    if (!query.trim()) {
      // 清空搜索时，重置选中索引
      set({ selectedIndex: 0 });
    }
    // 有搜索内容时，不自动设置 selectedIndex
    // 让 setSelectedIndex 在有结果时处理
  },

  // 高级过滤器
  setFilters: (filters) =>
    set((state) => {
      const newFilters = { ...state.activeFilters, ...filters };
      // 清除空值
      Object.keys(newFilters).forEach((key) => {
        if (newFilters[key] === undefined || newFilters[key] === '') {
          delete newFilters[key];
        }
      });

      // 如果有活跃过滤器，重置选中索引
      const hasFilters = Object.keys(newFilters).length > 0;

      return {
        activeFilters: newFilters,
        selectedIndex: hasFilters ? 0 : state.selectedIndex,
      };
    }),

  clearFilters: () => set({ activeFilters: {}, selectedIndex: 0 }),

  togglePreviewPanel: () =>
    set((state) => ({
      previewPanelVisible: !state.previewPanelVisible,
    })),

  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      // 更新 DOM
      document.documentElement.setAttribute('data-theme', newTheme);
      // 保存到 localStorage
      try {
        localStorage.setItem('theme', newTheme);
      } catch (e) {
        console.warn('[Store] Failed to save theme:', e);
      }
      return { theme: newTheme };
    }),

  setCurrentFolder: (folderId) => set({ currentFolderId: folderId }),

  toggleFolderExpanded: (folderId) =>
    set((state) => {
      const newSet = new Set(state.expandedFolderIds);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return { expandedFolderIds: newSet };
    }),

  expandFolder: (folderId) =>
    set((state) => ({
      expandedFolderIds: new Set(state.expandedFolderIds).add(folderId),
    })),

  collapseFolder: (folderId) =>
    set((state) => {
      const newSet = new Set(state.expandedFolderIds);
      newSet.delete(folderId);
      return { expandedFolderIds: newSet };
    }),

  // 多选操作
  toggleSelectItem: (id) =>
    set((state) => {
      const newSet = new Set(state.selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedIds: newSet, lastSelectedId: id };
    }),

  selectRange: (endId) =>
    set((state) => {
      const filteredItems = get().getFilteredBookmarks();
      const startId = state.lastSelectedId;

      if (!startId) {
        // 没有起始点，只选择当前项
        return { selectedIds: new Set([endId]), lastSelectedId: endId };
      }

      const startIndex = filteredItems.findIndex(item => item.id === startId);
      const endIndex = filteredItems.findIndex(item => item.id === endId);

      if (startIndex === -1 || endIndex === -1) {
        return { selectedIds: new Set([endId]), lastSelectedId: endId };
      }

      const minIndex = Math.min(startIndex, endIndex);
      const maxIndex = Math.max(startIndex, endIndex);

      const newSet = new Set(state.selectedIds);
      for (let i = minIndex; i <= maxIndex; i++) {
        const item = filteredItems[i];
        // 只选择书签，不选择文件夹
        if (!('bookmarkCount' in item)) {
          newSet.add(item.id);
        }
      }

      return { selectedIds: newSet };
    }),

  selectAll: () =>
    set((state) => {
      const filteredItems = get().getFilteredBookmarks();
      const newSet = new Set<string>();
      filteredItems.forEach(item => {
        // 只选择书签，不选择文件夹
        if (!('bookmarkCount' in item)) {
          newSet.add(item.id);
        }
      });
      return { selectedIds: newSet };
    }),

  clearSelection: () => set({ selectedIds: new Set(), lastSelectedId: null }),

  deleteSelectedBookmarks: () => {
    const state = get();
    if (state.selectedIds.size === 0) return;

    // 收集要删除的书签数据（用于批量撤销）
    const bookmarksToDelete = state.bookmarks.filter(b => state.selectedIds.has(b.id));

    // 记录批量操作历史（支持一次性撤销）
    if (bookmarksToDelete.length > 0) {
      const historyService = getOperationHistoryService();
      const batchItems = bookmarksToDelete.map(b => ({
        targetId: b.id,
        targetType: 'bookmark' as const,
        previousState: {
          folderPath: b.folderPath,
          folderId: b.folderId,
          title: b.title,
          url: b.url,
          chromeId: b.chromeId,
          bookmarkData: { ...b },
        },
      }));

      historyService.record({
        type: 'delete',
        targetType: 'bookmark',
        targetId: 'batch', // 批量操作使用 'batch' 作为标识
        batchItems,
        previousState: {
          title: `${bookmarksToDelete.length} 个书签`,
        },
      }).catch(error => {
        console.error('[Store] Failed to record batch delete operation:', error);
      });
    }

    const updatedBookmarks = state.bookmarks.map((b) =>
      state.selectedIds.has(b.id)
        ? { ...b, status: 'deleted' as const, updateTime: Date.now() }
        : b
    );

    set({ bookmarks: updatedBookmarks, selectedIds: new Set(), lastSelectedId: null });

    chrome.storage.local.set({ bookmarks: updatedBookmarks }).catch(err => {
      console.error('[Store] Failed to sync batch delete to Chrome Storage:', err);
    });
  },

  starSelectedBookmarks: (starred) => {
    const state = get();
    if (state.selectedIds.size === 0) return;

    const updatedBookmarks = state.bookmarks.map((b) =>
      state.selectedIds.has(b.id)
        ? { ...b, starred, updateTime: Date.now() }
        : b
    );

    set({ bookmarks: updatedBookmarks });

    chrome.storage.local.set({ bookmarks: updatedBookmarks }).catch(err => {
      console.error('[Store] Failed to sync batch star to Chrome Storage:', err);
    });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  updateSettings: async (updates) => {
    const state = get();
    const newSettings = { ...state.settings, ...updates };

    // 如果 chromeSyncEnabled 改变了，先等待 ChromeSyncService 完成切换
    // 修复：使用 await 确保状态同步完成后再继续
    if (updates.chromeSyncEnabled !== undefined && updates.chromeSyncEnabled !== state.settings.chromeSyncEnabled) {
      const syncService = getChromeSyncService();
      const oldEnabled = syncService.isEnabled();
      console.log('[Store] Toggling ChromeSyncService:', { from: oldEnabled, to: updates.chromeSyncEnabled });
      
      try {
        await syncService.toggleSync(updates.chromeSyncEnabled);
        console.log('[Store] ChromeSyncService toggled successfully:', {
          requested: updates.chromeSyncEnabled,
          actual: syncService.isEnabled()
        });
      } catch (err) {
        console.error('[Store] Failed to toggle ChromeSyncService:', err);
        // 回滚设置：如果 toggleSync 失败，不更新 chromeSyncEnabled
        const rolledBackSettings = { ...newSettings, chromeSyncEnabled: state.settings.chromeSyncEnabled };
        set({ settings: rolledBackSettings });
        // 保存回滚后的设置到 Chrome Storage
        chrome.storage.local.set({ userSettings: rolledBackSettings }).catch(storageErr => {
          console.error('[Store] Failed to save rolled back settings:', storageErr);
        });
        // 抛出错误让调用者知道失败了
        throw err;
      }
    }

    // 保存到 Chrome Storage，触发 Content Script 更新
    chrome.storage.local.set({ userSettings: newSettings }).catch(err => {
      console.error('[Store] Failed to sync settings:', err);
    });

    // 同步 viewMode 到顶层状态
    const result: Partial<typeof state> = { settings: newSettings };
    if (updates.viewMode !== undefined) {
      result.viewMode = updates.viewMode;
    }

    set(result);
  },

  loadSettings: async () => {
    try {
      const result = await chrome.storage.local.get(['userSettings', 'folderOrder']);
      if (result.userSettings) {
        const userSettings = result.userSettings as Partial<IUserSettings>;
        set((state) => ({
          settings: { ...state.settings, ...userSettings },
          // 同步 viewMode 到顶层状态
          viewMode: userSettings.viewMode || state.viewMode,
        }));

        // 修复：移除这里的 toggleSync 调用
        // 同步服务的初始化完全由 Sidebar.tsx 中的 initialize() 负责
        // 避免竞态条件和重复同步
        if (userSettings.chromeSyncEnabled !== undefined) {
          const syncService = getChromeSyncService();
          console.log('[Store] Chrome sync enabled in settings, syncService.isEnabled():', syncService.isEnabled());
        }
      }
      // 加载文件夹排序
      if (result.folderOrder) {
        set({ folderOrder: result.folderOrder as Record<string, string[]> });
      }
    } catch (error) {
      console.error('[Store] Failed to load settings:', error);
    }
  },

  forceSyncSettings: async () => {
    const { settings } = get();
    // 强制重写存储，确保触发所有页面的 onChanged 事件
    await chrome.storage.local.set({ userSettings: settings });
    console.log('[Store] Settings force synced to all tabs');
  },

  // Computed functions
  getFilteredBookmarks: () => {
    const { bookmarks, currentFilter, currentSort, searchQuery, expandedFolderIds, folderOrder } = get();
    let filtered = [...bookmarks];

    // 搜索逻辑：关键词搜索 + 语义搜索
    if (searchQuery && searchQuery.trim().length >= 1) {
      const queryLower = searchQuery.toLowerCase().trim();

      // 1. 关键词搜索 - 精确匹配（标题、URL、标签、AI摘要）
      // 已移除 aiCategory 搜索（统一架构）
      const keywordResults = bookmarks.filter(b =>
        b.title.toLowerCase().includes(queryLower) ||
        b.url.toLowerCase().includes(queryLower) ||
        b.userTags?.some(t => t.toLowerCase().includes(queryLower)) ||
        b.aiTags?.some(t => t.toLowerCase().includes(queryLower)) ||
        (b.aiSummary && b.aiSummary.toLowerCase().includes(queryLower))
      );

      // 2. 语义搜索 - 模糊匹配，同义词扩展
      let semanticResults: typeof bookmarks = [];
      try {
        const searchEngine = getSemanticSearchEngine(bookmarks);
        const searchResults = searchEngine.search(searchQuery);
        semanticResults = searchResults.map(r => r.item).filter(Boolean);
      } catch (error) {
        console.error('[Store] Semantic search error:', error);
      }

      // 3. 合并结果，关键词匹配优先
      const combinedIds = new Set<string>();
      const finalResults: IBookmark[] = [];

      // 先添加关键词匹配的结果
      for (const b of keywordResults) {
        if (!combinedIds.has(b.id)) {
          combinedIds.add(b.id);
          finalResults.push(b);
        }
      }

      // 再添加语义搜索的结果（去重）
      for (const b of semanticResults) {
        if (!combinedIds.has(b.id)) {
          combinedIds.add(b.id);
          finalResults.push(b);
        }
      }

      filtered = finalResults;
    }

    // 首先，除了 trash 过滤器，其他过滤器都要排除已删除的书签
    if (currentFilter !== 'trash') {
      filtered = filtered.filter((b) => b.status !== 'deleted');
    }

    // 过滤
    switch (currentFilter) {
      case 'chrome':
        // Chrome书签：显示与Chrome同步的书签（有chromeId的）
        filtered = filtered.filter((b) => b.chromeId && b.chromeId.trim() !== '');
        break;
      case 'trash':
        // 回收站：只显示已删除的书签，并按文件夹分组
        filtered = filtered.filter((b) => b.status === 'deleted');

        // 如果回收站有书签，构建虚拟文件夹结构
        if (filtered.length > 0) {
          // 收集所有被删除书签的文件夹路径
          const deletedFolderPaths = new Map<string, number>();
          filtered.forEach(b => {
            const path = b.folderPath || '/';
            if (path !== '/') {
              // 只统计一级文件夹（直接包含书签的文件夹）
              deletedFolderPaths.set(path, (deletedFolderPaths.get(path) || 0) + 1);
            }
          });

          // 创建虚拟文件夹对象（用于在回收站中显示）
          const trashFolders: IFolder[] = [];
          deletedFolderPaths.forEach((count, path) => {
            const folderName = path.split('/').filter(Boolean).pop() || path;
            trashFolders.push({
              id: `trash-folder-${path}`, // 使用特殊前缀标识回收站文件夹
              title: folderName,
              path: path,
              parentId: undefined,
              bookmarkCount: count,
              subfolderCount: 0,
              createTime: Date.now(),
              updateTime: Date.now(),
              order: 0,
              isTrashFolder: true, // 标记为回收站文件夹
            } as IFolder & { isTrashFolder: boolean });
          });

          // 按文件夹名称排序
          trashFolders.sort((a, b) => a.title.localeCompare(b.title));

          // 将虚拟文件夹和书签组合返回
          // 文件夹在前，根目录书签在后
          const rootDeletedBookmarks = filtered.filter(b => (b.folderPath || '/') === '/');
          const trashResult: (IBookmark | IFolder)[] = [...trashFolders];

          // 对于每个文件夹，如果展开了，添加其书签
          // 注意：这里直接使用 expandedFolderIds，因为 effectiveExpandedIds 还未定义
          trashFolders.forEach(folder => {
            const folderId = folder.id;
            if (expandedFolderIds.has(folderId)) {
              const folderBookmarksInTrash = filtered.filter(b => b.folderPath === folder.path);
              trashResult.push(...folderBookmarksInTrash);
            }
          });

          // 添加根目录的书签
          trashResult.push(...rootDeletedBookmarks);

          return trashResult;
        }
        break;
      case 'starred':
        filtered = filtered.filter((b) => b.starred);
        break;
      // 已移除 ai_category case（统一架构，不再使用 AI 虚拟分类视图）
      case 'recent':
        // Recent 过滤器：显示最近的浏览器标签页（而不是最近的书签）
        // 这个逻辑会在 getFilteredBookmarks 返回后被特殊处理
        // 暂时返回空数组，实际数据会在后面添加
        filtered = [];
        break;
      case 'popular':
        // 访问次数最多的前 20 个书签
        filtered = filtered
          .filter((b) => b.analytics.visitCount > 0)
          .sort((a, b) => b.analytics.visitCount - a.analytics.visitCount)
          .slice(0, 20);
        break;
      case 'longtail':
        // 长尾书签 - 超过 30 天未访问的书签（包括从未访问的）
        const thirtyDaysAgoLT = Date.now() - 30 * 24 * 60 * 60 * 1000;
        filtered = filtered
          .filter((b) => {
            // 从未访问过的书签
            if (!b.analytics.lastVisit || b.analytics.lastVisit === 0) {
              return true;
            }
            // 超过 30 天未访问的书签
            return b.analytics.lastVisit < thirtyDaysAgoLT;
          })
          .sort((a, b) => {
            // 从未访问的排最前面（lastVisit 为 0 或 undefined）
            const aVisit = a.analytics.lastVisit || 0;
            const bVisit = b.analytics.lastVisit || 0;
            return aVisit - bVisit;
          });
        break;
      // 保留旧的过滤器以兼容
      case 'frequent':
        filtered = filtered.filter((b) => b.analytics.visitCount > 0);
        break;
      case 'unvisited':
        filtered = filtered.filter((b) => b.analytics.visitCount === 0);
        break;
      case 'important':
        filtered = filtered.filter((b) => b.analytics.importance > 70);
        break;
    }

    // 应用高级过滤器
    const { activeFilters } = get();
    if (Object.keys(activeFilters).length > 0) {
      filtered = filtered.filter((bookmark) => {
        // 根据当前视图限制数据源
        if (currentFilter === 'chrome') {
          // Chrome 视图：只过滤 Chrome 书签
          if (!bookmark.chromeId || bookmark.chromeId.trim() === '') {
            return false;
          }
        }

        // 标签过滤器
        if (activeFilters.tag) {
          const hasTag = bookmark.userTags?.includes(activeFilters.tag) ||
            bookmark.aiTags?.includes(activeFilters.tag);
          if (!hasTag) return false;
        }

        // 文件夹过滤器
        if (activeFilters.folderId) {
          if (bookmark.folderId !== activeFilters.folderId) return false;
        }

        // 星标过滤器
        if (activeFilters.starred !== undefined) {
          if (bookmark.starred !== activeFilters.starred) return false;
        }

        return true;
      });
    }

    // 统一架构：只使用 folder- 前缀
    const folderPrefix = 'folder-';

    // 如果是搜索模式，计算需要展开的文件夹（不在 getter 中修改状态）
    // 搜索时，使用 searchExpandedFolders 作为临时展开状态
    let effectiveExpandedIds = expandedFolderIds;
    if (searchQuery && searchQuery.trim().length >= 1) {
      const pathsWithResults = new Set<string>();
      filtered.forEach(bookmark => {
        // 统一使用 folderPath
        const path = bookmark.folderPath || '/';

        // 根路径的书签不需要展开任何文件夹
        if (path === '/') return;

        // 添加所有父路径（不包括根路径）
        const parts = path.split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
          const currentPath = '/' + parts.slice(0, i).join('/');
          pathsWithResults.add(`${folderPrefix}${currentPath}`);
        }
      });

      // 搜索模式下，自动展开所有包含结果的文件夹（临时，不修改状态）
      effectiveExpandedIds = new Set([...expandedFolderIds, ...pathsWithResults]);
    }

    // 排序 - 搜索模式下保持相关性排序，不进行额外排序
    // manual 模式保持数组原始顺序（用户拖拽排序的结果）
    if (!searchQuery || searchQuery.trim().length < 1) {
      switch (currentSort) {
        case 'title':
          filtered.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'date':
          filtered.sort((a, b) => b.createTime - a.createTime);
          break;
        case 'visits':
          filtered.sort(
            (a, b) => b.analytics.visitCount - a.analytics.visitCount
          );
          break;
        case 'importance':
          filtered.sort(
            (a, b) => b.analytics.importance - a.analytics.importance
          );
          break;
        case 'manual':
          // 保持数组原始顺序，不排序
          break;
      }
    }
    // 搜索模式下使用语义搜索的排序结果（已按相关性从高到低排列）

    // 构建完整的文件夹树（支持多层嵌套）
    const result: (IBookmark | IFolder)[] = [];
    const folderMap = new Map<string, IFolder>();
    const folderBookmarks = new Map<string, IBookmark[]>();
    const rootBookmarks: IBookmark[] = []; // 没有文件夹的书签，直接显示在顶层
    const allPaths = new Set<string>();

    // 1. 收集所有路径和书签（统一使用 folderPath）
    filtered.forEach(bookmark => {
      const path = bookmark.folderPath || '/';

      // 根路径的书签直接放到顶层，不创建文件夹
      if (path === '/') {
        rootBookmarks.push(bookmark);
        return;
      }

      // 添加所有父路径（不包括根路径 '/'）
      const parts = path.split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        const currentPath = '/' + parts.slice(0, i).join('/');
        allPaths.add(currentPath);
      }

      // 添加书签到对应路径
      if (!folderBookmarks.has(path)) {
        folderBookmarks.set(path, []);
      }
      folderBookmarks.get(path)!.push(bookmark);
    });

    // 2. 创建所有文件夹对象（不创建根文件夹）
    allPaths.forEach(path => {
      if (folderMap.has(path)) return;

      const parts = path.split('/').filter(Boolean);
      const folderName = parts[parts.length - 1] || '';
      // 只有二级及以上文件夹才有父路径
      const parentPath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : undefined;

      const folder: IFolder = {
        id: `${folderPrefix}${path}`,
        title: folderName,
        path: path,
        parentId: parentPath ? `${folderPrefix}${parentPath}` : undefined,
        bookmarkCount: folderBookmarks.get(path)?.length || 0,
        subfolderCount: 0,
        createTime: Date.now(),
        updateTime: Date.now(),
        order: 0,
        // 已移除 isAIFolder 字段（统一架构）
      };

      folderMap.set(path, folder);
    });

    // 3. 计算子文件夹数量
    folderMap.forEach((_folder, path) => {
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 1) {
        const parentPath = '/' + parts.slice(0, -1).join('/');
        const parent = folderMap.get(parentPath);
        if (parent) {
          parent.subfolderCount++;
        }
      }
      // 一级文件夹没有父文件夹，不需要计数
    });

    // 4. 递归构建树结构
    const buildTree = (parentPath: string | undefined, level: number): void => {
      // 找到所有直接子文件夹
      let childFolders = Array.from(folderMap.values())
        .filter(folder => {
          if (parentPath === undefined) {
            // 根级别：只显示一级文件夹（没有 parentId 的）
            return !folder.parentId;
          } else {
            return folder.parentId === `${folderPrefix}${parentPath}`;
          }
        });

      // 应用自定义文件夹排序
      const orderKey = `${folderPrefix}${parentPath || '/'}`;
      const customOrder = folderOrder[orderKey];

      if (customOrder && customOrder.length > 0) {
        // 使用自定义排序
        childFolders.sort((a, b) => {
          const aIndex = customOrder.indexOf(a.id);
          const bIndex = customOrder.indexOf(b.id);

          // 如果都在自定义排序中，按自定义顺序
          if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
          }
          // 如果只有一个在自定义排序中，优先显示
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;
          // 都不在自定义排序中，按字母顺序
          return a.title.localeCompare(b.title);
        });
      } else {
        // 默认按字母顺序排序
        childFolders.sort((a, b) => a.title.localeCompare(b.title));
      }

      childFolders.forEach(folder => {
        // 搜索模式下，只显示包含结果的文件夹
        const hasBookmarks = folderBookmarks.has(folder.path) && folderBookmarks.get(folder.path)!.length > 0;
        const hasChildren = Array.from(folderMap.values()).some(f => f.parentId === folder.id);

        if (searchQuery && !hasBookmarks && !hasChildren) {
          return; // 跳过空文件夹
        }

        // 添加文件夹
        result.push(folder);

        // 如果展开，显示内容（使用 effectiveExpandedIds 支持搜索模式）
        if (effectiveExpandedIds.has(folder.id)) {
          // 先显示子文件夹
          buildTree(folder.path, level + 1);

          // 再显示书签
          const bookmarks = folderBookmarks.get(folder.path) || [];
          result.push(...bookmarks);
        }
      });
    };

    // 从根级别开始构建
    buildTree(undefined, 0);

    // 把没有文件夹的书签添加到列表末尾
    result.push(...rootBookmarks);

    return result;
  },

  getCurrentFolderBookmarks: () => {
    const { bookmarks, currentFolderId } = get();
    if (!currentFolderId) {
      return bookmarks;
    }
    return bookmarks.filter((b) => b.folderId === currentFolderId);
  },

  getFirstBookmarkIndex: () => {
    const filteredBookmarks = get().getFilteredBookmarks();
    const firstBookmarkIndex = filteredBookmarks.findIndex(item => !('bookmarkCount' in item));
    return firstBookmarkIndex >= 0 ? firstBookmarkIndex : 0;
  },

  // 已移除 getBookmarksGroupedByCategory（统一架构，不再使用 AI 虚拟分类）
}));

// ============================================================================
// 自动归档和自动删除功能
// ============================================================================

/**
 * 检查并执行自动归档
 * 将超过指定天数未访问的书签标记为归档状态
 */
export async function checkAutoArchive(): Promise<{ archived: number }> {
  try {
    const result = await chrome.storage.local.get(['userSettings', 'bookmarks']);
    const settings = result.userSettings || {};
    const autoArchiveDays = settings.autoArchiveDays || 0;

    // 如果设置为 0，不执行自动归档
    if (autoArchiveDays <= 0) {
      return { archived: 0 };
    }

    const bookmarks: IBookmark[] = (result.bookmarks as IBookmark[]) || [];
    const threshold = Date.now() - autoArchiveDays * 24 * 60 * 60 * 1000;

    let archivedCount = 0;
    const updatedBookmarks = bookmarks.map(b => {
      // 只处理活跃状态的书签
      if (b.status !== 'active') return b;

      // 检查最后访问时间或创建时间
      const lastActivity = b.analytics?.lastVisit || b.createTime;
      if (lastActivity < threshold) {
        archivedCount++;
        return { ...b, status: 'archived' as const, archivedAt: Date.now() };
      }
      return b;
    });

    if (archivedCount > 0) {
      await chrome.storage.local.set({ bookmarks: updatedBookmarks });
      console.log(`[AutoArchive] Archived ${archivedCount} bookmarks`);
    }

    return { archived: archivedCount };
  } catch (error) {
    console.error('[AutoArchive] Failed:', error);
    return { archived: 0 };
  }
}

/**
 * 检查并执行自动删除
 * 永久删除回收站中超过指定天数的书签
 */
export async function checkAutoDelete(): Promise<{ deleted: number }> {
  try {
    const result = await chrome.storage.local.get(['userSettings', 'bookmarks']);
    const settings = result.userSettings || {};
    const autoDeleteDays = settings.autoDeleteDays || 0;

    // 如果设置为 0，不执行自动删除
    if (autoDeleteDays <= 0) {
      return { deleted: 0 };
    }

    const bookmarks: IBookmark[] = (result.bookmarks as IBookmark[]) || [];
    const threshold = Date.now() - autoDeleteDays * 24 * 60 * 60 * 1000;

    // 找出需要永久删除的书签
    const bookmarksToDelete = bookmarks.filter(b => {
      // 只处理已删除状态的书签
      if (b.status !== 'deleted') return false;

      // 检查删除时间
      const deletedAt = (b as any).deletedAt || b.updateTime;
      return deletedAt < threshold;
    });

    const deletedCount = bookmarksToDelete.length;

    if (deletedCount > 0) {
      // 如果开启了 Chrome 同步，同步删除 Chrome Native 书签
      // 修复：使用 syncService.isEnabled() 作为唯一检查点
      const syncService = getChromeSyncService();
      if (syncService.isEnabled()) {
        console.log(`[AutoDelete] Sync enabled, syncing ${deletedCount} deletions to Chrome Native...`);

        // 批量删除 Chrome 书签，单个失败不影响其他
        for (const bookmark of bookmarksToDelete) {
          if (bookmark.chromeId) {
            try {
              await syncService.syncBookmarkToChrome(bookmark, 'delete');
              console.log(`[AutoDelete] Deleted from Chrome: ${bookmark.title}`);
            } catch (error) {
              // 单个删除失败不影响其他，只记录日志
              console.error(`[AutoDelete] Failed to delete from Chrome: ${bookmark.title}`, error);
            }
          }
        }
      } else {
        console.log(`[AutoDelete] Sync disabled, skipping Chrome sync`);
      }

      // 从本地存储中移除
      const remainingBookmarks = bookmarks.filter(b => {
        if (b.status !== 'deleted') return true;
        const deletedAt = (b as any).deletedAt || b.updateTime;
        return deletedAt >= threshold;
      });

      await chrome.storage.local.set({ bookmarks: remainingBookmarks });
      console.log(`[AutoDelete] Permanently deleted ${deletedCount} bookmarks`);
    }

    return { deleted: deletedCount };
  } catch (error) {
    console.error('[AutoDelete] Failed:', error);
    return { deleted: 0 };
  }
}

/**
 * 初始化时执行自动归档和删除检查
 */
export async function runAutoMaintenance(): Promise<void> {
  const archiveResult = await checkAutoArchive();
  const deleteResult = await checkAutoDelete();

  if (archiveResult.archived > 0 || deleteResult.deleted > 0) {
    console.log(`[AutoMaintenance] Archived: ${archiveResult.archived}, Deleted: ${deleteResult.deleted}`);
  }
}
