/**
 * ChatArchiveManager - 对话存档管理器
 * 管理聊天对话的存档、恢复、删除功能
 */

export interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  data?: any;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  isArchived: boolean;
}

export interface StorageUsage {
  used: number;
  total: number;
  percentage: number;
}

const STORAGE_KEY = 'chatArchives';
const MAX_ARCHIVES = 100;
const MAX_MESSAGES_PER_SESSION = 50;
const TOTAL_STORAGE_LIMIT = 10 * 1024 * 1024; // 10MB

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 从消息中生成对话标题
 */
function generateTitle(messages: Message[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (firstUserMessage) {
    const content = firstUserMessage.content.trim();
    // 截取前 30 个字符作为标题
    return content.length > 30 ? content.substring(0, 30) + '...' : content;
  }
  return `对话 ${new Date().toLocaleDateString('zh-CN')}`;
}

/**
 * ChatArchiveManager 类
 */
export class ChatArchiveManager {
  /**
   * 获取所有存档
   */
  async getArchives(): Promise<ChatSession[]> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const archives = result[STORAGE_KEY] || [];
      // 按更新时间降序排列
      return archives.sort((a: ChatSession, b: ChatSession) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('[ChatArchiveManager] Failed to get archives:', error);
      return [];
    }
  }

  /**
   * 存档当前对话
   */
  async archiveSession(messages: Message[], existingId?: string): Promise<ChatSession> {
    try {
      const archives = await this.getArchives();
      
      // 限制消息数量
      const limitedMessages = messages.slice(-MAX_MESSAGES_PER_SESSION);
      
      const now = Date.now();
      let session: ChatSession;
      
      if (existingId) {
        // 更新现有存档
        const existingIndex = archives.findIndex(a => a.id === existingId);
        if (existingIndex >= 0) {
          session = {
            ...archives[existingIndex],
            messages: limitedMessages,
            updatedAt: now,
          };
          archives[existingIndex] = session;
        } else {
          // 如果找不到，创建新的
          session = {
            id: existingId,
            title: generateTitle(limitedMessages),
            createdAt: now,
            updatedAt: now,
            messages: limitedMessages,
            isArchived: true,
          };
          archives.unshift(session);
        }
      } else {
        // 创建新存档
        session = {
          id: generateId(),
          title: generateTitle(limitedMessages),
          createdAt: now,
          updatedAt: now,
          messages: limitedMessages,
          isArchived: true,
        };
        archives.unshift(session);
      }
      
      // 自动清理旧存档
      const prunedArchives = archives.slice(0, MAX_ARCHIVES);
      
      await chrome.storage.local.set({ [STORAGE_KEY]: prunedArchives });
      
      return session;
    } catch (error) {
      console.error('[ChatArchiveManager] Failed to archive session:', error);
      throw error;
    }
  }

  /**
   * 恢复存档到当前对话
   */
  async restoreSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const archives = await this.getArchives();
      const session = archives.find(a => a.id === sessionId);
      
      if (!session) {
        console.warn('[ChatArchiveManager] Session not found:', sessionId);
        return null;
      }
      
      return session;
    } catch (error) {
      console.error('[ChatArchiveManager] Failed to restore session:', error);
      return null;
    }
  }

  /**
   * 删除存档
   */
  async deleteArchive(sessionId: string): Promise<boolean> {
    try {
      const archives = await this.getArchives();
      const filteredArchives = archives.filter(a => a.id !== sessionId);
      
      if (filteredArchives.length === archives.length) {
        console.warn('[ChatArchiveManager] Session not found for deletion:', sessionId);
        return false;
      }
      
      await chrome.storage.local.set({ [STORAGE_KEY]: filteredArchives });
      return true;
    } catch (error) {
      console.error('[ChatArchiveManager] Failed to delete archive:', error);
      return false;
    }
  }

  /**
   * 更新存档标题
   */
  async updateTitle(sessionId: string, newTitle: string): Promise<boolean> {
    try {
      const archives = await this.getArchives();
      const index = archives.findIndex(a => a.id === sessionId);
      
      if (index < 0) {
        return false;
      }
      
      archives[index].title = newTitle;
      archives[index].updatedAt = Date.now();
      
      await chrome.storage.local.set({ [STORAGE_KEY]: archives });
      return true;
    } catch (error) {
      console.error('[ChatArchiveManager] Failed to update title:', error);
      return false;
    }
  }

  /**
   * 清理旧存档（超出容量时）
   */
  async pruneOldArchives(): Promise<number> {
    try {
      const archives = await this.getArchives();
      
      if (archives.length <= MAX_ARCHIVES) {
        return 0;
      }
      
      const prunedArchives = archives.slice(0, MAX_ARCHIVES);
      const removedCount = archives.length - prunedArchives.length;
      
      await chrome.storage.local.set({ [STORAGE_KEY]: prunedArchives });
      
      return removedCount;
    } catch (error) {
      console.error('[ChatArchiveManager] Failed to prune archives:', error);
      return 0;
    }
  }

  /**
   * 清空所有存档
   */
  async clearAllArchives(): Promise<boolean> {
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
      return true;
    } catch (error) {
      console.error('[ChatArchiveManager] Failed to clear archives:', error);
      return false;
    }
  }

  /**
   * 获取存储使用情况
   */
  async getStorageUsage(): Promise<StorageUsage> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const archives = result[STORAGE_KEY] || [];
      const used = new Blob([JSON.stringify(archives)]).size;
      
      return {
        used,
        total: TOTAL_STORAGE_LIMIT,
        percentage: Math.round((used / TOTAL_STORAGE_LIMIT) * 100),
      };
    } catch (error) {
      console.error('[ChatArchiveManager] Failed to get storage usage:', error);
      return {
        used: 0,
        total: TOTAL_STORAGE_LIMIT,
        percentage: 0,
      };
    }
  }

  /**
   * 格式化存储大小
   */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

// 导出单例
export const chatArchiveManager = new ChatArchiveManager();
