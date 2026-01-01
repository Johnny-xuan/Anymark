/**
 * Chrome Sync 兼容层
 * 
 * 旧的 chromeSync.ts 已被移除，新架构使用 Chrome Native 作为唯一数据源。
 * 这个文件提供一个空的兼容层，让旧代码可以继续编译，但不执行任何同步操作。
 * 
 * 注意：这是一个临时解决方案，应该逐步将旧代码迁移到使用 bookmarkStoreV2.ts
 */

/**
 * 文件夹同步操作类型（兼容旧代码）
 */
export type FolderSyncAction = 'create' | 'update' | 'delete' | 'move';

/**
 * 空的 Chrome 同步服务（兼容层）
 * 
 * 所有方法都返回空值或 false，不执行任何实际操作。
 * 新架构通过 BookmarkService 直接操作 Chrome Native。
 */
class ChromeSyncServiceCompat {
  private static instance: ChromeSyncServiceCompat;

  static getInstance(): ChromeSyncServiceCompat {
    if (!ChromeSyncServiceCompat.instance) {
      ChromeSyncServiceCompat.instance = new ChromeSyncServiceCompat();
    }
    return ChromeSyncServiceCompat.instance;
  }

  /**
   * 初始化（空操作）
   */
  async initialize(): Promise<void> {
    console.log('[ChromeSyncCompat] Sync service disabled - using new architecture');
  }

  /**
   * 是否启用同步 - 始终返回 false
   * 新架构不需要双向同步，Chrome Native 是唯一数据源
   */
  isEnabled(): boolean {
    return false;
  }

  /**
   * 切换同步状态（空操作）
   */
  async toggleSync(_enabled: boolean): Promise<void> {
    console.log('[ChromeSyncCompat] toggleSync called but sync is disabled in new architecture');
  }

  /**
   * 确保书签有 Chrome ID（空操作）
   */
  async ensureChromeId(
    _bookmark: any,
    _targetParentId?: string,
    _shouldCreate?: boolean,
    _onChromeIdCreated?: (chromeId: string) => void | Promise<void>
  ): Promise<string | null> {
    return null;
  }

  /**
   * 确保文件夹有 Chrome ID（空操作）
   */
  async ensureFolderChromeId(
    _folder: any,
    _targetParentId?: string,
    _shouldCreate?: boolean,
    _onChromeIdCreated?: (chromeId: string) => void | Promise<void>
  ): Promise<string | null> {
    return null;
  }

  /**
   * 同步书签到 Chrome（空操作）
   */
  async syncBookmarkToChrome(
    _bookmark: any,
    _action: 'create' | 'update' | 'delete' | 'move',
    _options?: any
  ): Promise<void> {
    // 空操作
  }

  /**
   * 同步文件夹到 Chrome（空操作）
   */
  async syncFolderToChrome(
    _folder: any,
    _action: FolderSyncAction,
    _options?: any
  ): Promise<void> {
    // 空操作
  }
}

/**
 * 获取 Chrome 同步服务实例（兼容层）
 */
export function getChromeSyncService(): ChromeSyncServiceCompat {
  return ChromeSyncServiceCompat.getInstance();
}

/**
 * 检查是否是 Chrome 变更（兼容层）
 * 始终返回 false，因为新架构不需要区分变更来源
 */
export function isChromeChange(): boolean {
  return false;
}

/**
 * 同步管理器兼容层
 * 提供空的同步操作，让旧代码可以编译
 */
class SyncManagerCompat {
  private static instance: SyncManagerCompat;

  static getInstance(): SyncManagerCompat {
    if (!SyncManagerCompat.instance) {
      SyncManagerCompat.instance = new SyncManagerCompat();
    }
    return SyncManagerCompat.instance;
  }

  /**
   * 同步到 Chrome（空操作）
   */
  async syncToChrome(_bookmark: any, _action: string): Promise<void> {
    console.log('[SyncManagerCompat] syncToChrome called but sync is disabled in new architecture');
  }

  /**
   * 刷新同步（空操作）
   */
  async refreshSync(_bookmarks: any[]): Promise<{ added: number; updated: number; removed: number }> {
    console.log('[SyncManagerCompat] refreshSync called but sync is disabled in new architecture');
    return { added: 0, updated: 0, removed: 0 };
  }
}

/**
 * 获取同步管理器实例（兼容层）
 */
export function getSyncManager(): SyncManagerCompat {
  return SyncManagerCompat.getInstance();
}


// ============ 冲突解决器兼容类型 ============

/**
 * 同步状态类型（兼容层）
 */
export interface SyncStatus {
  status: 'idle' | 'syncing' | 'success' | 'error' | 'conflict';
  message?: string;
  lastSync?: number;
  conflicts?: BookmarkConflict[];
}

/**
 * 书签冲突类型（兼容层）
 */
export interface BookmarkConflict {
  id: string;
  type: 'modified' | 'deleted' | 'moved';
  localVersion: any;
  remoteVersion: any;
  resolution?: ResolutionStrategy;
}

/**
 * 解决策略类型（兼容层）
 */
export type ResolutionStrategy = 'keep_local' | 'keep_remote' | 'merge' | 'skip';

/**
 * 解决结果类型（兼容层）
 */
export interface ResolutionResult {
  success: boolean;
  resolved: number;
  failed: number;
  errors?: string[];
}

/**
 * 冲突解决器（兼容层）
 */
export const conflictResolver = {
  /**
   * 应用解决方案（空操作）
   */
  async applyResolutions(
    _conflicts: BookmarkConflict[],
    _updatePlugin?: any,
    _deletePlugin?: any
  ): Promise<ResolutionResult> {
    console.log('[ConflictResolverCompat] applyResolutions called but conflict resolution is disabled in new architecture');
    return {
      success: true,
      resolved: 0,
      failed: 0,
    };
  },
};
