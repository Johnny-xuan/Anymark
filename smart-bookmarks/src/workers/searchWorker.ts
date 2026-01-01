/**
 * Web Worker - 后台搜索线程
 * 将搜索逻辑移至Worker，避免阻塞主线程UI
 */

import Fuse from 'fuse.js';

// Worker上下文中的全局状态
let fuseInstance: Fuse<any> | null = null;
let bookmarksData: any[] = [];

// 搜索配置
const SEARCH_CONFIG = {
  keys: [
    { name: 'title', weight: 0.35 },
    { name: 'userTitle', weight: 0.30 },
    { name: 'userTags', weight: 0.15 },
    { name: 'userNotes', weight: 0.10 },
    { name: 'aiSummary', weight: 0.20 },
    { name: 'aiTags', weight: 0.10 },
    { name: 'aiCategory', weight: 0.08 },
    { name: 'folderPath', weight: 0.12 },
    { name: 'url', weight: 0.05 },
  ],
  threshold: 0.3,
  distance: 100,
  minMatchCharLength: 2,
  ignoreLocation: true,
  useExtendedSearch: true,
  includeScore: true,
  includeMatches: true,
};

/**
 * 初始化搜索引擎
 */
function initializeSearch(bookmarks: any[]): void {
  bookmarksData = bookmarks;
  fuseInstance = new Fuse(bookmarks, SEARCH_CONFIG);
  console.log('[SearchWorker] Initialized with', bookmarks.length, 'bookmarks');
}

/**
 * 执行搜索
 */
function performSearch(query: string, filters?: any): any[] {
  if (!fuseInstance || !query || query.trim().length < 2) {
    return [];
  }

  const startTime = performance.now();
  let results = fuseInstance.search(query);

  // 应用额外过滤器
  if (filters) {
    results = results.filter(result => {
      const item = result.item;

      if (filters.category && item.aiCategory !== filters.category) {
        return false;
      }

      if (filters.starred !== undefined && item.starred !== filters.starred) {
        return false;
      }

      if (filters.folderId && item.folderId !== filters.folderId) {
        return false;
      }

      if (filters.tags && filters.tags.length > 0) {
        const itemTags = [...item.aiTags, ...item.userTags];
        if (!filters.tags.some((tag: string) => itemTags.includes(tag))) {
          return false;
        }
      }

      return true;
    });
  }

  const searchTime = performance.now() - startTime;

  console.log(
    `[SearchWorker] Search completed in ${searchTime.toFixed(2)}ms, found ${results.length} results`
  );

  return results.map(result => ({
    item: result.item,
    score: result.score || 0,
    matches: result.matches || [],
  }));
}

/**
 * 更新单个书签
 */
function updateBookmark(bookmarkId: string, updates: any): void {
  const index = bookmarksData.findIndex(b => b.id === bookmarkId);
  if (index !== -1) {
    bookmarksData[index] = { ...bookmarksData[index], ...updates };

    // 重新初始化Fuse实例
    if (fuseInstance) {
      fuseInstance = new Fuse(bookmarksData, SEARCH_CONFIG);
    }
  }
}

/**
 * 批量更新书签数据
 */
function updateBookmarks(bookmarks: any[]): void {
  bookmarksData = bookmarks;
  if (fuseInstance) {
    fuseInstance = new Fuse(bookmarks, SEARCH_CONFIG);
  }
}

/**
 * 获取搜索建议
 */
function getSuggestions(input: string, limit: number = 5): string[] {
  if (!input || input.length < 1) {
    return [];
  }

  const suggestions = new Set<string>();

  for (const bookmark of bookmarksData) {
    // 从标题提取
    const titleWords = bookmark.title.toLowerCase().split(/\s+/);
    titleWords.forEach((word: string) => {
      if (word.includes(input.toLowerCase()) && word.length > 2) {
        suggestions.add(word);
      }
    });

    // 从标签提取
    const tags = [...(bookmark.userTags || []), ...(bookmark.aiTags || [])];
    tags.forEach((tag: string) => {
      if (tag.toLowerCase().includes(input.toLowerCase())) {
        suggestions.add(tag);
      }
    });

    if (suggestions.size >= limit) break;
  }

  return Array.from(suggestions).slice(0, limit);
}

// Worker消息处理
self.onmessage = function (e: MessageEvent) {
  const { type, payload, id } = e.data;

  try {
    let result: any;

    switch (type) {
      case 'INIT':
        initializeSearch(payload.bookmarks);
        result = { success: true, count: payload.bookmarks.length };
        break;

      case 'SEARCH':
        result = performSearch(payload.query, payload.filters);
        break;

      case 'UPDATE_BOOKMARK':
        updateBookmark(payload.bookmarkId, payload.updates);
        result = { success: true };
        break;

      case 'UPDATE_BOOKMARKS':
        updateBookmarks(payload.bookmarks);
        result = { success: true, count: payload.bookmarks.length };
        break;

      case 'GET_SUGGESTIONS':
        result = getSuggestions(payload.input, payload.limit);
        break;

      case 'GET_STATS':
        result = {
          bookmarkCount: bookmarksData.length,
          initialized: !!fuseInstance,
        };
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, type, result, success: true });
  } catch (error) {
    self.postMessage({
      id,
      type,
      error: (error as Error).message,
      success: false,
    });
  }
};

// 导出类型定义(仅用于TypeScript)
export type SearchWorkerMessage =
  | { type: 'INIT'; payload: { bookmarks: any[] } }
  | { type: 'SEARCH'; payload: { query: string; filters?: any } }
  | { type: 'UPDATE_BOOKMARK'; payload: { bookmarkId: string; updates: any } }
  | { type: 'UPDATE_BOOKMARKS'; payload: { bookmarks: any[] } }
  | { type: 'GET_SUGGESTIONS'; payload: { input: string; limit?: number } }
  | { type: 'GET_STATS'; payload?: never };

export type SearchWorkerResponse = {
  id: string;
  type: string;
  result: any;
  success: boolean;
  error?: string;
};
