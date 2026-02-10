/**
 * Checkpoint Service - 操作检查点和撤回服务
 * 
 * 功能：
 * - 在每次用户发送消息前创建检查点
 * - 记录书签和文件夹的快照
 * - 支持撤回到任意检查点
 */

import { getBookmarkService } from './bookmarkService';
import { getMetadataService } from './metadataService';

// ============ 类型定义 ============

export interface Checkpoint {
  id: string;
  timestamp: number;
  userMessage: string;
  snapshot: BookmarkSnapshot;
}

export interface BookmarkSnapshot {
  bookmarks: Array<{
    chromeId: string;
    parentId: string;
    title: string;
    url: string;
  }>;
  folders: Array<{
    chromeId: string;
    parentId: string | undefined;
    title: string;
  }>;
}

export interface PendingDeletion {
  id: string;
  type: 'bookmark' | 'folder';
  items: Array<{
    id: string;
    title: string;
    url?: string;
    path?: string;
  }>;
  timestamp: number;
  confirmed: boolean;
}

// ============ Checkpoint Service ============

class CheckpointService {
  private checkpoints: Checkpoint[] = [];
  private pendingDeletions: Map<string, PendingDeletion> = new Map();
  private static readonly MAX_CHECKPOINTS = 20;

  /**
   * 创建检查点（在用户发送消息前调用）
   */
  async createCheckpoint(userMessage: string): Promise<Checkpoint> {
    const bookmarkService = getBookmarkService();
    
    // 获取当前书签树快照
    const tree = await bookmarkService.getBookmarkTree();
    const snapshot = this.createSnapshot(tree);
    
    const checkpoint: Checkpoint = {
      id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      userMessage,
      snapshot,
    };

    this.checkpoints.push(checkpoint);
    
    // 限制检查点数量
    if (this.checkpoints.length > CheckpointService.MAX_CHECKPOINTS) {
      this.checkpoints.shift();
    }

    console.log(`[CheckpointService] 创建检查点 ${checkpoint.id}，共 ${this.checkpoints.length} 个`);
    return checkpoint;
  }

  /**
   * 从书签树创建快照
   */
  private createSnapshot(tree: chrome.bookmarks.BookmarkTreeNode[]): BookmarkSnapshot {
    const bookmarks: BookmarkSnapshot['bookmarks'] = [];
    const folders: BookmarkSnapshot['folders'] = [];

    const traverse = (nodes: chrome.bookmarks.BookmarkTreeNode[], parentId: string | undefined) => {
      for (const node of nodes) {
        if (node.url) {
          bookmarks.push({
            chromeId: node.id,
            parentId: node.parentId || '',
            title: node.title,
            url: node.url,
          });
        } else {
          folders.push({
            chromeId: node.id,
            parentId: node.parentId,
            title: node.title,
          });
          if (node.children) {
            traverse(node.children, node.id);
          }
        }
      }
    };

    traverse(tree, undefined);
    return { bookmarks, folders };
  }

  /**
   * 获取所有检查点
   */
  getCheckpoints(): Checkpoint[] {
    return [...this.checkpoints];
  }

  /**
   * 撤回到指定检查点
   */
  async revertToCheckpoint(checkpointId: string): Promise<{ success: boolean; message: string }> {
    const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint) {
      return { success: false, message: '检查点不存在' };
    }

    try {
      const bookmarkService = getBookmarkService();
      const currentTree = await bookmarkService.getBookmarkTree();
      const currentSnapshot = this.createSnapshot(currentTree);

      // 找出需要恢复的书签（在检查点中存在但现在不存在的）
      const currentBookmarkIds = new Set(currentSnapshot.bookmarks.map(b => b.chromeId));
      const toRestore = checkpoint.snapshot.bookmarks.filter(b => !currentBookmarkIds.has(b.chromeId));

      // 找出需要删除的书签（现在存在但在检查点中不存在的）
      const checkpointBookmarkIds = new Set(checkpoint.snapshot.bookmarks.map(b => b.chromeId));
      const toDelete = currentSnapshot.bookmarks.filter(b => !checkpointBookmarkIds.has(b.chromeId));

      // 恢复删除的书签
      for (const b of toRestore) {
        try {
          await chrome.bookmarks.create({
            parentId: b.parentId,
            title: b.title,
            url: b.url,
          });
        } catch (e) {
          console.warn(`[CheckpointService] 恢复书签失败:`, b.title, e);
        }
      }

      // 删除新增的书签
      for (const b of toDelete) {
        try {
          await chrome.bookmarks.remove(b.chromeId);
        } catch (e) {
          console.warn(`[CheckpointService] 删除书签失败:`, b.title, e);
        }
      }

      // 恢复移动的书签位置
      for (const b of checkpoint.snapshot.bookmarks) {
        const current = currentSnapshot.bookmarks.find(cb => cb.chromeId === b.chromeId);
        if (current && current.parentId !== b.parentId) {
          try {
            await chrome.bookmarks.move(b.chromeId, { parentId: b.parentId });
          } catch (e) {
            console.warn(`[CheckpointService] 移动书签失败:`, b.title, e);
          }
        }
      }

      // 移除这个检查点之后的所有检查点
      const cpIndex = this.checkpoints.findIndex(cp => cp.id === checkpointId);
      this.checkpoints = this.checkpoints.slice(0, cpIndex + 1);

      return {
        success: true,
        message: `已撤回到「${checkpoint.userMessage.slice(0, 20)}...」之前的状态，恢复 ${toRestore.length} 个书签`,
      };
    } catch (error) {
      return {
        success: false,
        message: `撤回失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ============ 删除确认机制 ============

  /**
   * 创建待确认的删除请求
   */
  createPendingDeletion(
    type: 'bookmark' | 'folder',
    items: PendingDeletion['items']
  ): PendingDeletion {
    const pending: PendingDeletion = {
      id: `del-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      items,
      timestamp: Date.now(),
      confirmed: false,
    };

    this.pendingDeletions.set(pending.id, pending);
    
    // 5 分钟后自动过期
    setTimeout(() => {
      this.pendingDeletions.delete(pending.id);
    }, 5 * 60 * 1000);

    return pending;
  }

  /**
   * 确认删除
   */
  confirmDeletion(pendingId: string): PendingDeletion | null {
    const pending = this.pendingDeletions.get(pendingId);
    if (pending) {
      pending.confirmed = true;
      return pending;
    }
    return null;
  }

  /**
   * 取消删除
   */
  cancelDeletion(pendingId: string): boolean {
    return this.pendingDeletions.delete(pendingId);
  }

  /**
   * 获取待确认的删除
   */
  getPendingDeletion(pendingId: string): PendingDeletion | undefined {
    return this.pendingDeletions.get(pendingId);
  }

  /**
   * 清理过期的待确认删除
   */
  cleanupExpiredDeletions(): void {
    const now = Date.now();
    const expireTime = 5 * 60 * 1000; // 5 分钟
    
    for (const [id, pending] of this.pendingDeletions) {
      if (now - pending.timestamp > expireTime) {
        this.pendingDeletions.delete(id);
      }
    }
  }
}

// 单例
let instance: CheckpointService | null = null;

export function getCheckpointService(): CheckpointService {
  if (!instance) {
    instance = new CheckpointService();
  }
  return instance;
}

export { CheckpointService };
