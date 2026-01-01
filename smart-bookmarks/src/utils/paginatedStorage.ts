/**
 * 分页存储管理器
 * 支持大量书签的分页加载和懒加载
 * 使用IndexedDB提供更好的性能
 */

import type { IBookmark, IFolder } from '../types/bookmark';

export interface StoragePage {
  pageNumber: number;
  bookmarks: IBookmark[];
  loadedAt: number;
}

export interface StorageIndex {
  totalCount: number;
  pageSize: number;
  totalPages: number;
  categories: Map<string, number[]>; // category -> page numbers
  folders: Map<string, number[]>; // folder -> page numbers
  lastUpdated: number;
}

const DB_NAME = 'SmartBookmarksDB';
const DB_VERSION = 1;
const BOOKMARKS_STORE = 'bookmarks';
const INDEX_STORE = 'index';
const PAGE_SIZE = 100; // 每页100个书签

export class PaginatedStorageManager {
  private db: IDBDatabase | null = null;
  private index: StorageIndex | null = null;
  private cache: Map<number, StoragePage> = new Map();
  private maxCachePages = 5; // 最多缓存5页

  /**
   * 初始化IndexedDB
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[PaginatedStorage] Failed to open database');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[PaginatedStorage] Database opened');
        this.loadIndex().then(resolve).catch(reject);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建书签存储
        if (!db.objectStoreNames.contains(BOOKMARKS_STORE)) {
          const bookmarkStore = db.createObjectStore(BOOKMARKS_STORE, {
            keyPath: 'id',
          });
          bookmarkStore.createIndex('pageNumber', 'pageNumber', { unique: false });
          bookmarkStore.createIndex('category', 'aiCategory', { unique: false });
          bookmarkStore.createIndex('folder', 'folderId', { unique: false });
          bookmarkStore.createIndex('starred', 'starred', { unique: false });
        }

        // 创建索引存储
        if (!db.objectStoreNames.contains(INDEX_STORE)) {
          db.createObjectStore(INDEX_STORE, { keyPath: 'id' });
        }

        console.log('[PaginatedStorage] Database upgraded');
      };
    });
  }

  /**
   * 从Chrome Storage迁移数据到IndexedDB
   */
  async migrateFromChromeStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('bookmarks');
      const bookmarks = (result.bookmarks || []) as IBookmark[];

