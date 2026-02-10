/**
 * MetadataService - 书签元数据管理服务
 * 
 * 设计原则：
 * 1. 只管理扩展特有的元数据（AI 分析、用户标签等）
 * 2. 使用 chromeId 作为主键
 * 3. 不存储书签结构数据（URL、标题等来自 Chrome Native）
 */

import {
  type BookmarkMetadata,
  type ExtensionStorageSchema,
  DEFAULT_BOOKMARK_METADATA,
} from '../types/chromeBookmark';

// ============ 错误类型 ============

export class MetadataServiceError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly chromeId?: string
  ) {
    super(message);
    this.name = 'MetadataServiceError';
  }
}

// ============ 常量 ============

const STORAGE_KEY = 'bookmarkMetadata';
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 100;

// ============ MetadataService 类 ============

/**
 * 书签元数据管理服务
 * 单例模式
 */
export class MetadataService {
  private static instance: MetadataService;
  
  private initialized = false;
  private metadataCache: Map<string, BookmarkMetadata> = new Map();
  private pendingWrites: Map<string, BookmarkMetadata> = new Map();
  private writeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  
  private constructor() {}
  
  /**
   * 获取单例实例
   */
  static getInstance(): MetadataService {
    if (!MetadataService.instance) {
      MetadataService.instance = new MetadataService();
    }
    return MetadataService.instance;
  }
  
