/**
 * 操作历史服务
 * 
 * 记录书签和文件夹操作历史，支持撤销功能
 * 
 * 功能：
 * - 记录 create/move/delete/rename 操作
 * - 保存操作前的状态用于撤销
 * - 限制历史记录最多 50 条
 * - 清理超过 7 天的历史记录
 * - 支持撤销操作
 * - 撤销时同步到 Chrome Native Bookmarks
 */

import type { IBookmark, IFolder } from '../types/bookmark';
import { getChromeSyncService } from './chromeSyncCompat';
import { getBookmarkService } from '../services/bookmarkService';

// ============ 类型定义 ============

/**
 * 操作类型
 */
export type OperationType = 'create' | 'move' | 'delete' | 'rename';

/**
 * 目标类型
 */
export type TargetType = 'bookmark' | 'folder';

/**
 * 操作记录接口
 */
export interface OperationRecord {
  id: string;                    // 操作 ID
  type: OperationType;           // 操作类型
  targetType: TargetType;        // 目标类型
  targetId: string;              // 书签或文件夹 ID（批量操作时为 'batch'）
  timestamp: number;             // 操作时间戳
  
  // 撤销所需数据
  previousState?: {
    folderPath?: string;         // 原文件夹路径
    folderId?: string;           // 原文件夹 ID
    title?: string;              // 原标题
    chromeId?: string;           // Chrome 书签 ID
    url?: string;                // 书签 URL（用于恢复删除的书签）
    parentId?: string;           // 原父文件夹 ID（用于文件夹）
    path?: string;               // 原路径（用于文件夹）
    bookmarkData?: Partial<IBookmark>;  // 完整书签数据（用于恢复删除）
    folderData?: Partial<IFolder>;      // 完整文件夹数据（用于恢复删除）
  };
  
  // 新状态（用于撤销 create 操作）
  newState?: {
    folderPath?: string;
    folderId?: string;
    title?: string;
    chromeId?: string;
  };
  
  // 批量操作标识
  batchId?: string;              // 同一批次操作共享此 ID
  
  // 批量操作数据（用于一次性撤销多个书签）
  batchItems?: Array<{
    targetId: string;
    targetType: TargetType;
    previousState?: OperationRecord['previousState'];
  }>;
}

/**
 * 撤销结果接口
 */
export interface UndoResult {
  success: boolean;
  operationId: string;
  type: OperationType;
  targetType: TargetType;
  targetId: string;
  message: string;
  error?: string;
}

// ============ 存储键常量 ============

const STORAGE_KEY_OPERATION_HISTORY = 'operationHistory';

// ============ 配置常量 ============

const MAX_HISTORY_ENTRIES = 50;
const RETENTION_DAYS = 7;

// ============ OperationHistoryService 类 ============

/**
 * 操作历史服务
 */
export class OperationHistoryService {
  private static instance: OperationHistoryService;
  private history: OperationRecord[] = [];
  private initialized = false;

  private constructor() {
    // 私有构造函数，使用单例模式
  }

  /**
   * 获取单例实例
   */
  static getInstance(): OperationHistoryService {
    if (!OperationHistoryService.instance) {
      OperationHistoryService.instance = new OperationHistoryService();
    }
    return OperationHistoryService.instance;
  }