      if (bookmarks.length > 0) {
        console.log(`[PaginatedStorage] Migrating ${bookmarks.length} bookmarks from Chrome Storage`);
        await this.saveAllBookmarks(bookmarks);
        console.log('[PaginatedStorage] Migration completed');
      }
    } catch (error) {
      console.error('[PaginatedStorage] Migration failed:', error);
    }
  }

  /**
   * 保存所有书签（分页）
   */
  async saveAllBookmarks(bookmarks: IBookmark[]): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const totalPages = Math.ceil(bookmarks.length / PAGE_SIZE);
    const categories = new Map<string, number[]>();
    const folders = new Map<string, number[]>();

    // 分页保存
    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
      const start = pageNum * PAGE_SIZE;
      const end = Math.min(start + PAGE_SIZE, bookmarks.length);
      const pageBookmarks = bookmarks.slice(start, end);

      const transaction = this.db.transaction([BOOKMARKS_STORE], 'readwrite');
      const store = transaction.objectStore(BOOKMARKS_STORE);

      for (const bookmark of pageBookmarks) {
        // 添加分页信息
        const bookmarkWithPage = { ...bookmark, pageNumber: pageNum };
        store.put(bookmarkWithPage);

        // 构建索引
        if (bookmark.aiCategory) {
          if (!categories.has(bookmark.aiCategory)) {
            categories.set(bookmark.aiCategory, []);
          }
          if (!categories.get(bookmark.aiCategory)!.includes(pageNum)) {
            categories.get(bookmark.aiCategory)!.push(pageNum);
          }
        }

        if (bookmark.folderId) {
          if (!folders.has(bookmark.folderId)) {
            folders.set(bookmark.folderId, []);
          }
          if (!folders.get(bookmark.folderId)!.includes(pageNum)) {
            folders.get(bookmark.folderId)!.push(pageNum);
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }

    // 更新索引
    this.index = {
      totalCount: bookmarks.length,
      pageSize: PAGE_SIZE,
      totalPages,
      categories,
      folders,
      lastUpdated: Date.now(),
    };

    await this.saveIndex();
  }

  /**
   * 加载指定页的书签
   */
  async loadPage(pageNumber: number): Promise<IBookmark[]> {
    // 检查缓存
    const cached = this.cache.get(pageNumber);
    if (cached && Date.now() - cached.loadedAt < 60000) {
      // 缓存1分钟
      return cached.bookmarks;
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([BOOKMARKS_STORE], 'readonly');
      const store = transaction.objectStore(BOOKMARKS_STORE);
      const index = store.index('pageNumber');
      const request = index.getAll(pageNumber);

      request.onsuccess = () => {
        const bookmarks = request.result.map((b: any) => {
          // 移除分页元数据
          const { pageNumber, ...bookmark } = b;
          return bookmark as IBookmark;
        });

        // 更新缓存
        this.updateCache(pageNumber, bookmarks);

        resolve(bookmarks);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 懒加载：按需加载指定范围的书签
   */
  async loadRange(startIndex: number, endIndex: number): Promise<IBookmark[]> {
    const startPage = Math.floor(startIndex / PAGE_SIZE);
    const endPage = Math.floor(endIndex / PAGE_SIZE);

    const promises: Promise<IBookmark[]>[] = [];
    for (let page = startPage; page <= endPage; page++) {
      promises.push(this.loadPage(page));
    }

    const pages = await Promise.all(promises);
    const allBookmarks = pages.flat();

    // 提取指定范围
    const pageStartOffset = startIndex % PAGE_SIZE;
    const length = endIndex - startIndex + 1;

    return allBookmarks.slice(pageStartOffset, pageStartOffset + length);
  }

  /**
   * 按分类加载书签
   */
  async loadByCategory(category: string): Promise<IBookmark[]> {
    if (!this.index || !this.index.categories.has(category)) {
      return [];
    }

    const pageNumbers = this.index.categories.get(category)!;
    const promises = pageNumbers.map(pageNum => this.loadPage(pageNum));
    const pages = await Promise.all(promises);

    return pages.flat().filter(b => b.aiCategory === category);
  }

  /**
   * 按文件夹加载书签
   */
  async loadByFolder(folderId: string): Promise<IBookmark[]> {
    if (!this.index || !this.index.folders.has(folderId)) {
      return [];
    }

    const pageNumbers = this.index.folders.get(folderId)!;
    const promises = pageNumbers.map(pageNum => this.loadPage(pageNum));
    const pages = await Promise.all(promises);

    return pages.flat().filter(b => b.folderId === folderId);
  }

  /**
   * 添加单个书签
   */
  async addBookmark(bookmark: IBookmark): Promise<void> {
    if (!this.db || !this.index) {
      throw new Error('Database not initialized');
    }

    // 确定应该放在哪一页
    const pageNumber = Math.floor(this.index.totalCount / PAGE_SIZE);

    const transaction = this.db.transaction([BOOKMARKS_STORE], 'readwrite');
    const store = transaction.objectStore(BOOKMARKS_STORE);

    const bookmarkWithPage = { ...bookmark, pageNumber };
    store.add(bookmarkWithPage);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        // 更新索引
        this.index!.totalCount++;
        if (bookmark.aiCategory) {
          if (!this.index!.categories.has(bookmark.aiCategory)) {
            this.index!.categories.set(bookmark.aiCategory, []);
          }
          if (!this.index!.categories.get(bookmark.aiCategory)!.includes(pageNumber)) {
            this.index!.categories.get(bookmark.aiCategory)!.push(pageNumber);
          }
        }

        this.saveIndex();
        this.invalidateCache(pageNumber);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * 更新书签
   */
  async updateBookmark(bookmarkId: string, updates: Partial<IBookmark>): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const transaction = this.db.transaction([BOOKMARKS_STORE], 'readwrite');
    const store = transaction.objectStore(BOOKMARKS_STORE);
    const request = store.get(bookmarkId);

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const bookmark = request.result;
        if (bookmark) {
          const updated = { ...bookmark, ...updates };
          store.put(updated);

          // 使缓存失效
          this.invalidateCache(bookmark.pageNumber);
        }
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除书签
   */
  async deleteBookmark(bookmarkId: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const transaction = this.db.transaction([BOOKMARKS_STORE], 'readwrite');
    const store = transaction.objectStore(BOOKMARKS_STORE);
    const getRequest = store.get(bookmarkId);

    await new Promise<void>((resolve, reject) => {
      getRequest.onsuccess = () => {
        const bookmark = getRequest.result;
        if (bookmark) {
          store.delete(bookmarkId);

          // 更新索引
          if (this.index) {
            this.index.totalCount--;
            this.invalidateCache(bookmark.pageNumber);
          }
        }
        resolve();
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * 获取总数
   */
  getTotalCount(): number {
    return this.index?.totalCount || 0;
  }

  /**
   * 获取总页数
   */
  getTotalPages(): number {
    return this.index?.totalPages || 0;
  }

  /**
   * 更新缓存
   */
  private updateCache(pageNumber: number, bookmarks: IBookmark[]): void {
    this.cache.set(pageNumber, {
      pageNumber,
      bookmarks,
      loadedAt: Date.now(),
    });

    // 限制缓存大小
    if (this.cache.size > this.maxCachePages) {
      // 删除最旧的缓存
      let oldestPage: number | null = null;
      let oldestTime = Date.now();

      for (const [pageNum, page] of this.cache.entries()) {
        if (page.loadedAt < oldestTime) {
          oldestTime = page.loadedAt;
          oldestPage = pageNum;
        }
      }

      if (oldestPage !== null) {
        this.cache.delete(oldestPage);
      }
    }
  }

  /**
   * 使缓存失效
   */
  private invalidateCache(pageNumber: number): void {
    this.cache.delete(pageNumber);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 加载索引
   */
  private async loadIndex(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([INDEX_STORE], 'readonly');
      const store = transaction.objectStore(INDEX_STORE);
      const request = store.get('main');

      request.onsuccess = () => {
        if (request.result) {
          // 恢复Map类型
          this.index = {
            ...request.result,
            categories: new Map(Object.entries(request.result.categories || {})),
            folders: new Map(Object.entries(request.result.folders || {})),
          };
          console.log('[PaginatedStorage] Index loaded:', this.index);
        }
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存索引
   */
  private async saveIndex(): Promise<void> {
    if (!this.db || !this.index) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([INDEX_STORE], 'readwrite');
      const store = transaction.objectStore(INDEX_STORE);

      // 将Map转换为对象
      const indexToSave = {
        id: 'main',
        ...this.index,
        categories: Object.fromEntries(this.index.categories),
        folders: Object.fromEntries(this.index.folders),
      };

      store.put(indexToSave);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// 导出单例
let storageInstance: PaginatedStorageManager | null = null;

export async function getPaginatedStorage(): Promise<PaginatedStorageManager> {
  if (!storageInstance) {
    storageInstance = new PaginatedStorageManager();
    await storageInstance.initialize();
  }
  return storageInstance;
}
