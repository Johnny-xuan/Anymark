/**
 * 分类工具 (Classify Tools)
 * 让 Agent 能够管理 AI 分类视图中的书签
 * 
 * 重要设计原则：
 * 1. Chrome 视图（folderPath）：Agent 只读，不能修改
 * 2. AI 分类视图（aiFolderPath）：Agent 可读写，独立的虚拟文件夹结构
 * 3. 两个视图共享书签数据，但有各自独立的文件夹结构
 * 
 * 工作流程：
 * 1. Agent 调用 get_all_bookmarks_for_organize 获取概览表格
 * 2. Agent 提出分类方案，和用户确认
 * 3. 用户确认后，Agent 调用 batch_move_to_ai_folders 批量执行
 */

import { Tool, ToolResult } from '../types';
import { useBookmarkStore } from '../../../sidebar/store/bookmarkStore';
import type { IBookmark } from '../../../types/bookmark';

/**
 * 持久化书签到 Chrome Storage
 */
async function persistBookmarks(): Promise<void> {
  try {
    const store = useBookmarkStore.getState();
    await chrome.storage.local.set({ bookmarks: store.bookmarks });
    console.log('[ClassifyTools] Persisted bookmarks to storage');
    
    // 通知 Sidebar 刷新书签列表
    chrome.runtime.sendMessage({ type: 'BOOKMARKS_UPDATED' }).catch(() => {
      // Sidebar 可能没有打开，忽略错误
    });
  } catch (error) {
    console.error('[ClassifyTools] Failed to persist bookmarks:', error);
  }
}

/**
 * 获取书签当前的 AI 文件夹路径（兼容旧数据）
 */
function getCurrentAIFolderPath(bookmark: IBookmark): string {
  if (bookmark.aiFolderPath && bookmark.aiFolderPath.trim() !== '') {
    return bookmark.aiFolderPath;
  }
  if (bookmark.aiCategory && bookmark.aiCategory.trim() !== '') {
    return `/${bookmark.aiCategory}`;
  }
  return '未分类';
}


/**
 * 批量移动书签到 AI 文件夹
 * 这是 Agent 分类书签的主要工具
 */
export const batchMoveToAIFoldersTool: Tool = {
  name: 'batch_move_to_ai_folders',
  description: `批量将书签移动到 AI 分类视图的文件夹中。

这是 Agent 整理书签的主要工具。使用前请先：
1. 调用 get_all_bookmarks_for_organize 获取书签概览
2. 向用户提出分类方案（要创建哪些文件夹、每个书签放哪里）
3. 用户确认后再调用此工具执行

参数说明：
- moves: 移动操作数组，每个操作包含 bookmarkId 和 targetPath
- targetPath: AI 文件夹路径，如 "/Frontend/React" 或 "/Backend/Python"

注意：
- 这只影响 AI 分类视图，不会修改 Chrome 原生书签的位置
- 同一个书签可以在 Chrome 视图和 AI 视图有不同的文件夹位置`,
  parameters: {
    type: 'object',
    properties: {
      moves: {
        type: 'array',
        description: '移动操作数组（最多 100 个）',
        items: {
          type: 'object',
          properties: {
            bookmarkId: {
              type: 'string',
              description: '书签 ID',
            },
            targetPath: {
              type: 'string',
              description: 'AI 文件夹路径，如 "/Frontend/React"',
            },
          },
          required: ['bookmarkId', 'targetPath'],
          additionalProperties: false,
        },
      },
    },
    required: ['moves'],
    additionalProperties: false,
  },
  execute: async (params: {
    moves: Array<{ bookmarkId: string; targetPath: string }>;
  }): Promise<ToolResult> => {
    try {
      const { moves } = params;
      const store = useBookmarkStore.getState();
      
      if (moves.length > 100) {
        return { success: false, error: '单次最多移动 100 个书签' };
      }

      const results: Array<{
        id: string;
        title: string;
        from: string;
        to: string;
        success: boolean;
        reason?: string;
      }> = [];
      
      let successCount = 0;
      let failCount = 0;

      for (const move of moves) {
        const bookmark = store.bookmarks.find(b => b.id === move.bookmarkId);
        
        if (!bookmark) {
          results.push({
            id: move.bookmarkId,
            title: 'Unknown',
            from: '-',
            to: move.targetPath,
            success: false,
            reason: '书签不存在',
          });
          failCount++;
          continue;
        }

        // 规范化路径（确保以 / 开头）
        let targetPath = move.targetPath.trim();
        if (!targetPath.startsWith('/')) {
          targetPath = '/' + targetPath;
        }

        const currentPath = getCurrentAIFolderPath(bookmark);
        const aiFolderId = `ai-folder-${targetPath}`;

        // 更新书签的 AI 文件夹路径
        await store.updateBookmark(move.bookmarkId, {
          aiFolderPath: targetPath,
          aiFolderId: aiFolderId,
          aiCategory: targetPath.split('/').filter(Boolean)[0] || undefined,
          updateTime: Date.now(),
        });

        results.push({
          id: move.bookmarkId,
          title: bookmark.title,
          from: currentPath,
          to: targetPath,
          success: true,
        });
        successCount++;
      }

      await persistBookmarks();

      // 生成结果摘要
      const summary: Record<string, string[]> = {};
      results.filter(r => r.success).forEach(r => {
        if (!summary[r.to]) summary[r.to] = [];
        summary[r.to].push(r.title);
      });

      let message = `✅ 成功移动 ${successCount} 个书签`;
      if (failCount > 0) message += `，${failCount} 个失败`;
      message += '\n\n📁 分类结果：\n';
      
      Object.entries(summary).forEach(([path, titles]) => {
        message += `${path} (${titles.length}个)\n`;
        titles.slice(0, 3).forEach(t => { message += `  - ${t}\n`; });
        if (titles.length > 3) message += `  - ...还有 ${titles.length - 3} 个\n`;
      });

      return {
        success: true,
        data: { totalMoves: moves.length, successCount, failCount, results, summary, message },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to batch move bookmarks',
      };
    }
  },
};


