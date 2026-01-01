/**
 * 配置同步管理器
 * 使用 chrome.storage.sync 同步核心设置到云端
 */

import type { IUserSettings } from '../types/bookmark';

export interface SyncConfig {
  // 核心配置
  userSettings?: IUserSettings;

  // AI配置
  aiConfig?: {
    provider: string;
    apiUrl?: string;
    modelId?: string;
    apiKey?: string;
  };

  // 用户偏好
  userPreferences?: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    defaultViewMode: 'list' | 'grid' | 'compact';
    keyboardShortcuts: Record<string, string>;
  };

  // 自定义标签规则
  customTagRules?: Array<{
    id: string;
    name: string;
    pattern: string;
    tags: string[];
    enabled: boolean;
  }>;

  // 同步元数据
  syncMetadata?: {
    lastSyncTime: number;
    version: string;
    deviceId: string;
    deviceName: string;
  };
}

// 同步状态
export interface SyncStatus {
  isEnabled: boolean;
  isSyncing: boolean;
  lastSyncTime?: number;
  deviceCount?: number;
  error?: string;
  quotaUsed?: number;
  quotaLimit?: number;
}

// 默认配置
const DEFAULT_CONFIG: Partial<SyncConfig> = {
  syncMetadata: {
    lastSyncTime: 0,
    version: '2.0.0',
    deviceId: generateDeviceId(),
    deviceName: getDeviceName(),
  },
};

// 设备ID生成
function generateDeviceId(): string {
  return 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 设备名称
function getDeviceName(): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const isWindows = navigator.platform.toUpperCase().indexOf('WIN') >= 0;

  if (isMac) return 'Mac';
  if (isWindows) return 'Windows';
  return 'Chrome';
}

export class ConfigSyncManager {
  private static instance: ConfigSyncManager;
  private isEnabled: boolean = false;
  private syncListeners: Array<(config: SyncConfig) => void> = [];
  private deviceId: string;
  private deviceName: string;

  private constructor() {
    this.deviceId = DEFAULT_CONFIG.syncMetadata!.deviceId!;
    this.deviceName = DEFAULT_CONFIG.syncMetadata!.deviceName!;
  }

  static getInstance(): ConfigSyncManager {
    if (!ConfigSyncManager.instance) {
      ConfigSyncManager.instance = new ConfigSyncManager();
    }
    return ConfigSyncManager.instance;
  }

  /**
   * 启用同步
   */
  async enableSync(): Promise<void> {
    if (!chrome.storage?.sync) {
      throw new Error('chrome.storage.sync API 不可用');
    }

    this.isEnabled = true;
    console.log('[ConfigSync] 同步已启用');

    // 初始化同步
    await this.initializeSync();

    // 监听来自其他设备的更改
    this.listenToChanges();
  }

  /**
   * 禁用同步
   */
  async disableSync(): Promise<void> {
    this.isEnabled = false;
    console.log('[ConfigSync] 同步已禁用');
  }

  /**
   * 获取同步状态
   */
  getSyncStatus(): SyncStatus {
    return {
      isEnabled: this.isEnabled,
      isSyncing: false, // TODO: 实现同步状态跟踪
      deviceId: this.deviceId,
    };
  }

  /**
   * 同步配置到云端
   */
  async syncToCloud(config: Partial<SyncConfig>): Promise<void> {
    if (!this.isEnabled || !chrome.storage?.sync) {
      return;
    }

    try {
      console.log('[ConfigSync] 开始同步配置到云端');

      // 添加同步元数据
      const configWithMetadata: SyncConfig = {
        ...config,
        syncMetadata: {
          lastSyncTime: Date.now(),
          version: '2.0.0',
          deviceId: this.deviceId,
          deviceName: this.deviceName,
        },
      };

      // 批量存储（chrome.storage.sync 有数量和大小限制）
      const items = this.batchConfigItems(configWithMetadata);

      for (const [key, value] of Object.entries(items)) {
        await chrome.storage.sync.set({ [key]: value });
      }

      console.log('[ConfigSync] 配置同步完成');
    } catch (error) {
      console.error('[ConfigSync] 同步失败:', error);
      throw error;
    }
  }

  /**
   * 从云端获取配置
   */
  async getConfigFromCloud(): Promise<Partial<SyncConfig>> {
    if (!this.isEnabled || !chrome.storage?.sync) {
      return {};
    }

    try {
      console.log('[ConfigSync] 从云端获取配置');

      // 获取所有同步项
      const result = await chrome.storage.sync.get();

      // 重建配置对象
      const config = this.rebuildConfigFromStorage(result);

      console.log('[ConfigSync] 配置获取完成');
      return config;
    } catch (error) {
      console.error('[ConfigSync] 获取配置失败:', error);
      throw error;
    }
  }

  /**
   * 监听配置更改
   */
  onConfigChange(callback: (config: SyncConfig) => void): void {
    this.syncListeners.push(callback);
  }

