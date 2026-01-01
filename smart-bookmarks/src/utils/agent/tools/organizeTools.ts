/**
 * 整理工具 (Organize Tools)
 * 提供书签的分析和分类建议功能
 * 
 * 重要：这些工具只提供分析和建议，不会修改 Chrome 视图的文件夹结构
 * 实际的分类操作由 classifyTools 中的 batch_move_to_ai_folders 完成
 */

import { Tool, ToolResult } from '../types';
import { useBookmarkStore } from '../../../sidebar/store/bookmarkStore';
import type { IBookmark } from '../../../types/bookmark';

/**
 * 推荐分类方案工具
 * 基于已有的 AI 标签分析书签，生成分类建议
 * Agent 应该先调用此工具，然后向用户展示方案，确认后再执行
 */
export const suggestOrganizationPlanTool: Tool = {
  name: 'suggest_organization_plan',
  description: `基于书签的 AI 标签，生成分类方案建议。

使用流程：
1. 先调用 get_all_bookmarks_for_organize 获取书签概览表格
2. 调用此工具生成分类方案
3. 向用户展示方案，询问是否需要调整
4. 用户确认后，调用 batch_move_to_ai_folders 执行

返回内容：
- 建议的文件夹结构
- 每个文件夹包含哪些书签
- 未能分类的书签（需要先 AI 分析）`,
  parameters: {
    type: 'object',
    properties: {
      maxFolders: {
        type: 'number',
        description: '最多创建的文件夹数量，默认 10',
        minimum: 1,
        maximum: 20,
        default: 10,
      },
      minBookmarksPerFolder: {
        type: 'number',
        description: '每个文件夹至少需要的书签数量，默认 2',
        minimum: 1,
        maximum: 10,
        default: 2,
      },
    },
    additionalProperties: false,
  },
  execute: async (params: {
    maxFolders?: number;
    minBookmarksPerFolder?: number;
  } = {}): Promise<ToolResult> => {
    try {
      const { maxFolders = 10, minBookmarksPerFolder = 2 } = params;
      const store = useBookmarkStore.getState();

      const bookmarks = store.bookmarks.filter(b => b.status !== 'deleted');

      if (bookmarks.length === 0) {
        return { success: false, error: '没有可分析的书签' };
      }

      // 统计标签频率
      const tagCounts = new Map<string, IBookmark[]>();
      const unanalyzedBookmarks: IBookmark[] = [];

      bookmarks.forEach(bookmark => {
        const tags = bookmark.aiTags || [];
        if (tags.length === 0) {
          unanalyzedBookmarks.push(bookmark);
          return;
        }
        
        // 使用第一个标签作为主分类
        const primaryTag = tags[0];
        if (!tagCounts.has(primaryTag)) {
          tagCounts.set(primaryTag, []);
        }
        tagCounts.get(primaryTag)!.push(bookmark);
      });

      // 筛选有效分类（达到最小书签数）
      const validCategories = Array.from(tagCounts.entries())
        .filter(([_, bms]) => bms.length >= minBookmarksPerFolder)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, maxFolders);

      // 生成方案文本
      let plan = `📋 分类方案建议\n`;
      plan += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (validCategories.length === 0) {
        plan += `⚠️ 没有足够的书签形成分类。\n`;
        plan += `建议：先让用户点击"AI 智能分析"按钮分析书签。\n`;
      } else {
        plan += `📁 建议创建 ${validCategories.length} 个文件夹：\n\n`;

        const moves: Array<{ bookmarkId: string; targetPath: string; title: string }> = [];

        validCategories.forEach(([category, bms], index) => {
          const folderPath = `/${category}`;
          plan += `${index + 1}. ${folderPath} (${bms.length}个书签)\n`;
          
          bms.slice(0, 5).forEach(b => {
            plan += `   - ${b.title}\n`;
            moves.push({ bookmarkId: b.id, targetPath: folderPath, title: b.title });
          });
          
          if (bms.length > 5) {
            plan += `   - ...还有 ${bms.length - 5} 个\n`;
            bms.slice(5).forEach(b => {
              moves.push({ bookmarkId: b.id, targetPath: folderPath, title: b.title });
            });
          }
          plan += `\n`;
        });

        // 统计未分类的
        const categorizedIds = new Set(moves.map(m => m.bookmarkId));
        const remainingBookmarks = bookmarks.filter(b => !categorizedIds.has(b.id));

        if (remainingBookmarks.length > 0) {
          plan += `\n📌 未分类书签 (${remainingBookmarks.length}个)\n`;
          plan += `这些书签没有足够的标签信息，建议先进行 AI 分析：\n`;
          remainingBookmarks.slice(0, 5).forEach(b => {
            plan += `   - ${b.title}\n`;
          });
          if (remainingBookmarks.length > 5) {
            plan += `   - ...还有 ${remainingBookmarks.length - 5} 个\n`;
          }
        }

        plan += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        plan += `💡 如果方案合适，请确认后我会执行分类。\n`;
        plan += `   如需调整（如合并文件夹、修改名称），请告诉我。\n`;

        return {
          success: true,
          data: {
            plan,
            suggestedFolders: validCategories.map(([cat, bms]) => ({
              path: `/${cat}`,
              bookmarkCount: bms.length,
            })),
            moves,
            unanalyzedCount: unanalyzedBookmarks.length,
            totalCategorized: moves.length,
          },
        };
      }

      return {
        success: true,
        data: {
          plan,
          suggestedFolders: [],
          moves: [],
          unanalyzedCount: unanalyzedBookmarks.length,
          totalCategorized: 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to suggest organization plan',
      };
    }
  },
};