/**
 * 更新书签的 AI 元数据（标签、摘要等）
 */
export const updateBookmarkMetadataTool: Tool = {
  name: 'update_bookmark_metadata',
  description: `更新书签的 AI 元数据（标签、摘要、难度等）。

注意：此工具不用于分类/移动书签，只用于更新元数据。
如需移动书签到 AI 文件夹，请使用 batch_move_to_ai_folders。`,
  parameters: {
    type: 'object',
    properties: {
      bookmarkId: { type: 'string', description: '书签 ID' },
      updates: {
        type: 'object',
        description: '要更新的字段',
        properties: {
          aiTags: { type: 'array', items: { type: 'string' }, description: 'AI 标签' },
          aiSummary: { type: 'string', description: 'AI 摘要' },
          aiDifficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], description: '难度级别' },
          aiTechStack: { type: 'array', items: { type: 'string' }, description: '技术栈' },
        },
        additionalProperties: false,
      },
    },
    required: ['bookmarkId', 'updates'],
    additionalProperties: false,
  },
  execute: async (params: {
    bookmarkId: string;
    updates: {
      aiTags?: string[];
      aiSummary?: string;
      aiDifficulty?: 'beginner' | 'intermediate' | 'advanced';
      aiTechStack?: string[];
    };
  }): Promise<ToolResult> => {
    try {
      const { bookmarkId, updates } = params;
      const store = useBookmarkStore.getState();

      const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) {
        return { success: false, error: `书签不存在: ${bookmarkId}` };
      }

      const allowedUpdates: Partial<IBookmark> = {};
      if (updates.aiTags !== undefined) allowedUpdates.aiTags = updates.aiTags;
      if (updates.aiSummary !== undefined) allowedUpdates.aiSummary = updates.aiSummary;
      if (updates.aiDifficulty !== undefined) allowedUpdates.aiDifficulty = updates.aiDifficulty;
      if (updates.aiTechStack !== undefined) allowedUpdates.aiTechStack = updates.aiTechStack;

      if (Object.keys(allowedUpdates).length === 0) {
        return { success: false, error: '没有提供有效的更新字段' };
      }

      await store.updateBookmark(bookmarkId, {
        ...allowedUpdates,
        lastAnalyzed: Date.now(),
        updateTime: Date.now(),
      });

      await persistBookmarks();

      return {
        success: true,
        data: {
          id: bookmarkId,
          title: bookmark.title,
          updatedFields: Object.keys(allowedUpdates),
          message: `已更新书签 "${bookmark.title}" 的元数据`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update bookmark metadata',
      };
    }
  },
};

/**
 * 从 AI 分类视图中移除书签
 */
export const removeFromAICategoryTool: Tool = {
  name: 'remove_from_ai_category',
  description: `从 AI 分类视图中移除书签。移除后书签仍存在于 Chrome 视图。`,
  parameters: {
    type: 'object',
    properties: {
      bookmarkIds: {
        type: 'array',
        items: { type: 'string' },
        description: '要移除的书签 ID 列表',
      },
    },
    required: ['bookmarkIds'],
    additionalProperties: false,
  },
  execute: async (params: { bookmarkIds: string[] }): Promise<ToolResult> => {
    try {
      const { bookmarkIds } = params;
      const store = useBookmarkStore.getState();
      
      let successCount = 0;
      let failCount = 0;

      for (const bookmarkId of bookmarkIds) {
        const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) { failCount++; continue; }

        await store.updateBookmark(bookmarkId, {
          aiFolderPath: undefined,
          aiFolderId: undefined,
          aiCategory: undefined,
          updateTime: Date.now(),
        });
        successCount++;
      }

      await persistBookmarks();

      return {
        success: true,
        data: { successCount, failCount, message: `已从 AI 分类视图移除 ${successCount} 个书签` },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove bookmarks',
      };
    }
  },
};

// 导出所有分类工具
export const classifyTools: Tool[] = [
  batchMoveToAIFoldersTool,
  updateBookmarkMetadataTool,
  removeFromAICategoryTool,
];