  /**
   * 移除监听器
   */
  removeConfigChangeListener(callback: (config: SyncConfig) => void): void {
    const index = this.syncListeners.indexOf(callback);
    if (index > -1) {
      this.syncListeners.splice(index, 1);
    }
  }

  /**
   * 初始化同步
   */
  private async initializeSync(): Promise<void> {
    try {
      // 检查是否已有云端配置
      const cloudConfig = await this.getConfigFromCloud();

      if (cloudConfig.syncMetadata?.lastSyncTime) {
        console.log('[ConfigSync] 发现云端配置，询问是否同步');

        // 可以在这里显示同步确认对话框
        // const shouldSync = await this.showSyncConfirmation();

        // 为了简化，自动合并配置
        await this.mergeConfigs(cloudConfig);
      }
    } catch (error) {
      console.error('[ConfigSync] 初始化同步失败:', error);
    }
  }

  /**
   * 监听来自其他设备的更改
   */
  private listenToChanges(): void {
    if (!chrome.storage?.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && this.isEnabled) {
        console.log('[ConfigSync] 检测到云端配置变更');

        // 重建配置
        const newConfig = this.rebuildConfigFromStorage(changes);

        // 通知监听器
        this.syncListeners.forEach(callback => {
          try {
            callback(newConfig as SyncConfig);
          } catch (error) {
            console.error('[ConfigSync] 监听器执行失败:', error);
          }
        });
      }
    });
  }

  /**
   * 合并配置
   */
  private async mergeConfigs(cloudConfig: Partial<SyncConfig>): Promise<void> {
    try {
      // 获取本地配置
      const localResult = await chrome.storage.local.get();

      // 简单的时间戳比较合并策略
      const localSyncTime = localResult.syncMetadata?.lastSyncTime || 0;
      const cloudSyncTime = cloudConfig.syncMetadata?.lastSyncTime || 0;

      if (cloudSyncTime > localSyncTime) {
        // 云端配置更新，使用云端配置
        console.log('[ConfigSync] 使用云端配置');
        await chrome.storage.local.set(cloudConfig);
      } else {
        // 本地配置更新，同步到云端
        console.log('[ConfigSync] 使用本地配置');
        await this.syncToCloud(localResult);
      }
    } catch (error) {
      console.error('[ConfigSync] 合并配置失败:', error);
    }
  }

  /**
   * 批量配置项
   */
  private batchConfigItems(config: SyncConfig): Record<string, any> {
    const items: Record<string, any> = {};

    // 将配置拆分为多个存储项
    if (config.userSettings) {
      items['userSettings'] = config.userSettings;
    }

    if (config.aiConfig) {
      items['aiConfig'] = config.aiConfig;
    }

    if (config.userPreferences) {
      items['userPreferences'] = config.userPreferences;
    }

    if (config.customTagRules) {
      items['customTagRules'] = config.customTagRules;
    }

    if (config.syncMetadata) {
      items['syncMetadata'] = config.syncMetadata;
    }

    return items;
  }

  /**
   * 从存储重建配置
   */
  private rebuildConfigFromStorage(storage: Record<string, any>): Partial<SyncConfig> {
    const config: Partial<SyncConfig> = {};

    if (storage.userSettings) config.userSettings = storage.userSettings;
    if (storage.aiConfig) config.aiConfig = storage.aiConfig;
    if (storage.userPreferences) config.userPreferences = storage.userPreferences;
    if (storage.customTagRules) config.customTagRules = storage.customTagRules;
    if (storage.syncMetadata) config.syncMetadata = storage.syncMetadata;

    return config;
  }

  /**
   * 获取存储配额信息
   */
  async getQuotaInfo(): Promise<{ used: number; limit: number }> {
    if (!chrome.storage?.sync) {
      return { used: 0, limit: 0 };
    }

    try {
      const bytesInUse = await chrome.storage.sync.getBytesInUse();
      // chrome.storage.sync 的限制通常是 102,400 字节 (100KB)
      const quotaLimit = 102400;

      return { used: bytesInUse, limit: quotaLimit };
    } catch (error) {
      console.error('[ConfigSync] 获取配额信息失败:', error);
      return { used: 0, limit: 0 };
    }
  }

  /**
   * 清除云端配置
   */
  async clearCloudConfig(): Promise<void> {
    if (!chrome.storage?.sync) {
      return;
    }

    try {
      const keys = ['userSettings', 'aiConfig', 'userPreferences', 'customTagRules', 'syncMetadata'];
      await chrome.storage.sync.remove(keys);
      console.log('[ConfigSync] 云端配置已清除');
    } catch (error) {
      console.error('[ConfigSync] 清除云端配置失败:', error);
      throw error;
    }
  }
}

// 导出单例
export const configSync = ConfigSyncManager.getInstance();
