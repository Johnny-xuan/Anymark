/**
 * API Key轮换管理器
 * 支持多个API Key并行请求，提升导入速度
 */

export class APIKeyRotator {
  private keys: string[];
  private currentIndex: number = 0;
  private keyUsageCount: Map<string, number> = new Map();
  private keyLastUsed: Map<string, number> = new Map();

  constructor(keys: string[]) {
    if (!keys || keys.length === 0) {
      throw new Error('At least one API key is required');
    }
    this.keys = keys;
    // 初始化使用计数
    keys.forEach(key => {
      this.keyUsageCount.set(key, 0);
      this.keyLastUsed.set(key, 0);
    });
  }

  /**
   * 获取下一个可用的API Key
   * 使用轮换策略，确保每个key的使用次数均衡
   */
  getNextKey(): string {
    const key = this.keys[this.currentIndex];

    // 更新使用统计
    this.keyUsageCount.set(key, (this.keyUsageCount.get(key) || 0) + 1);
    this.keyLastUsed.set(key, Date.now());

    // 移动到下一个key
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;

    return key;
  }

  /**
   * 获取所有keys（用于并行请求）
   */
  getAllKeys(): string[] {
    return [...this.keys];
  }

  /**
   * 获取使用统计
   */
  getStats() {
    return {
      totalKeys: this.keys.length,
      usageCount: Object.fromEntries(this.keyUsageCount),
      lastUsed: Object.fromEntries(this.keyLastUsed),
    };
  }

  /**
   * 重置使用统计
   */
  resetStats() {
    this.keys.forEach(key => {
      this.keyUsageCount.set(key, 0);
      this.keyLastUsed.set(key, 0);
    });
    this.currentIndex = 0;
  }
}

/**
 * 从Chrome Storage加载API Keys
 */
export async function loadAPIKeys(): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get(['aiConfig']);
    const config = result.aiConfig as any;

    if (config?.apiKeys && Array.isArray(config.apiKeys) && config.apiKeys.length > 0) {
      console.log(`[API Rotator] Loaded ${config.apiKeys.length} API keys`);
      return config.apiKeys;
    }

    if (config?.apiKey) {
      console.log('[API Rotator] Loaded single API key');
      return [config.apiKey];
    }

    console.warn('[API Rotator] No API keys configured');
    return [];
  } catch (error) {
    console.error('[API Rotator] Failed to load API keys:', error);
    return [];
  }
}

/**
 * 创建API Key轮换器
 */
export async function createRotator(): Promise<APIKeyRotator | null> {
  const keys = await loadAPIKeys();
  if (keys.length === 0) {
    return null;
  }
  return new APIKeyRotator(keys);
}