  /**
   * 初始化服务
   * 从 Storage 加载历史记录
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.loadHistory();
      this.initialized = true;
      console.log('[OperationHistory] Service initialized with', this.history.length, 'records');
    } catch (error) {
      console.error('[OperationHistory] Failed to initialize:', error);
    }
  }

  /**
   * 从 Storage 加载历史记录
   */
  private async loadHistory(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY_OPERATION_HISTORY);
      this.history = result[STORAGE_KEY_OPERATION_HISTORY] || [];
    } catch (error) {
      console.warn('[OperationHistory] Failed to load history:', error);
      this.history = [];
    }
  }

  /**
   * 保存历史记录到 Storage
   */
  private async saveHistory(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY_OPERATION_HISTORY]: this.history,
      });
    } catch (error) {
      console.error('[OperationHistory] Failed to save history:', error);
    }
  }

  /**
   * 生成唯一操作 ID
   */
  private generateId(): string {
    return `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 记录操作
   * @param operation 操作信息（不含 id 和 timestamp）
   * @returns 操作 ID
   */
  async record(operation: Omit<OperationRecord, 'id' | 'timestamp'>): Promise<string> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }

    const record: OperationRecord = {
      ...operation,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    // 添加到历史记录开头（最新的在前面）
    this.history.unshift(record);

    // 限制历史记录数量
    if (this.history.length > MAX_HISTORY_ENTRIES) {
      this.history = this.history.slice(0, MAX_HISTORY_ENTRIES);
    }

    // 保存到 Storage
    await this.saveHistory();

    console.log('[OperationHistory] Recorded operation:', record.type, record.targetType, record.targetId);
    return record.id;
  }

  /**
   * 撤销最近的操作
   * @returns 撤销结果
   */
  async undo(): Promise<UndoResult> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.history.length === 0) {
      return {
        success: false,
        operationId: '',
        type: 'create',
        targetType: 'bookmark',
        targetId: '',
        message: '没有可撤销的操作',
        error: 'No operations to undo',
      };
    }

    // 获取最近的操作
    const operation = this.history[0];
    return this.undoOperation(operation.id);
  }

  /**
   * 撤销指定操作
   * @param operationId 操作 ID
   * @returns 撤销结果
   */
  async undoOperation(operationId: string): Promise<UndoResult> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }

    const operationIndex = this.history.findIndex(op => op.id === operationId);
    if (operationIndex === -1) {
      return {
        success: false,
        operationId,
        type: 'create',
        targetType: 'bookmark',
        targetId: '',
        message: '找不到指定的操作',
        error: 'Operation not found',
      };
    }

    const operation = this.history[operationIndex];

    try {
      // 执行撤销逻辑
      await this.executeUndo(operation);

      // 从历史记录中移除
      this.history.splice(operationIndex, 1);
      await this.saveHistory();

      const message = this.getUndoMessage(operation);
      console.log('[OperationHistory] Undo successful:', message);

      return {
        success: true,
        operationId: operation.id,
        type: operation.type,
        targetType: operation.targetType,
        targetId: operation.targetId,
        message,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[OperationHistory] Undo failed:', errorMessage);

      return {
        success: false,
        operationId: operation.id,
        type: operation.type,
        targetType: operation.targetType,
        targetId: operation.targetId,
        message: '撤销失败',
        error: errorMessage,
      };
    }
  }

  /**
   * 执行撤销逻辑
   */
  private async executeUndo(operation: OperationRecord): Promise<void> {
    const { type, targetType, targetId, previousState, newState, batchItems } = operation;

    // 获取当前书签数据
    const result = await chrome.storage.local.get(['bookmarks', 'folders', 'userSettings']);
    const bookmarks: IBookmark[] = result.bookmarks || [];
    const folders: IFolder[] = result.folders || [];
    const settings = result.userSettings || {};
    const chromeSyncEnabled = settings.chromeSyncEnabled || false;

    // 获取 ChromeSyncService（如果同步开启）
    const syncService = chromeSyncEnabled ? getChromeSyncService() : null;

    // 处理批量操作
    if (batchItems && batchItems.length > 0) {
      await this.executeUndoBatch(type, batchItems, bookmarks, folders, syncService);
      return;
    }

    switch (type) {
      case 'create': {
        // 撤销创建 = 删除
        if (targetType === 'bookmark') {
          const index = bookmarks.findIndex(b => b.id === targetId);
          if (index !== -1) {
            const bookmark = bookmarks[index];
            
            // 同步删除到 Chrome Native
            if (syncService && bookmark.chromeId) {
              try {
                await syncService.syncBookmarkToChrome(bookmark, 'delete');
                console.log('[OperationHistory] Deleted bookmark from Chrome Native:', bookmark.chromeId);
              } catch (error) {
                console.error('[OperationHistory] Failed to delete bookmark from Chrome Native:', error);
              }
            }
            
            // 软删除
            bookmarks[index].status = 'deleted';
            bookmarks[index].updateTime = Date.now();
          }
        } else {
          // 删除文件夹
          const index = folders.findIndex(f => f.id === targetId);
          if (index !== -1) {
            const folder = folders[index];
            
            // 同步删除到 Chrome Native
            if (syncService && folder.chromeId) {
              try {
                await syncService.syncFolderToChrome(folder, 'delete');
                console.log('[OperationHistory] Deleted folder from Chrome Native:', folder.chromeId);
              } catch (error) {
                console.error('[OperationHistory] Failed to delete folder from Chrome Native:', error);
              }
            }
            
            folders.splice(index, 1);
          }
        }
        break;
      }

      case 'move': {
        // 撤销移动 = 移回原位置
        if (targetType === 'bookmark') {
          const bookmark = bookmarks.find(b => b.id === targetId);
          if (bookmark && previousState) {
            const oldFolderPath = bookmark.folderPath;
            bookmark.folderPath = previousState.folderPath || '/';
            bookmark.folderId = previousState.folderId || 'folder-/';
            bookmark.updateTime = Date.now();
            
            // 同步移动到 Chrome Native
            if (syncService && bookmark.chromeId) {
              try {
                await syncService.syncBookmarkToChrome(bookmark, 'move');
                console.log('[OperationHistory] Moved bookmark back in Chrome Native:', bookmark.chromeId, 'from', oldFolderPath, 'to', bookmark.folderPath);
              } catch (error) {
                console.error('[OperationHistory] Failed to move bookmark in Chrome Native:', error);
              }
            }
          }
        } else {
          // 移动文件夹回原位置
          const folder = folders.find(f => f.id === targetId);
          if (folder && previousState) {
            folder.parentId = previousState.parentId;
            folder.path = previousState.path || '/';
            folder.updateTime = Date.now();
            
            // 同步移动到 Chrome Native
            if (syncService && folder.chromeId) {
              try {
                await syncService.syncFolderToChrome(folder, 'move');
                console.log('[OperationHistory] Moved folder back in Chrome Native:', folder.chromeId);
              } catch (error) {
                console.error('[OperationHistory] Failed to move folder in Chrome Native:', error);
              }
            }
          }
        }
        break;
      }

      case 'delete': {
        // 撤销删除 = 恢复
        if (targetType === 'bookmark') {
          const bookmark = bookmarks.find(b => b.id === targetId);
          if (bookmark) {
            // 恢复状态
            bookmark.status = 'active';
            bookmark.updateTime = Date.now();
            // 恢复原位置
            if (previousState) {
              bookmark.folderPath = previousState.folderPath || '/';
              bookmark.folderId = previousState.folderId || 'folder-/';
            }
            
            // 同步创建到 Chrome Native（获取新的 chromeId）
            if (syncService) {
              try {
                const newChromeId = await syncService.ensureChromeId(bookmark);
                if (newChromeId) {
                  bookmark.chromeId = newChromeId;
                  console.log('[OperationHistory] Recreated bookmark in Chrome Native with new chromeId:', newChromeId);
                }
              } catch (error) {
                console.error('[OperationHistory] Failed to recreate bookmark in Chrome Native:', error);
              }
            }
          } else if (previousState?.bookmarkData) {
            // 如果书签已被永久删除，重新创建
            const restoredBookmark: IBookmark = {
              id: targetId,
              url: previousState.url || '',
              title: previousState.title || 'Untitled',
              folderPath: previousState.folderPath || '/',
              folderId: previousState.folderId || 'folder-/',
              userTags: [],
              aiTags: [],
              starred: false,
              pinned: false,
              createTime: Date.now(),
              updateTime: Date.now(),
              status: 'active',
              analytics: { visitCount: 0, importance: 50 },
              ...previousState.bookmarkData,
            } as IBookmark;
            
            // 同步创建到 Chrome Native
            if (syncService) {
              try {
                const newChromeId = await syncService.ensureChromeId(restoredBookmark);
                if (newChromeId) {
                  restoredBookmark.chromeId = newChromeId;
                  console.log('[OperationHistory] Created restored bookmark in Chrome Native with chromeId:', newChromeId);
                }
              } catch (error) {
                console.error('[OperationHistory] Failed to create restored bookmark in Chrome Native:', error);
              }
            }
            
            bookmarks.push(restoredBookmark);
          }
        } else {
          // 恢复文件夹
          // 注意：文件夹删除时可能包含 batchItems（文件夹内的书签）
          // 需要先恢复文件夹内的书签，再恢复文件夹本身
          
          // 1. 如果有 batchItems，先恢复文件夹内的书签
          if (batchItems && batchItems.length > 0) {
            console.log('[OperationHistory] Restoring', batchItems.length, 'bookmarks in folder');
            for (const item of batchItems) {
              if (item.targetType === 'bookmark') {
                const bookmark = bookmarks.find(b => b.id === item.targetId);
                if (bookmark) {
                  // 恢复状态
                  bookmark.status = 'active';
                  bookmark.updateTime = Date.now();
                  // 恢复原位置
                  if (item.previousState) {
                    bookmark.folderPath = item.previousState.folderPath || '/';
                    bookmark.folderId = item.previousState.folderId || 'folder-/';
                  }
                  
                  // 同步创建到 Chrome Native
                  if (syncService) {
                    try {
                      const newChromeId = await syncService.ensureChromeId(bookmark);
                      if (newChromeId) {
                        bookmark.chromeId = newChromeId;
                        console.log('[OperationHistory] Recreated bookmark in Chrome Native:', bookmark.title);
                      }
                    } catch (error) {
                      console.error('[OperationHistory] Failed to recreate bookmark in Chrome Native:', error);
                    }
                  }
                } else if (item.previousState?.bookmarkData) {
                  // 如果书签已被永久删除，重新创建
                  const restoredBookmark: IBookmark = {
                    id: item.targetId,
                    url: item.previousState.url || '',
                    title: item.previousState.title || 'Untitled',
                    folderPath: item.previousState.folderPath || '/',
                    folderId: item.previousState.folderId || 'folder-/',
                    userTags: [],
                    aiTags: [],
                    starred: false,
                    pinned: false,
                    createTime: Date.now(),
                    updateTime: Date.now(),
                    status: 'active',
                    analytics: { visitCount: 0, importance: 50 },
                    ...item.previousState.bookmarkData,
                  } as IBookmark;
                  
                  // 同步创建到 Chrome Native
                  if (syncService) {
                    try {
                      const newChromeId = await syncService.ensureChromeId(restoredBookmark);
                      if (newChromeId) {
                        restoredBookmark.chromeId = newChromeId;
                      }
                    } catch (error) {
                      console.error('[OperationHistory] Failed to create restored bookmark in Chrome Native:', error);
                    }
                  }
                  
                  bookmarks.push(restoredBookmark);
                }
              }
            }
          }
          
          // 2. 恢复文件夹本身（如果需要）
          if (previousState?.folderData) {
            const restoredFolder: IFolder = {
              id: targetId,
              title: previousState.title || 'Untitled',
              path: previousState.path || '/',
              parentId: previousState.parentId,
              bookmarkCount: 0,
              subfolderCount: 0,
              createTime: Date.now(),
              updateTime: Date.now(),
              order: folders.length,
              ...previousState.folderData,
            } as IFolder;
            
            // 同步创建到 Chrome Native
            if (syncService) {
              try {
                const newChromeId = await syncService.syncFolderToChrome(restoredFolder, 'create');
                if (newChromeId) {
                  restoredFolder.chromeId = newChromeId;
                  console.log('[OperationHistory] Created restored folder in Chrome Native with chromeId:', newChromeId);
                }
              } catch (error) {
                console.error('[OperationHistory] Failed to create restored folder in Chrome Native:', error);
              }
            }
            
            folders.push(restoredFolder);
          }
        }
        break;
      }

      case 'rename': {
        // 撤销重命名 = 恢复原名称
        if (targetType === 'bookmark') {
          const bookmark = bookmarks.find(b => b.id === targetId);
          if (bookmark && previousState?.title) {
            bookmark.title = previousState.title;
            bookmark.updateTime = Date.now();
            
            // 同步更新到 Chrome Native
            if (syncService && bookmark.chromeId) {
              try {
                await syncService.syncBookmarkToChrome(bookmark, 'update');
                console.log('[OperationHistory] Renamed bookmark back in Chrome Native:', bookmark.chromeId);
              } catch (error) {
                console.error('[OperationHistory] Failed to rename bookmark in Chrome Native:', error);
              }
            }
          }
        } else {
          const folder = folders.find(f => f.id === targetId);
          if (folder && previousState?.title) {
            folder.title = previousState.title;
            folder.updateTime = Date.now();
            
            // 同步更新到 Chrome Native
            if (syncService && folder.chromeId) {
              try {
                await syncService.syncFolderToChrome(folder, 'rename');
                console.log('[OperationHistory] Renamed folder back in Chrome Native:', folder.chromeId);
              } catch (error) {
                console.error('[OperationHistory] Failed to rename folder in Chrome Native:', error);
              }
            }
          }
        }
        break;
      }
    }

    // 保存更新后的数据
    await chrome.storage.local.set({ bookmarks, folders });

    // 通知 Sidebar 更新
    chrome.runtime.sendMessage({ type: 'BOOKMARKS_UPDATED' }).catch(() => {
      // Sidebar 可能没有打开，忽略错误
    });
  }

  /**
   * 执行批量撤销逻辑
   */
  private async executeUndoBatch(
    type: OperationType,
    batchItems: NonNullable<OperationRecord['batchItems']>,
    bookmarks: IBookmark[],
    folders: IFolder[],
    syncService: ReturnType<typeof getChromeSyncService> | null
  ): Promise<void> {
    console.log('[OperationHistory] Executing batch undo for', batchItems.length, 'items, type:', type);

    for (const item of batchItems) {
      const { targetId, targetType, previousState } = item;

      switch (type) {
        case 'delete': {
          // 批量撤销删除 = 恢复所有书签
          if (targetType === 'bookmark') {
            const bookmark = bookmarks.find(b => b.id === targetId);
            if (bookmark) {
              // 恢复状态
              bookmark.status = 'active';
              bookmark.updateTime = Date.now();
              // 恢复原位置
              if (previousState) {
                bookmark.folderPath = previousState.folderPath || '/';
                bookmark.folderId = previousState.folderId || 'folder-/';
              }
              
              // 同步创建到 Chrome Native（获取新的 chromeId）
              if (syncService) {
                try {
                  const newChromeId = await syncService.ensureChromeId(bookmark);
                  if (newChromeId) {
                    bookmark.chromeId = newChromeId;
                    console.log('[OperationHistory] Batch: Recreated bookmark in Chrome Native:', bookmark.title);
                  }
                } catch (error) {
                  console.error('[OperationHistory] Batch: Failed to recreate bookmark in Chrome Native:', error);
                }
              }
            } else if (previousState?.bookmarkData) {
              // 如果书签已被永久删除，重新创建
              const restoredBookmark: IBookmark = {
                id: targetId,
                url: previousState.url || '',
                title: previousState.title || 'Untitled',
                folderPath: previousState.folderPath || '/',
                folderId: previousState.folderId || 'folder-/',
                userTags: [],
                aiTags: [],
                starred: false,
                pinned: false,
                createTime: Date.now(),
                updateTime: Date.now(),
                status: 'active',
                analytics: { visitCount: 0, importance: 50 },
                ...previousState.bookmarkData,
              } as IBookmark;
              
              // 同步创建到 Chrome Native
              if (syncService) {
                try {
                  const newChromeId = await syncService.ensureChromeId(restoredBookmark);
                  if (newChromeId) {
                    restoredBookmark.chromeId = newChromeId;
                  }
                } catch (error) {
                  console.error('[OperationHistory] Batch: Failed to create restored bookmark in Chrome Native:', error);
                }
              }
              
              bookmarks.push(restoredBookmark);
            }
          }
          break;
        }
        
        case 'move': {
          // 批量撤销移动 = 移回原位置
          if (targetType === 'bookmark') {
            const bookmark = bookmarks.find(b => b.id === targetId);
            if (bookmark && previousState) {
              bookmark.folderPath = previousState.folderPath || '/';
              bookmark.folderId = previousState.folderId || 'folder-/';
              bookmark.updateTime = Date.now();
              
              // 同步移动到 Chrome Native
              if (syncService && bookmark.chromeId) {
                try {
                  await syncService.syncBookmarkToChrome(bookmark, 'move');
                  console.log('[OperationHistory] Batch: Moved bookmark back in Chrome Native:', bookmark.title);
                } catch (error) {
                  console.error('[OperationHistory] Batch: Failed to move bookmark in Chrome Native:', error);
                }
              }
            }
          }
          break;
        }
        // 可以根据需要扩展其他批量操作类型
      }
    }

    // 保存更新后的数据
    await chrome.storage.local.set({ bookmarks, folders });

    // 通知 Sidebar 更新
    chrome.runtime.sendMessage({ type: 'BOOKMARKS_UPDATED' }).catch(() => {
      // Sidebar 可能没有打开，忽略错误
    });
  }

  /**
   * 生成撤销消息
   */
  private getUndoMessage(operation: OperationRecord): string {
    const { type, targetType, previousState, batchItems } = operation;
    
    // 处理批量操作消息（纯批量书签操作）
    if (batchItems && batchItems.length > 0 && targetType === 'bookmark') {
      const count = batchItems.length;
      switch (type) {
        case 'delete':
          return `已恢复 ${count} 个书签`;
        case 'move':
          return `已将 ${count} 个书签移回原位置`;
        default:
          return `已撤销 ${count} 个操作`;
      }
    }
    
    // 处理文件夹删除（包含内部书签）
    if (type === 'delete' && targetType === 'folder') {
      const folderName = previousState?.title || '文件夹';
      if (batchItems && batchItems.length > 0) {
        return `已恢复文件夹 "${folderName}" 及其 ${batchItems.length} 个书签`;
      }
      return `已恢复文件夹 "${folderName}"`;
    }
    
    const targetName = previousState?.title || (targetType === 'bookmark' ? '书签' : '文件夹');

    switch (type) {
      case 'create':
        return `已撤销创建 "${targetName}"`;
      case 'move':
        return `已将 "${targetName}" 移回 "${previousState?.folderPath || previousState?.path || '/'}"`;
      case 'delete':
        return `已恢复 "${targetName}"`;
      case 'rename':
        return `已将名称恢复为 "${previousState?.title}"`;
      default:
        return '已撤销操作';
    }
  }

  /**
   * 获取操作历史
   * @param limit 限制返回数量
   * @returns 操作历史记录
   */
  getHistory(limit?: number): OperationRecord[] {
    if (limit && limit > 0) {
      return this.history.slice(0, limit);
    }
    return [...this.history];
  }

  /**
   * 获取最近的操作
   * @returns 最近的操作记录，如果没有则返回 undefined
   */
  getLastOperation(): OperationRecord | undefined {
    return this.history[0];
  }

  /**
   * 清理过期记录
   * 删除超过 7 天的历史记录
   */
  async cleanup(): Promise<number> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }

    const cutoffTime = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const originalLength = this.history.length;

    this.history = this.history.filter(op => op.timestamp > cutoffTime);

    const removedCount = originalLength - this.history.length;

    if (removedCount > 0) {
      await this.saveHistory();
      console.log('[OperationHistory] Cleaned up', removedCount, 'expired records');
    }

    return removedCount;
  }

  /**
   * 清空所有历史记录
   */
  async clearAll(): Promise<void> {
    this.history = [];
    await this.saveHistory();
    console.log('[OperationHistory] All history cleared');
  }

  /**
   * 获取历史记录数量
   */
  getCount(): number {
    return this.history.length;
  }

  /**
   * 检查是否有可撤销的操作
   */
  canUndo(): boolean {
    return this.history.length > 0;
  }
}

// ============ 导出 ============

// 单例实例
let operationHistoryInstance: OperationHistoryService | null = null;

/**
 * 获取 OperationHistoryService 单例
 */
export function getOperationHistoryService(): OperationHistoryService {
  if (!operationHistoryInstance) {
    operationHistoryInstance = OperationHistoryService.getInstance();
  }
  return operationHistoryInstance;
}