/**
 * 搜索相关书签工具
 * 根据关键词搜索书签，用于收集特定主题的书签
 */
export const searchRelatedBookmarksTool: Tool = {
  name: 'search_related_bookmarks',
  description: `根据关键词搜索相关书签。

用于：
- 找出特定主题的书签
- 为用户收集某个技术/话题的资源
- 在分类前了解书签内容`,
  parameters: {
    type: 'object',
    properties: {
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: '搜索关键词',
      },
      matchMode: {
        type: 'string',
        enum: ['any', 'all'],
        description: '匹配模式：any（任一关键词）或 all（所有关键词）',
        default: 'any',
      },
    },
    required: ['keywords'],
    additionalProperties: false,
  },
  execute: async (params: {
    keywords: string[];
    matchMode?: 'any' | 'all';
  }): Promise<ToolResult> => {
    try {
      const { keywords, matchMode = 'any' } = params;
      const store = useBookmarkStore.getState();

      if (!keywords || keywords.length === 0) {
        return { success: false, error: '请提供至少一个关键词' };
      }

      const keywordsLower = keywords.map(k => k.toLowerCase());

      const matchedBookmarks = store.bookmarks.filter(bookmark => {
        if (bookmark.status === 'deleted') return false;

        const searchText = [
          bookmark.title,
          bookmark.url,
          bookmark.aiSummary || '',
          ...(bookmark.aiTags || []),
          ...(bookmark.userTags || []),
        ].join(' ').toLowerCase();

        if (matchMode === 'all') {
          return keywordsLower.every(kw => searchText.includes(kw));
        } else {
          return keywordsLower.some(kw => searchText.includes(kw));
        }
      });

      return {
        success: true,
        data: {
          count: matchedBookmarks.length,
          bookmarks: matchedBookmarks.map(b => ({
            id: b.id,
            title: b.title,
            url: b.url,
            aiTags: b.aiTags,
            aiSummary: b.aiSummary,
          })),
          message: `找到 ${matchedBookmarks.length} 个与 "${keywords.join(', ')}" 相关的书签`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search bookmarks',
      };
    }
  },
};

// 导出所有整理工具
export const organizeTools: Tool[] = [
  suggestOrganizationPlanTool,
  searchRelatedBookmarksTool,
];
