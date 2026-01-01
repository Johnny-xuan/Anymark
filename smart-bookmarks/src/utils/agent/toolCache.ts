/**
 * Tool Cache - 工具执行缓存
 * 避免相同参数的工具重复执行，提升性能
 */

export interface CacheEntry {
  result: any;
  timestamp: number;
}

export class ToolCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL: number;
  private readonly maxSize: number;

  constructor(ttl: number = 60000, maxSize: number = 100) {
    this.TTL = ttl; // 默认 1 分钟
    this.maxSize = maxSize; // 最多缓存 100 个结果
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(toolName: string, params: any): string {
    // 对参数进行排序和序列化，确保相同参数生成相同的键
    const sortedParams = this.sortObject(params);
    return `${toolName}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * 递归排序对象（确保参数顺序一致）
   */
  private sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }

    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.sortObject(obj[key]);
    });
    return sorted;
  }

  /**
   * 获取缓存
   */
  get(toolName: string, params: any): any | null {
    const key = this.getCacheKey(toolName, params);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - cached.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }

    console.log(`[ToolCache] Cache hit for ${toolName}`);
    return cached.result;
  }

  /**
   * 设置缓存
   */
  set(toolName: string, params: any, result: any): void {
    const key = this.getCacheKey(toolName, params);

    // 检查缓存大小，超过限制则清理最旧的
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });

    console.log(`[ToolCache] Cached result for ${toolName}`);
  }

  /**
   * 清理最旧的缓存项
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    this.cache.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log('[ToolCache] Evicted oldest cache entry');
    }
  }

  /**
   * 清除指定工具的缓存
   */
  clearTool(toolName: string): void {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.startsWith(`${toolName}:`)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`[ToolCache] Cleared ${keysToDelete.length} cache entries for ${toolName}`);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[ToolCache] Cleared all ${size} cache entries`);
  }

  /**
   * 清除过期缓存
   */
  clearExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > this.TTL) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
      console.log(`[ToolCache] Cleared ${keysToDelete.length} expired cache entries`);
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; ttl: number; maxSize: number } {
    return {
      size: this.cache.size,
      ttl: this.TTL,
      maxSize: this.maxSize,
    };
  }
}

// 导出单例
export const toolCache = new ToolCache();
