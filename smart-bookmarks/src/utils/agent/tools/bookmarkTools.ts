/**
 * 书签工具 (Bookmark Tools)
 * 提供书签的搜索、添加、删除、编辑等操作
 */

import { Tool, ToolResult } from '../types';
import { useBookmarkStore } from '../../../sidebar/store/bookmarkStore';
import type { IBookmark } from '../../../types/bookmark';



/**
 * 搜索书签工具
 * 搜索 title, URL, tags, summary, category 字段
 */
export const searchBookmarksTool: Tool = {
  name: 'search_bookmarks',
  description: '在用户的书签库中搜索书签。可以搜索标题、URL、标签、摘要和分类。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词',
      },
      limit: {
        type: 'number',
        description: '返回结果数量限制，默认 10',
        minimum: 1,
        maximum: 100,
        default: 10,
      },
      filters: {
        type: 'object',
        description: '可选的过滤条件（对象类型，包含 starred、category、tag 字段）',
        properties: {
          starred: {
            type: 'boolean',
            description: '只搜索星标书签',
          },
          category: {
            type: 'string',
            description: '按分类过滤',
          },
          tag: {
            type: 'string',
            description: '按标签过滤',
          },
        },
        additionalProperties: false,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (params: {
    query: string;
    limit?: number;
    filters?: {
      starred?: boolean;
      category?: string;
      tag?: string;
    };
  }): Promise<ToolResult> => {
    try {
      const { query, limit = 10, filters } = params;
      const store = useBookmarkStore.getState();
      const queryLower = query.toLowerCase();

      // 搜索所有字段
      let results = store.bookmarks.filter(bookmark => {
        // 排除已删除的书签
        if (bookmark.status === 'deleted') return false;

        // 搜索匹配
        const searchText = [
          bookmark.title,
          bookmark.url,
          bookmark.aiSummary || '',
          bookmark.aiCategory || '',
          ...(bookmark.aiTags || []),
          ...(bookmark.userTags || []),
        ].join(' ').toLowerCase();

        const matches = searchText.includes(queryLower);
        if (!matches) return false;

        // 应用过滤器
        if (filters?.starred && !bookmark.starred) return false;
        if (filters?.category && bookmark.aiCategory !== filters.category) return false;
        if (filters?.tag) {
          const hasTag = bookmark.aiTags?.includes(filters.tag) ||
            bookmark.userTags?.includes(filters.tag);
          if (!hasTag) return false;
        }

        return true;
      });

      // 限制结果数量
      results = results.slice(0, limit);

      // 格式化结果
      const formattedResults = results.map(b => ({
        id: b.id,
        title: b.title,
        url: b.url,
        category: b.aiCategory,
        tags: [...(b.aiTags || []), ...(b.userTags || [])],
        summary: b.aiSummary,
        starred: b.starred,
        folderPath: b.folderPath,
      }));

      return {
        success: true,
        data: {
          query,
          count: results.length,
          results: formattedResults,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
      };
    }
  },
};

/**
 * 添加书签工具
 */
export const addBookmarkTool: Tool = {
  name: 'add_bookmark',
  description: '添加新书签到书签库。可以指定标题、URL、文件夹和标签。',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '书签 URL（必须是有效的 HTTP/HTTPS URL）',
      },
      title: {
        type: 'string',
        description: '书签标题（可选，默认使用页面标题）',
      },
      folderId: {
        type: 'string',
        description: '目标文件夹 ID（可选，默认为根文件夹）',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '用户标签数组（可选）',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  execute: async (params: {
    url: string;
    title?: string;
    folderId?: string;
    tags?: string[];
  }): Promise<ToolResult> => {
    try {
      const { url, title, folderId, tags } = params;
      const store = useBookmarkStore.getState();

      // 检查是否已存在
      const exists = store.bookmarks.some(b => b.url === url && b.status !== 'deleted');
      if (exists) {
        return {
          success: false,
          error: '该 URL 已存在于书签库中',
        };
      }

      // 创建新书签
      const newBookmark: IBookmark = {
        id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url,
        title: title || url,
        folderId: folderId || 'folder-/',
        folderPath: folderId ? folderId.replace('folder-', '') : '/',
        userTags: tags || [],
        aiTags: [],
        starred: false,
        pinned: false,
        createTime: Date.now(),
        updateTime: Date.now(),
        status: 'active',
        analytics: {
          visitCount: 0,
          importance: 50,
        },
      };

      await store.addBookmark(newBookmark);

      // Store now handles persistence automatically

      return {
        success: true,
        data: {
          id: newBookmark.id,
          title: newBookmark.title,
          url: newBookmark.url,
          message: `已添加书签: ${newBookmark.title}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add bookmark',
      };
    }
  },
};

/**
 * 删除书签工具（软删除）
 */
export const deleteBookmarkTool: Tool = {
  name: 'delete_bookmark',
  description: '删除书签（移动到回收站）。可以通过书签 ID 删除指定书签。',
  parameters: {
    type: 'object',
    properties: {
      bookmarkId: {
        type: 'string',
        description: '要删除的书签 ID',
      },
    },
    required: ['bookmarkId'],
    additionalProperties: false,
  },
  execute: async (params: { bookmarkId: string }): Promise<ToolResult> => {
    try {
      const { bookmarkId } = params;
      const store = useBookmarkStore.getState();

      const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) {
        return {
          success: false,
          error: '书签不存在',
        };
      }

      if (bookmark.status === 'deleted') {
        return {
          success: false,
          error: '书签已在回收站中',
        };
      }

      // 软删除
      store.deleteBookmark(bookmarkId);

      // Store now handles persistence automatically

      return {
        success: true,
        data: {
          id: bookmarkId,
          title: bookmark.title,
          message: `已将书签 "${bookmark.title}" 移动到回收站`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete bookmark',
      };
    }
  },
};

/**
 * 编辑书签工具
 */
export const editBookmarkTool: Tool = {
  name: 'edit_bookmark',
  description: '编辑书签的标题、标签或其他属性。可以更新标题、用户标签、用户备注等字段。',
  parameters: {
    type: 'object',
    properties: {
      bookmarkId: {
        type: 'string',
        description: '要编辑的书签 ID',
      },
      updates: {
        type: 'object',
        description: '要更新的字段（对象类型，包含 title、userTags、userNotes 等字段）',
        properties: {
          title: { type: 'string', description: '新标题' },
          userTags: {
            type: 'array',
            items: { type: 'string' },
            description: '新标签列表',
          },
          userNotes: { type: 'string', description: '用户备注' },
        },
        additionalProperties: false,
      },
    },
    required: ['bookmarkId', 'updates'],
    additionalProperties: false,
  },
  execute: async (params: {
    bookmarkId: string;
    updates: Partial<IBookmark>;
  }): Promise<ToolResult> => {
    try {
      const { bookmarkId, updates } = params;
      const store = useBookmarkStore.getState();

      const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) {
        return {
          success: false,
          error: '书签不存在',
        };
      }

      // 只允许更新特定字段
      const allowedUpdates: Partial<IBookmark> = {};
      if (updates.title) allowedUpdates.title = updates.title;
      if (updates.userTags) allowedUpdates.userTags = updates.userTags;
      if (updates.userNotes) allowedUpdates.userNotes = updates.userNotes;
      if (updates.userTitle) allowedUpdates.userTitle = updates.userTitle;

      await store.updateBookmark(bookmarkId, {
        ...allowedUpdates,
        updateTime: Date.now(),
      });

      // Store now handles persistence automatically

      return {
        success: true,
        data: {
          id: bookmarkId,
          title: updates.title || bookmark.title,
          message: `已更新书签 "${updates.title || bookmark.title}"`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to edit bookmark',
      };
    }
  },
};

/**
 * 星标书签工具
 */
export const starBookmarkTool: Tool = {
  name: 'star_bookmark',
  description: '切换书签的星标状态。如果书签已星标则取消星标，否则添加星标。',
  parameters: {
    type: 'object',
    properties: {
      bookmarkId: {
        type: 'string',
        description: '要切换星标的书签 ID',
      },
    },
    required: ['bookmarkId'],
    additionalProperties: false,
  },
  execute: async (params: { bookmarkId: string }): Promise<ToolResult> => {
    try {
      const { bookmarkId } = params;
      const store = useBookmarkStore.getState();

      const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) {
        return {
          success: false,
          error: '书签不存在',
        };
      }

      const newStarred = !bookmark.starred;
      await store.updateBookmark(bookmarkId, {
        starred: newStarred,
        updateTime: Date.now(),
      });

      // Store now handles persistence automatically

      return {
        success: true,
        data: {
          id: bookmarkId,
          title: bookmark.title,
          starred: newStarred,
          message: newStarred
            ? `已为 "${bookmark.title}" 添加星标`
            : `已取消 "${bookmark.title}" 的星标`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to toggle star',
      };
    }
  },
};

/**
 * 恢复书签工具
 */
export const restoreBookmarkTool: Tool = {
  name: 'restore_bookmark',
  description: '从回收站恢复已删除的书签。只能恢复状态为 deleted 的书签。',
  parameters: {
    type: 'object',
    properties: {
      bookmarkId: {
        type: 'string',
        description: '要恢复的书签 ID',
      },
    },
    required: ['bookmarkId'],
    additionalProperties: false,
  },
  execute: async (params: { bookmarkId: string }): Promise<ToolResult> => {
    try {
      const { bookmarkId } = params;
      const store = useBookmarkStore.getState();

      const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) {
        return {
          success: false,
          error: '书签不存在',
        };
      }

      if (bookmark.status !== 'deleted') {
        return {
          success: false,
          error: '书签不在回收站中',
        };
      }

      store.restoreBookmark(bookmarkId);

      // Store now handles persistence automatically

      return {
        success: true,
        data: {
          id: bookmarkId,
          title: bookmark.title,
          message: `已恢复书签 "${bookmark.title}"`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to restore bookmark',
      };
    }
  },
};

/**
 * 打开书签工具
 */
export const openBookmarkTool: Tool = {
  name: 'open_bookmark',
  description: '在新标签页中打开书签。会自动更新访问统计。',
  parameters: {
    type: 'object',
    properties: {
      bookmarkId: {
        type: 'string',
        description: '要打开的书签 ID',
      },
    },
    required: ['bookmarkId'],
    additionalProperties: false,
  },
  execute: async (params: { bookmarkId: string }): Promise<ToolResult> => {
    try {
      const { bookmarkId } = params;
      const store = useBookmarkStore.getState();

      const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) {
        return {
          success: false,
          error: '书签不存在',
        };
      }

      // 在新标签页打开
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        await chrome.tabs.create({ url: bookmark.url });
      }

      // 更新访问统计
      await store.updateBookmark(bookmarkId, {
        analytics: {
          ...bookmark.analytics,
          visitCount: bookmark.analytics.visitCount + 1,
          lastVisit: Date.now(),
        },
      });

      return {
        success: true,
        data: {
          id: bookmarkId,
          title: bookmark.title,
          url: bookmark.url,
          message: `已打开 "${bookmark.title}"`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open bookmark',
      };
    }
  },
};

// 导出所有书签工具
export const bookmarkTools: Tool[] = [
  searchBookmarksTool,
  addBookmarkTool,
  deleteBookmarkTool,
  editBookmarkTool,
  starBookmarkTool,
  restoreBookmarkTool,
  openBookmarkTool,
];
