/**
 * Search Worker 客户端
 * 主线程与Worker通信的封装
 */

import type { IBookmark } from '../types/bookmark';
import type { SearchWorkerMessage, SearchWorkerResponse } from '../workers/searchWorker';

export interface SearchWorkerClient {
  initialize(bookmarks: IBookmark[]): Promise<void>;
  search(query: string, filters?: any): Promise<any[]>;
  updateBookmark(bookmarkId: string, updates: Partial<IBookmark>): Promise<void>;
  updateBookmarks(bookmarks: IBookmark[]): Promise<void>;
  getSuggestions(input: string, limit?: number): Promise<string[]>;
  getStats(): Promise<{ bookmarkCount: number; initialized: boolean }>;
  terminate(): void;
}

export class WebWorkerSearchClient implements SearchWorkerClient {
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (error: any) => void }
  >();
  private isInitialized = false;

  constructor() {
    this.initWorker();
  }

  /**
   * 初始化Worker
   */
  private initWorker(): void {
    try {
      // 创建Worker实例
      this.worker = new Worker(
        new URL('../workers/searchWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // 监听Worker消息
      this.worker.onmessage = (e: MessageEvent<SearchWorkerResponse>) => {
        const { id, result, success, error } = e.data;

        const pending = this.pendingRequests.get(id);
        if (pending) {
          if (success) {
            pending.resolve(result);
          } else {
            pending.reject(new Error(error || 'Worker error'));
          }
          this.pendingRequests.delete(id);
        }
      };

      // 监听Worker错误
      this.worker.onerror = (error) => {
        console.error('[SearchWorkerClient] Worker error:', error);
        // 拒绝所有待处理的请求
        for (const [id, pending] of this.pendingRequests.entries()) {
          pending.reject(new Error('Worker crashed'));
          this.pendingRequests.delete(id);
        }
      };

      console.log('[SearchWorkerClient] Worker initialized');
    } catch (error) {
      console.error('[SearchWorkerClient] Failed to create worker:', error);
      this.worker = null;
    }
  }

  /**
   * 发送消息到Worker
   */
  private sendMessage<T = any>(
    type: SearchWorkerMessage['type'],
    payload?: any
  ): Promise<T> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not initialized'));
    }

    const id = `msg_${this.messageId++}`;

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.worker!.postMessage({ id, type, payload });

      // 设置超时(10秒)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Worker request timeout'));
        }
      }, 10000);
    });
  }

  /**
   * 初始化搜索引擎
   */
  async initialize(bookmarks: IBookmark[]): Promise<void> {
    await this.sendMessage('INIT', { bookmarks });
    this.isInitialized = true;
    console.log('[SearchWorkerClient] Initialized with', bookmarks.length, 'bookmarks');
  }

  /**
   * 执行搜索
   */
  async search(query: string, filters?: any): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('Search worker not initialized');
    }

    return this.sendMessage('SEARCH', { query, filters });
  }

  /**
   * 更新单个书签
   */
  async updateBookmark(bookmarkId: string, updates: Partial<IBookmark>): Promise<void> {
    await this.sendMessage('UPDATE_BOOKMARK', { bookmarkId, updates });
  }

  /**
   * 批量更新书签
   */
  async updateBookmarks(bookmarks: IBookmark[]): Promise<void> {
    await this.sendMessage('UPDATE_BOOKMARKS', { bookmarks });
    this.isInitialized = true;
  }

  /**
   * 获取搜索建议
   */
  async getSuggestions(input: string, limit: number = 5): Promise<string[]> {
    if (!this.isInitialized) {
      return [];
    }

    return this.sendMessage('GET_SUGGESTIONS', { input, limit });
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{ bookmarkCount: number; initialized: boolean }> {
    return this.sendMessage('GET_STATS');
  }

  /**
   * 终止Worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.pendingRequests.clear();
      console.log('[SearchWorkerClient] Worker terminated');
    }
  }
}

/**
 * 降级搜索客户端（当Worker不可用时）
 * 使用主线程Fuse.js实现
 */
export class FallbackSearchClient implements SearchWorkerClient {
  private fuse: any = null;
  private bookmarks: IBookmark[] = [];

  async initialize(bookmarks: IBookmark[]): Promise<void> {
    this.bookmarks = bookmarks;
    
    // 动态导入Fuse.js
    const Fuse = (await import('fuse.js')).default;
    
    this.fuse = new Fuse(bookmarks, {
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
      includeScore: true,
      includeMatches: true,
    });

    console.log('[FallbackSearchClient] Initialized (main thread)');
  }

  async search(query: string, filters?: any): Promise<any[]> {
    if (!this.fuse || !query || query.trim().length < 2) {
      return [];
    }

    let results = this.fuse.search(query);

    // 应用过滤器
    if (filters) {
      results = results.filter((result: any) => {
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

        return true;
      });
    }

    return results;
  }

  async updateBookmark(bookmarkId: string, updates: Partial<IBookmark>): Promise<void> {
    const index = this.bookmarks.findIndex(b => b.id === bookmarkId);
    if (index !== -1) {
      this.bookmarks[index] = { ...this.bookmarks[index], ...updates };
      await this.initialize(this.bookmarks);
    }
  }

  async updateBookmarks(bookmarks: IBookmark[]): Promise<void> {
    await this.initialize(bookmarks);
  }

  async getSuggestions(input: string, limit: number = 5): Promise<string[]> {
    const suggestions = new Set<string>();

    for (const bookmark of this.bookmarks) {
      const titleWords = bookmark.title.toLowerCase().split(/\s+/);
      titleWords.forEach(word => {
        if (word.includes(input.toLowerCase()) && word.length > 2) {
          suggestions.add(word);
        }
      });

      const tags = [...bookmark.userTags, ...bookmark.aiTags];
      tags.forEach(tag => {
        if (tag.toLowerCase().includes(input.toLowerCase())) {
          suggestions.add(tag);
        }
      });

      if (suggestions.size >= limit) break;
    }

    return Array.from(suggestions).slice(0, limit);
  }

  async getStats(): Promise<{ bookmarkCount: number; initialized: boolean }> {
    return {
      bookmarkCount: this.bookmarks.length,
      initialized: !!this.fuse,
    };
  }

  terminate(): void {
    this.fuse = null;
    this.bookmarks = [];
  }
}

// 导出单例工厂
let clientInstance: SearchWorkerClient | null = null;

export async function getSearchClient(): Promise<SearchWorkerClient> {
  if (clientInstance) {
    return clientInstance;
  }

  // 尝试使用Worker
  try {
    const workerClient = new WebWorkerSearchClient();
    clientInstance = workerClient;
    console.log('[SearchClient] Using Web Worker');
    return workerClient;
  } catch (error) {
    console.warn('[SearchClient] Worker not available, using fallback:', error);
    const fallbackClient = new FallbackSearchClient();
    clientInstance = fallbackClient;
    return fallbackClient;
  }
}

export function terminateSearchClient(): void {
  if (clientInstance) {
    clientInstance.terminate();
    clientInstance = null;
  }
}