  // ============ 初始化 ============
  
  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[MetadataService] Already initialized');
      return;
    }
    
    console.log('[MetadataService] Initializing...');
    
    try {
      // 从 Storage 加载所有元数据
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const metadata = stored[STORAGE_KEY] as Record<string, BookmarkMetadata> | undefined;
      
      if (metadata) {
        this.metadataCache = new Map(Object.entries(metadata));
        console.log('[MetadataService] Loaded', this.metadataCache.size, 'metadata entries');
      } else {
        this.metadataCache = new Map();
        console.log('[MetadataService] No existing metadata found');
      }
      
      this.initialized = true;
      console.log('[MetadataService] Initialized successfully');
    } catch (error) {
      console.error('[MetadataService] Initialization failed:', error);
      throw new MetadataServiceError(
        `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        'initialize'
      );
    }
  }
  
  // ============ CRUD 操作 ============
  
  /**
   * 获取书签元数据
   */
  async getMetadata(chromeId: string): Promise<BookmarkMetadata | null> {
    this.ensureInitialized();
    
    // 先检查待写入的数据
    if (this.pendingWrites.has(chromeId)) {
      return this.pendingWrites.get(chromeId)!;
    }
    
    return this.metadataCache.get(chromeId) || null;
  }
  
  /**
   * 设置书签元数据
   */
  async setMetadata(chromeId: string, metadata: Partial<BookmarkMetadata>): Promise<void> {
    this.ensureInitialized();
    
    // 合并现有数据
    const existing = this.metadataCache.get(chromeId) || { ...DEFAULT_BOOKMARK_METADATA };
    const updated: BookmarkMetadata = {
      ...existing,
      ...metadata,
      updatedAt: Date.now(),
    };
    
    // 如果是新创建的，设置 createdAt
    if (!existing.createdAt) {
      updated.createdAt = Date.now();
    }
    
    // 更新缓存
    this.metadataCache.set(chromeId, updated);
    
    // 添加到待写入队列
    this.pendingWrites.set(chromeId, updated);
    
    // 防抖写入
    this.scheduleWrite();
    
    console.log('[MetadataService] Set metadata for:', chromeId);
  }
  
  /**
   * 删除书签元数据
   */
  async deleteMetadata(chromeId: string): Promise<void> {
    this.ensureInitialized();
    
    if (!this.metadataCache.has(chromeId)) {
      console.log('[MetadataService] Metadata not found for:', chromeId);
      return;
    }
    
    // 从缓存删除
    this.metadataCache.delete(chromeId);
    this.pendingWrites.delete(chromeId);
    
    // 立即写入（删除操作不防抖）
    await this.flushToStorage();
    
    console.log('[MetadataService] Deleted metadata for:', chromeId);
  }

  /**
   * 获取所有已删除的元数据
   */
  async getDeletedMetadata(): Promise<BookmarkMetadata[]> {
    this.ensureInitialized();
    const deleted: BookmarkMetadata[] = [];
    for (const meta of this.metadataCache.values()) {
      if (meta.status === 'deleted') {
        deleted.push(meta);
      }
    }
    return deleted;
  }

  /**
   * 标记为已删除 (软删除)
   */
  async markAsDeleted(chromeId: string, snapshot: BookmarkMetadata['snapshot']): Promise<void> {
    await this.setMetadata(chromeId, {
      status: 'deleted',
      snapshot,
      updatedAt: Date.now()
    });
  }
  
  /**
   * 创建默认元数据
   * 如果元数据已存在，则不进行覆盖，直接返回现有数据
   */
  async createDefaultMetadata(chromeId: string, source: 'browser' | 'manual' | 'migration' = 'browser'): Promise<BookmarkMetadata> {
    this.ensureInitialized();

    // 安全检查：如果元数据已存在（例如由 handleSaveBookmark 预先设置了），则跳过创建默认值
    // 防止覆盖已有的 AI 分析数据
    const existing = this.metadataCache.get(chromeId);
    if (existing) {
      console.log('[MetadataService] Metadata already exists for:', chromeId, 'skipping default creation');
      return existing;
    }

    const metadata: BookmarkMetadata = {
      ...DEFAULT_BOOKMARK_METADATA,
      importSource: source,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await this.setMetadata(chromeId, metadata);
    return metadata;
  }
  
  // ============ 批量操作 ============
  
  /**
   * 获取所有元数据
   */
  async getAllMetadata(): Promise<Map<string, BookmarkMetadata>> {
    this.ensureInitialized();
    
    // 返回缓存的副本
    return new Map(this.metadataCache);
  }
  
  /**
   * 批量设置元数据
   */
  async setAllMetadata(metadata: Map<string, BookmarkMetadata>): Promise<void> {
    this.ensureInitialized();
    
    // 更新缓存
    this.metadataCache = new Map(metadata);
    
    // 立即写入
    await this.flushToStorage();
    
    console.log('[MetadataService] Set all metadata, count:', metadata.size);
  }
  
  /**
   * 批量获取元数据
   */
  async getMetadataBatch(chromeIds: string[]): Promise<Map<string, BookmarkMetadata>> {
    this.ensureInitialized();
    
    const result = new Map<string, BookmarkMetadata>();
    for (const id of chromeIds) {
      const metadata = this.metadataCache.get(id);
      if (metadata) {
        result.set(id, metadata);
      }
    }
    return result;
  }
  
  /**
   * 批量删除元数据
   */
  async deleteMetadataBatch(chromeIds: string[]): Promise<number> {
    this.ensureInitialized();
    
    let deletedCount = 0;
    for (const id of chromeIds) {
      if (this.metadataCache.has(id)) {
        this.metadataCache.delete(id);
        this.pendingWrites.delete(id);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      await this.flushToStorage();
      console.log('[MetadataService] Batch deleted', deletedCount, 'metadata entries');
    }
    
    return deletedCount;
  }
  
  // ============ 清理操作 ============
  
  /**
   * 清理孤立的元数据（Chrome Native 中不存在的书签）
   */
  async cleanupOrphanedMetadata(validChromeIds: Set<string>): Promise<number> {
    this.ensureInitialized();
    
    const orphanedIds: string[] = [];
    
    for (const chromeId of this.metadataCache.keys()) {
      if (!validChromeIds.has(chromeId)) {
        orphanedIds.push(chromeId);
      }
    }
    
    if (orphanedIds.length === 0) {
      console.log('[MetadataService] No orphaned metadata found');
      return 0;
    }
    
    // 删除孤立的元数据
    for (const id of orphanedIds) {
      this.metadataCache.delete(id);
    }
    
    await this.flushToStorage();
    
    console.log('[MetadataService] Cleaned up', orphanedIds.length, 'orphaned metadata entries');
    return orphanedIds.length;
  }
  
  // ============ 查询方法 ============
  
  /**
   * 获取所有收藏的书签 ID
   */
  getStarredIds(): string[] {
    const result: string[] = [];
    for (const [id, metadata] of this.metadataCache) {
      if (metadata.starred) {
        result.push(id);
      }
    }
    return result;
  }
  
  /**
   * 获取所有置顶的书签 ID
   */
  getPinnedIds(): string[] {
    const result: string[] = [];
    for (const [id, metadata] of this.metadataCache) {
      if (metadata.pinned) {
        result.push(id);
      }
    }
    return result;
  }
  
  /**
   * 按标签搜索
   */
  searchByTag(tag: string): string[] {
    const result: string[] = [];
    const lowerTag = tag.toLowerCase();
    
    for (const [id, metadata] of this.metadataCache) {
      const allTags = [...(metadata.aiTags || []), ...(metadata.userTags || [])];
      if (allTags.some(t => t.toLowerCase().includes(lowerTag))) {
        result.push(id);
      }
    }
    return result;
  }
  
  /**
   * 按分类搜索
   */
  searchByCategory(category: string): string[] {
    const result: string[] = [];
    const lowerCategory = category.toLowerCase();
    
    for (const [id, metadata] of this.metadataCache) {
      if (metadata.aiCategory?.toLowerCase().includes(lowerCategory)) {
        result.push(id);
      }
    }
    return result;
  }
  
  // ============ 统计方法 ============
  
  /**
   * 从 Chrome History API 获取访问统计
   * 这比自己统计更准确，因为包含了插件安装前的历史数据
   */
  async getVisitStatsFromHistory(url: string): Promise<{ visitCount: number; lastVisit: number }> {
    try {
      const historyItems = await chrome.history.search({
        text: url,
        maxResults: 1,
      });
      
      if (historyItems.length > 0 && historyItems[0].url === url) {
        return {
          visitCount: historyItems[0].visitCount || 0,
          lastVisit: historyItems[0].lastVisitTime || 0,
        };
      }
      
      return { visitCount: 0, lastVisit: 0 };
    } catch (error) {
      console.error('[MetadataService] Failed to get visit stats from history:', error);
      return { visitCount: 0, lastVisit: 0 };
    }
  }
  
  /**
   * 更新访问统计（已废弃，改用 Chrome History API）
   * @deprecated 使用 getVisitStatsFromHistory 替代
   */
  async updateVisitStats(chromeId: string): Promise<void> {
    // 不再需要手动更新，Chrome History API 会自动统计
    console.warn('[MetadataService] updateVisitStats is deprecated, use Chrome History API instead');
  }
  
  /**
   * 获取统计信息
   */
  getStats(): {
    totalCount: number;
    starredCount: number;
    pinnedCount: number;
    analyzedCount: number;
    taggedCount: number;
  } {
    let starredCount = 0;
    let pinnedCount = 0;
    let analyzedCount = 0;
    let taggedCount = 0;
    
    for (const metadata of this.metadataCache.values()) {
      if (metadata.starred) starredCount++;
      if (metadata.pinned) pinnedCount++;
      if (metadata.aiCategory || (metadata.aiTags && metadata.aiTags.length > 0)) analyzedCount++;
      if ((metadata.userTags && metadata.userTags.length > 0) || (metadata.aiTags && metadata.aiTags.length > 0)) taggedCount++;
    }
    
    return {
      totalCount: this.metadataCache.size,
      starredCount,
      pinnedCount,
      analyzedCount,
      taggedCount,
    };
  }
  
  // ============ 私有方法 ============
  
  /**
   * 确保服务已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new MetadataServiceError('Service not initialized', 'ensureInitialized');
    }
  }
  
  /**
   * 调度写入操作（防抖）
   */
  private scheduleWrite(): void {
    if (this.writeDebounceTimer) {
      clearTimeout(this.writeDebounceTimer);
    }
    
    this.writeDebounceTimer = setTimeout(() => {
      this.flushToStorage();
    }, 500); // 500ms 防抖
  }
  
  /**
   * 将缓存写入 Storage
   */
  private async flushToStorage(): Promise<void> {
    if (this.writeDebounceTimer) {
      clearTimeout(this.writeDebounceTimer);
      this.writeDebounceTimer = null;
    }
    
    // 转换 Map 为对象
    const data: Record<string, BookmarkMetadata> = {};
    for (const [id, metadata] of this.metadataCache) {
      data[id] = metadata;
    }
    
    // 重试写入
    let lastError: Error | null = null;
    for (let i = 0; i < MAX_RETRY_COUNT; i++) {
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
        this.pendingWrites.clear();
        console.log('[MetadataService] Flushed to storage, count:', this.metadataCache.size);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn('[MetadataService] Write failed, retry', i + 1, '/', MAX_RETRY_COUNT);
        await this.delay(RETRY_DELAY_MS * (i + 1));
      }
    }
    
    console.error('[MetadataService] Failed to write to storage after retries:', lastError);
    throw new MetadataServiceError(
      `Failed to write to storage: ${lastError?.message}`,
      'flushToStorage'
    );
  }
  
  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 强制刷新（用于测试或紧急情况）
   */
  async forceFlush(): Promise<void> {
    await this.flushToStorage();
  }
}

// ============ 导出 ============

/**
 * 获取 MetadataService 单例
 */
export function getMetadataService(): MetadataService {
  return MetadataService.getInstance();
}
