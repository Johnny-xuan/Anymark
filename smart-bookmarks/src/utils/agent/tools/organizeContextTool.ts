/**
 * 整理上下文工具 (Organize Context Tool)
 * 让 Agent 像图书管理员一样，一眼看到图书馆全貌
 * 
 * 设计原则：
 * 1. 表格由代码预先生成，不让 AI 做格式化工作
 * 2. 按用户原有文件夹分组，生成多个表格
 * 3. 清晰标注已分析/未分析状态，让 AI 决定是否需要先分析
 */

import { Tool, ToolResult } from '../types';
import { useBookmarkStore } from '../../../sidebar/store/bookmarkStore';
import type { IBookmark } from '../../../types/bookmark';

/**
 * 从 URL 提取域名
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url.slice(0, 30);
  }
}

/**
 * 截断字符串
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * 检查书签是否已分析（有 aiSummary 或 aiTags）
 */
function isAnalyzed(bookmark: IBookmark): boolean {
  return !!(
    (bookmark.aiSummary && bookmark.aiSummary.trim() !== '') ||
    (bookmark.aiTags && bookmark.aiTags.length > 0)
  );
}

/**
 * 生成单个文件夹的表格
 */
function generateFolderTable(folderPath: string, bookmarks: IBookmark[]): string {
  const folderName = folderPath === '/' ? '未分类' : folderPath;
  const analyzedInFolder = bookmarks.filter(isAnalyzed).length;
  const unanalyzedInFolder = bookmarks.length - analyzedInFolder;
  
  let table = `\n📁 ${folderName} (${bookmarks.length}个`;
  if (unanalyzedInFolder > 0) {
    table += `, ⚠️${unanalyzedInFolder}个未分析`;
  }
  table += `)\n`;
  table += `| # | 标题 | 域名 | AI标签 | 状态 |\n`;
  table += `|---|------|------|--------|------|\n`;
  
  bookmarks.forEach((bookmark, index) => {
    const title = truncate(bookmark.title, 25);
    const domain = truncate(extractDomain(bookmark.url), 20);
    const tags = bookmark.aiTags && bookmark.aiTags.length > 0 
      ? bookmark.aiTags.slice(0, 3).join(', ') 
      : '-';
    const status = isAnalyzed(bookmark) ? '✅' : '⚠️';
    
    table += `| ${index + 1} | ${title} | ${domain} | ${tags} | ${status} |\n`;
  });
  
  return table;
}

/**
 * 统计高频标签
 */
function getTopTags(bookmarks: IBookmark[], limit: number = 5): { tag: string; count: number }[] {
  const tagCounts = new Map<string, number>();
  
  bookmarks.forEach(bookmark => {
    const allTags = [...(bookmark.aiTags || []), ...(bookmark.userTags || [])];
    allTags.forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  
  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * 获取所有书签用于整理 - 返回格式化的表格概览
 */
export const getAllBookmarksForOrganizeTool: Tool = {
  name: 'get_all_bookmarks_for_organize',
  description: `获取书签库的完整概览，用于规划 AI 分类方案。

返回内容：
- 按用户原有文件夹分组的表格，每个表格显示：序号、标题、域名、AI标签、分析状态
- 统计信息：总数、已分析数、未分析数、高频标签

工作流程：
1. 调用此工具获取概览
2. 如果有大量未分析书签（⚠️标记），建议用户先进行 AI 智能分析
3. 基于已有的 AI 标签，提出分类方案（要创建哪些文件夹、每个书签放哪里）
4. 和用户确认方案后，再批量执行分类

注意：不要直接开始分类，先提出方案让用户确认！`,
  parameters: {
    type: 'object',
    properties: {
      includeDeleted: {
        type: 'boolean',
        description: '是否包含已删除的书签（回收站），默认 false',
        default: false,
      },
    },
    additionalProperties: false,
  },
  execute: async (params: {
    includeDeleted?: boolean;
  } = {}): Promise<ToolResult> => {
    try {
      const { includeDeleted = false } = params;
      const store = useBookmarkStore.getState();

      // 获取活跃书签
      const bookmarks = store.bookmarks.filter(b => 
        includeDeleted ? true : b.status !== 'deleted'
      );

      if (bookmarks.length === 0) {
        return {
          success: true,
          data: {
            overview: '📚 书签库为空，没有可整理的书签。',
            totalBookmarks: 0,
            analyzedCount: 0,
            unanalyzedCount: 0,
          },
        };
      }

      // 统计
      const analyzedCount = bookmarks.filter(isAnalyzed).length;
      const unanalyzedCount = bookmarks.length - analyzedCount;
      const topTags = getTopTags(bookmarks, 8);

      // 按文件夹分组
      const bookmarksByFolder = new Map<string, IBookmark[]>();
      bookmarks.forEach(bookmark => {
        const folderPath = bookmark.folderPath || '/';
        if (!bookmarksByFolder.has(folderPath)) {
          bookmarksByFolder.set(folderPath, []);
        }
        bookmarksByFolder.get(folderPath)!.push(bookmark);
      });

      // 生成概览文本
      let overview = `📚 书签库概览\n`;
      overview += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      // 按文件夹路径排序，根目录放最后
      const sortedPaths = Array.from(bookmarksByFolder.keys()).sort((a, b) => {
        if (a === '/') return 1;
        if (b === '/') return -1;
        return a.localeCompare(b);
      });

      // 生成每个文件夹的表格
      sortedPaths.forEach(folderPath => {
        const folderBookmarks = bookmarksByFolder.get(folderPath)!;
        overview += generateFolderTable(folderPath, folderBookmarks);
      });

      // 统计信息
      overview += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      overview += `📊 统计\n`;
      overview += `- 总计：${bookmarks.length} 个书签\n`;
      overview += `- 已分析：${analyzedCount} 个 ✅\n`;
      overview += `- 未分析：${unanalyzedCount} 个 ⚠️\n`;
      
      if (topTags.length > 0) {
        const tagStr = topTags.map(t => `${t.tag}(${t.count})`).join(', ');
        overview += `- 高频标签：${tagStr}\n`;
      }

      // 建议
      if (unanalyzedCount > 0) {
        const ratio = unanalyzedCount / bookmarks.length;
        if (ratio > 0.5) {
          overview += `\n⚠️ 建议：${Math.round(ratio * 100)}% 的书签尚未分析，建议先让用户点击"AI 智能分析"按钮进行批量分析，这样分类会更准确。\n`;
        } else if (unanalyzedCount > 0) {
          overview += `\n💡 提示：有 ${unanalyzedCount} 个书签未分析，可以先分析这些书签再进行分类。\n`;
        }
      }

      // 返回结构化数据 + 格式化概览
      return {
        success: true,
        data: {
          overview,
          totalBookmarks: bookmarks.length,
          analyzedCount,
          unanalyzedCount,
          topTags,
          folderCount: bookmarksByFolder.size,
          // 提供未分析书签的 ID 列表，方便 Agent 调用分析工具
          unanalyzedBookmarkIds: bookmarks
            .filter(b => !isAnalyzed(b))
            .map(b => ({ id: b.id, title: b.title, url: b.url })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get bookmarks for organize',
      };
    }
  },
};

// 导出
export const organizeContextTools: Tool[] = [
  getAllBookmarksForOrganizeTool,
];
