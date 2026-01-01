/**
 * 核心工具集 (Core Tools)
 * 6 个核心工具，通过 action 参数区分操作
 * 
 * 1. context  - 获取上下文（书签概览、文件夹列表、统计）
 * 2. bookmark - 书签操作（增删改查、星标、恢复、打开）
 * 3. organize - AI 分类整理（分析、AI分析、建议、移动、元数据）
 * 4. folder   - 文件夹管理（创建、重命名、删除、移动）
 * 5. search   - 搜索书签（内部搜索）
 * 6. discover - 发现资源（Web、GitHub、Trending、内容提取）
 */

import type { Tool, ToolResult } from '../types';
import { useBookmarkStore } from '../../../sidebar/store/bookmarkStore';
import { extractFullContent, extractFrameworkContent } from '../../contentExtractor';
import { getSearchConfig, fetchWithRetry, OSS_INSIGHT_API, TIMEOUT_CONFIG } from '../config';
import type { IBookmark, IFolder } from '../../../types/bookmark';
import { getDecayStatus, calculateFrecency } from '../../frecencyCalculator';
import { getDefaultAnalyzer } from '../../aiAnalyzer';
import { getBookmarkService } from '../../../services/bookmarkService';
import { getOperationHistoryService } from '../../operationHistory';
import { 
  createConfirmationRequest, 
  confirmOperation, 
  cancelOperation,
  createFolderDeleteConfirmationRequest,
  type BatchOperationItem,
} from '../../batchConfirmation';
import { syncFromV2ToLegacy, notifySidebarRefresh } from '../storeSync';
import * as AgentAPI from '../agentApiAdapter';

// ============================================================================
// 工具函数
// ============================================================================

/** 
 * 刷新数据并通知 Sidebar
 * 新架构：不再需要手动持久化，只需要通知刷新
 */
async function refreshAndNotify(): Promise<void> {
  try {
    await notifySidebarRefresh();
  } catch (error) {
    console.error('[CoreTools] Failed to refresh:', error);
  }
}

/** 从 URL 提取域名 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.slice(0, 30);
  }
}

/** 截断字符串 */
function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 3) + '...';
}

/** 检查书签是否已分析 */
function isAnalyzed(b: IBookmark): boolean {
  return !!((b.aiSummary?.trim()) || (b.aiTags?.length));
}

// ============================================================================
// 1. Context 工具 - 获取上下文
// ============================================================================

export const contextTool: Tool = {
  name: 'context',
  description: `获取书签库上下文信息。

何时使用：
- 在整理书签前，先了解书签库状态 → overview
- 需要知道有哪些文件夹 → folders
- 需要统计信息（总数、标签分布等）→ stats
- 需要按 AI 分类查看书签 → grouped
- 需要按特定视图过滤书签 → filter

操作：
- "overview" - 书签库完整概览（推荐先用这个了解全貌）
- "folders" - 列出所有文件夹及书签数量
- "stats" - 获取统计信息（包含活跃度分布）
- "grouped" - 按 AI 分类分组获取书签
- "filter" - 按视图过滤（chrome/ai_category/starred/recent/popular/longtail/trash）`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['overview', 'folders', 'stats', 'grouped', 'filter'],
        description: '操作类型',
      },
      filterType: {
        type: 'string',
        enum: ['chrome', 'ai_category', 'starred', 'recent', 'popular', 'longtail', 'trash'],
        description: '过滤视图类型（仅 filter action 使用）',
      },
      includeDeleted: {
        type: 'boolean',
        description: '是否包含已删除书签（仅 overview）',
        default: false,
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
  execute: async (params: { action: string; includeDeleted?: boolean }): Promise<ToolResult> => {
    // 先同步最新数据
    await syncFromV2ToLegacy();
    
    const store = useBookmarkStore.getState();
    const { action, includeDeleted = false } = params;

    try {
      switch (action) {
        case 'overview': {
          const bookmarks = store.bookmarks.filter(b => includeDeleted || b.status !== 'deleted');
          if (!bookmarks.length) {
            return { success: true, data: { overview: '📚 书签库为空', totalBookmarks: 0 } };
          }

          const analyzedCount = bookmarks.filter(isAnalyzed).length;
          
          // 按 decay status 统计
          const decayStats = { active: 0, cooling: 0, cold: 0, frozen: 0 };
          bookmarks.forEach(b => {
            const status = getDecayStatus(b);
            decayStats[status]++;
          });

          const byFolder = new Map<string, IBookmark[]>();
          bookmarks.forEach(b => {
            const path = b.folderPath || '/';
            if (!byFolder.has(path)) byFolder.set(path, []);
            byFolder.get(path)!.push(b);
          });

          let overview = `📚 书签库概览\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          
          // 添加活跃度统计
          overview += `\n📊 活跃度分布：\n`;
          overview += `  🟢 活跃 (7天内): ${decayStats.active} 个\n`;
          overview += `  🟡 冷却中 (30天内): ${decayStats.cooling} 个\n`;
          overview += `  🔵 冷门 (90天内): ${decayStats.cold} 个\n`;
          overview += `  ❄️ 冻结 (超过90天): ${decayStats.frozen} 个\n`;
          
          Array.from(byFolder.keys()).sort((a, b) => a === '/' ? 1 : b === '/' ? -1 : a.localeCompare(b))
            .forEach(path => {
              const bms = byFolder.get(path)!;
              const unanalyzed = bms.filter(b => !isAnalyzed(b)).length;
              overview += `\n📁 ${path === '/' ? '未分类' : path} (${bms.length}个${unanalyzed ? `, ⚠️${unanalyzed}未分析` : ''})\n`;
              overview += `| # | 标题 | 域名 | AI标签 | 状态 |\n|---|------|------|--------|------|\n`;
              bms.forEach((b, i) => {
                const decayIcon = { active: '🟢', cooling: '🟡', cold: '🔵', frozen: '❄️' }[getDecayStatus(b)];
                overview += `| ${i + 1} | ${truncate(b.title, 25)} | ${truncate(extractDomain(b.url), 20)} | ${b.aiTags?.slice(0, 3).join(', ') || '-'} | ${decayIcon} |\n`;
              });
            });

          overview += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 统计：${bookmarks.length} 个书签，${analyzedCount} 个已分析`;
          if (decayStats.frozen > 0) {
            overview += `\n💡 提示：有 ${decayStats.frozen} 个书签超过 90 天未访问，可能需要清理`;
          }

          return {
            success: true,
            data: { 
              overview, 
              totalBookmarks: bookmarks.length, 
              analyzedCount, 
              unanalyzedCount: bookmarks.length - analyzedCount,
              decayStats,
            },
          };
        }

        case 'folders': {
          const pathCounts = new Map<string, number>();
          store.bookmarks.filter(b => b.status !== 'deleted').forEach(b => {
            const path = b.folderPath || '/';
            pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
          });

          const folders = Array.from(pathCounts.entries())
            .map(([path, count]) => ({
              id: `folder-${path}`,
              name: path === '/' ? '未分类' : path.split('/').filter(Boolean).pop() || '',
              path,
              bookmarkCount: count,
            }))
            .sort((a, b) => a.path.localeCompare(b.path));

          return { success: true, data: { count: folders.length, folders } };
        }

        case 'stats': {
          const active = store.bookmarks.filter(b => b.status !== 'deleted');
          const tagCounts = new Map<string, number>();
          active.forEach(b => {
            [...(b.aiTags || []), ...(b.userTags || [])].forEach(t => {
              tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
            });
          });

          const topTags = Array.from(tagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag, count]) => ({ tag, count }));

          // 添加 decay status 统计
          const decayStats = { active: 0, cooling: 0, cold: 0, frozen: 0 };
          active.forEach(b => {
            const status = getDecayStatus(b);
            decayStats[status]++;
          });

          // 计算平均 frecency
          const totalFrecency = active.reduce((sum, b) => sum + calculateFrecency(b), 0);
          const avgFrecency = active.length > 0 ? Math.round(totalFrecency / active.length) : 0;

          return {
            success: true,
            data: {
              total: active.length,
              analyzed: active.filter(isAnalyzed).length,
              starred: active.filter(b => b.starred).length,
              unvisited: active.filter(b => !b.analytics?.visitCount).length,
              deleted: store.bookmarks.filter(b => b.status === 'deleted').length,
              decayStats,
              avgFrecency,
              topTags,
            },
          };
        }

        case 'grouped': {
          const grouped = store.getBookmarksGroupedByCategory();
          const result: Record<string, { count: number; bookmarks: { id: string; title: string; url: string }[] }> = {};
          grouped.forEach((bms, category) => {
            result[category] = {
              count: bms.length,
              bookmarks: bms.map(b => ({ id: b.id, title: b.title, url: b.url })),
            };
          });
          return { success: true, data: { categories: Object.keys(result).length, grouped: result } };
        }

        case 'filter': {
          const { filterType } = params as { filterType?: string };
          if (!filterType) return { success: false, error: '需要提供 filterType' };

          const active = store.bookmarks.filter(b => b.status !== 'deleted');
          let filtered: IBookmark[] = [];
          let filterName = '';

          switch (filterType) {
            case 'chrome':
              // Chrome 视图 - 按 Chrome 文件夹分组
              filtered = active;
              filterName = 'Chrome 书签';
              break;
            case 'ai_category':
              // AI 分类视图 - 有 AI 分类的书签
              filtered = active.filter(b => b.aiFolderPath || b.aiCategory);
              filterName = 'AI 分类';
              break;
            case 'starred':
              // 星标书签
              filtered = active.filter(b => b.starred);
              filterName = '星标书签';
              break;
            case 'recent':
              // 最近访问 - 7天内访问过
              const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
              filtered = active.filter(b => (b.analytics?.lastVisit || 0) > weekAgo)
                .sort((a, b) => (b.analytics?.lastVisit || 0) - (a.analytics?.lastVisit || 0));
              filterName = '最近访问';
              break;
            case 'popular':
              // 热门书签 - 按访问次数排序
              filtered = active.filter(b => (b.analytics?.visitCount || 0) > 0)
                .sort((a, b) => (b.analytics?.visitCount || 0) - (a.analytics?.visitCount || 0));
              filterName = '热门书签';
              break;
            case 'longtail':
              // 长尾书签 - 创建超过 30 天且访问次数 1-2 次（排除 never visit）
              const thirtyDaysAgoForLongtail = Date.now() - 30 * 24 * 60 * 60 * 1000;
              filtered = active.filter(b => {
                const isOldEnough = b.createTime < thirtyDaysAgoForLongtail;
                const visitCount = b.analytics?.visitCount || 0;
                // 排除 never visit，只保留 1-2 次访问的
                const hasLowVisits = visitCount >= 1 && visitCount <= 2;
                return isOldEnough && hasLowVisits;
              });
              filterName = '长尾书签';
              break;
            case 'trash':
              // 回收站
              filtered = store.bookmarks.filter(b => b.status === 'deleted');
              filterName = '回收站';
              break;
            default:
              return { success: false, error: `未知过滤类型: ${filterType}` };
          }

          const formattedResults = filtered.slice(0, 20).map((b, i) => ({
            index: i + 1,
            id: b.id,
            title: b.title,
            url: b.url,
            folder: b.folderPath || '/',
            decayStatus: getDecayStatus(b),
            visitCount: b.analytics?.visitCount || 0,
            starred: b.starred,
          }));

          const decayEmoji: Record<string, string> = {
            active: '🟢', cooling: '🟡', cold: '🔵', frozen: '❄️'
          };

          let message = `📋 ${filterName} (${filtered.length} 个)：\n\n`;
          formattedResults.forEach(r => {
            const statusIcon = decayEmoji[r.decayStatus] || '';
            message += `${r.index}. ${r.starred ? '⭐' : '📖'} ${r.title} ${statusIcon}\n`;
            message += `   📁 ${r.folder} | 访问${r.visitCount}次\n\n`;
          });
          if (filtered.length > 20) {
            message += `...还有 ${filtered.length - 20} 个\n`;
          }

          return {
            success: true,
            data: {
              filterType,
              filterName,
              count: filtered.length,
              results: formattedResults,
              message,
            },
          };
        }

        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Context operation failed' };
    }
  },
};

// ============================================================================
// 2. Bookmark 工具 - 书签操作
// ============================================================================

export const bookmarkTool: Tool = {
  name: 'bookmark',
  description: `书签操作工具。

何时使用：
- "收藏这个/保存这个" → add
- "删除这个书签" → delete
- "给这个加星标" → star
- "打开这个书签" → open
- "修改书签标题/标签" → edit
- "恢复删除的书签" → restore

操作：
- "add" - 添加书签（需要 url，可选 title、folderId、tags）
- "edit" - 编辑书签（需要 bookmarkId 和 updates）
- "delete" - 删除书签到回收站（需要 bookmarkId）
- "star" - 切换星标状态（需要 bookmarkId）
- "restore" - 从回收站恢复（需要 bookmarkId）
- "open" - 在新标签页打开（需要 bookmarkId）
- "permanent" - 永久删除（需要 bookmarkId，⚠️谨慎使用）`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'edit', 'delete', 'star', 'restore', 'open', 'permanent'],
        description: '操作类型',
      },
      bookmarkId: { type: 'string', description: '书签 ID（除 add 外都需要）' },
      url: { type: 'string', description: '书签 URL（add 时必需）' },
      title: { type: 'string', description: '书签标题（add/edit 时可选）' },
      folderId: { type: 'string', description: '文件夹 ID（add 时可选）' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签数组（add 时可选）' },
      updates: {
        type: 'object',
        description: '更新字段（edit 时需要）',
        properties: {
          title: { type: 'string' },
          userTags: { type: 'array', items: { type: 'string' } },
          userNotes: { type: 'string' },
        },
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
  execute: async (params: any): Promise<ToolResult> => {
    const store = useBookmarkStore.getState();
    const { action, bookmarkId, url, title, folderId, tags, updates } = params;

    try {
      switch (action) {
        case 'add': {
          if (!url) return { success: false, error: '需要提供 URL' };
          if (store.bookmarks.some(b => b.url === url && b.status !== 'deleted')) {
            return { success: false, error: '该 URL 已存在' };
          }

          // 使用新 API 添加书签
          const result = await AgentAPI.addBookmark({
            url,
            title: title || url,
            parentId: folderId,
            tags: tags || [],
          });
          await refreshAndNotify();
          return { success: true, data: { id: result.chromeId, title: result.title, message: `已添加: ${result.title}` } };
        }

        case 'edit': {
          if (!bookmarkId) return { success: false, error: '需要提供 bookmarkId' };
          const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
          if (!bookmark) return { success: false, error: '书签不存在' };

          // 使用新 API 更新书签
          if (updates?.title) {
            await AgentAPI.updateBookmarkTitle(bookmarkId, updates.title);
          }
          if (updates?.userTags || updates?.userNotes) {
            await AgentAPI.updateBookmarkMetadata(bookmarkId, {
              userTags: updates.userTags,
              userNotes: updates.userNotes,
            });
          }
          await refreshAndNotify();
          return { success: true, data: { id: bookmarkId, message: `已更新: ${updates?.title || bookmark.title}` } };
        }

        case 'delete': {
          if (!bookmarkId) return { success: false, error: '需要提供 bookmarkId' };
          const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
          if (!bookmark) return { success: false, error: '书签不存在' };
          if (bookmark.status === 'deleted') return { success: false, error: '书签已在回收站' };

          // 使用新 API 删除书签（移到回收站）
          await AgentAPI.deleteBookmark(bookmarkId);
          await refreshAndNotify();
          return { success: true, data: { id: bookmarkId, message: `已删除: ${bookmark.title}` } };
        }

        case 'star': {
          if (!bookmarkId) return { success: false, error: '需要提供 bookmarkId' };
          const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
          if (!bookmark) return { success: false, error: '书签不存在' };

          const newStarred = !bookmark.starred;
          await store.updateBookmark(bookmarkId, { starred: newStarred, updateTime: Date.now() });
          await refreshAndNotify();
          return { success: true, data: { id: bookmarkId, starred: newStarred, message: newStarred ? `已收藏: ${bookmark.title}` : `已取消收藏: ${bookmark.title}` } };
        }

        case 'restore': {
          if (!bookmarkId) return { success: false, error: '需要提供 bookmarkId' };
          const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
          if (!bookmark) return { success: false, error: '书签不存在' };
          if (bookmark.status !== 'deleted') return { success: false, error: '书签不在回收站' };

          store.restoreBookmark(bookmarkId);
          return { success: true, data: { id: bookmarkId, message: `已恢复: ${bookmark.title}` } };
        }

        case 'open': {
          if (!bookmarkId) return { success: false, error: '需要提供 bookmarkId' };
          const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
          if (!bookmark) return { success: false, error: '书签不存在' };

          if (typeof chrome !== 'undefined' && chrome.tabs) {
            await chrome.tabs.create({ url: bookmark.url });
          }
          await store.updateBookmark(bookmarkId, {
            analytics: { ...bookmark.analytics, visitCount: bookmark.analytics.visitCount + 1, lastVisit: Date.now() },
          });
          return { success: true, data: { id: bookmarkId, url: bookmark.url, message: `已打开: ${bookmark.title}` } };
        }

        case 'permanent': {
          if (!bookmarkId) return { success: false, error: '需要提供 bookmarkId' };
          const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
          if (!bookmark) return { success: false, error: '书签不存在' };

          await store.permanentlyDeleteBookmark(bookmarkId);
          return { success: true, data: { id: bookmarkId, message: `已永久删除: ${bookmark.title}` } };
        }

        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Bookmark operation failed' };
    }
  },
};


// ============================================================================
// 3. Organize 工具 - AI 分类整理
// ============================================================================

export const organizeTool: Tool = {
  name: 'organize',
  description: `AI 分类整理工具 - 分析和整理书签。

⚠️ 与 folder 工具的区别：
- organize = 分析书签问题 + 操作 AI 分类（虚拟分类）
- folder = 操作实际的文件夹结构

整理书签的推荐流程：
1. 先调用 suggest 查看书签概览（表格形式展示所有书签及其 AI 摘要/标签）
2. 如果有未分析的书签，调用 aiAnalyze 进行 AI 分析
3. 根据概览信息，自己判断如何分类（新建目录、移动书签等）
4. 使用 move 执行分类操作

操作：
- "suggest" - 获取书签概览（表格形式，包含 title/aiSummary/aiTags/当前目录），由你判断如何分类
- "aiAnalyze" - 调用 AI 分析未分析的书签（生成 aiSummary/aiTags）
- "analyze" - 分析书签库问题（重复、未访问、过时、分散）
- "move" - 批量移动书签到 AI 文件夹（需要 moves 数组）
- "remove" - 从 AI 分类中移除书签（需要 bookmarkIds）
- "metadata" - 更新书签的 AI 元数据（需要 bookmarkId 和 metadata）`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['analyze', 'aiAnalyze', 'move', 'suggest', 'remove', 'metadata'],
        description: '操作类型',
      },
      analyzeOptions: {
        type: 'object',
        description: '分析选项（analyze 时可选）',
        properties: {
          findDuplicates: { type: 'boolean', description: '查找重复书签', default: true },
          findUnvisited: { type: 'boolean', description: '查找从未访问的书签', default: true },
          findScattered: { type: 'boolean', description: '查找同类分散的书签', default: true },
          findOutdated: { type: 'boolean', description: '查找可能过时的书签', default: false },
        },
      },
      bookmarkIds: {
        type: 'array',
        items: { type: 'string' },
        description: '书签 ID 列表（aiAnalyze/remove 时使用，aiAnalyze 不传则自动分析所有未分析的）',
      },
      moves: {
        type: 'array',
        description: '移动操作数组（move 时需要）',
        items: {
          type: 'object',
          properties: {
            bookmarkId: { type: 'string' },
            targetPath: { type: 'string', description: 'AI 文件夹路径，如 "/Frontend/React"' },
          },
          required: ['bookmarkId', 'targetPath'],
        },
      },
      bookmarkId: { type: 'string', description: '书签 ID（metadata 时需要）' },
      metadata: {
        type: 'object',
        description: 'AI 元数据（metadata 时需要）',
        properties: {
          aiTags: { type: 'array', items: { type: 'string' } },
          aiSummary: { type: 'string' },
          aiDifficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
          aiTechStack: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
  execute: async (params: any): Promise<ToolResult> => {
    const store = useBookmarkStore.getState();
    const { action, analyzeOptions, moves, bookmarkIds, bookmarkId, metadata } = params;

    try {
      switch (action) {
        case 'analyze': {
          const active = store.bookmarks.filter(b => b.status !== 'deleted');
          const options = analyzeOptions || { findDuplicates: true, findUnvisited: true, findScattered: true };
          
          const result: any = { totalBookmarks: active.length };
          let report = `📊 书签库分析报告\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
          report += `📚 总计 ${active.length} 个书签\n\n`;

          // 查找重复书签
          if (options.findDuplicates) {
            const urlMap = new Map<string, IBookmark[]>();
            active.forEach(b => {
              const url = b.url.replace(/\/$/, '').toLowerCase();
              if (!urlMap.has(url)) urlMap.set(url, []);
              urlMap.get(url)!.push(b);
            });
            const duplicates = Array.from(urlMap.entries())
              .filter(([_, bms]) => bms.length > 1)
              .map(([url, bms]) => ({ url, bookmarks: bms.map(b => ({ id: b.id, title: b.title, folder: b.folderPath })) }));
            
            result.duplicates = duplicates;
            if (duplicates.length > 0) {
              report += `🔄 发现 ${duplicates.length} 组重复书签：\n`;
              duplicates.slice(0, 5).forEach(d => {
                report += `  • ${d.bookmarks[0].title}\n`;
                d.bookmarks.forEach(b => report += `    - 📁 ${b.folder || '/'}\n`);
              });
              if (duplicates.length > 5) report += `  ...还有 ${duplicates.length - 5} 组\n`;
              report += '\n';
            }
          }

          // 查找从未访问的书签
          if (options.findUnvisited) {
            const unvisited = active.filter(b => !b.analytics?.visitCount || b.analytics.visitCount === 0);
            result.unvisited = unvisited.map(b => ({ id: b.id, title: b.title, folder: b.folderPath }));
            if (unvisited.length > 0) {
              report += `📭 ${unvisited.length} 个书签从未访问过：\n`;
              unvisited.slice(0, 5).forEach(b => report += `  • ${b.title} (📁 ${b.folderPath || '/'})\n`);
              if (unvisited.length > 5) report += `  ...还有 ${unvisited.length - 5} 个\n`;
              report += '\n';
            }
          }

          // 查找同类分散的书签
          if (options.findScattered) {
            const tagFolders = new Map<string, Set<string>>();
            active.forEach(b => {
              b.aiTags?.forEach(tag => {
                if (!tagFolders.has(tag)) tagFolders.set(tag, new Set());
                tagFolders.get(tag)!.add(b.folderPath || '/');
              });
            });
            const scattered = Array.from(tagFolders.entries())
              .filter(([_, folders]) => folders.size > 1)
              .map(([tag, folders]) => ({ tag, folders: Array.from(folders), count: active.filter(b => b.aiTags?.includes(tag)).length }))
              .sort((a, b) => b.count - a.count);
            
            result.scattered = scattered;
            if (scattered.length > 0) {
              report += `📂 同类书签分散在多个文件夹：\n`;
              scattered.slice(0, 5).forEach(s => {
                report += `  • "${s.tag}" (${s.count}个) 分布在: ${s.folders.slice(0, 3).join(', ')}${s.folders.length > 3 ? '...' : ''}\n`;
              });
              if (scattered.length > 5) report += `  ...还有 ${scattered.length - 5} 个标签\n`;
              report += '\n';
            }
          }

          // 查找可能过时的书签
          if (options.findOutdated) {
            const outdatedTags = ['jquery', 'angularjs', 'backbone', 'grunt', 'bower', 'coffeescript'];
            const outdated = active.filter(b => 
              b.aiTags?.some(t => outdatedTags.includes(t.toLowerCase())) ||
              b.title.toLowerCase().includes('jquery') ||
              b.title.toLowerCase().includes('angularjs')
            );
            result.outdated = outdated.map(b => ({ id: b.id, title: b.title, tags: b.aiTags }));
            if (outdated.length > 0) {
              report += `⏰ ${outdated.length} 个可能过时的书签：\n`;
              outdated.forEach(b => report += `  • ${b.title}\n`);
              report += '\n';
            }
          }

          report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          report += `💡 建议：\n`;
          if (result.duplicates?.length) report += `  1. 清理 ${result.duplicates.length} 组重复书签\n`;
          if (result.unvisited?.length) report += `  2. 查看或归档 ${result.unvisited.length} 个未访问书签\n`;
          if (result.scattered?.length) report += `  3. 整理分散的同类书签到统一文件夹\n`;
          if (result.outdated?.length) report += `  4. 考虑删除 ${result.outdated.length} 个过时书签\n`;

          return { success: true, data: { ...result, report } };
        }

        case 'aiAnalyze': {
          // 调用 AI 分析器分析未分析的书签
          const active = store.bookmarks.filter(b => b.status !== 'deleted');
          
          // 如果指定了 bookmarkIds，只分析这些；否则分析所有未分析的
          let toAnalyze: IBookmark[];
          if (bookmarkIds?.length) {
            toAnalyze = active.filter(b => bookmarkIds.includes(b.id));
          } else {
            // 找出没有 aiTags 或 aiSummary 的书签
            toAnalyze = active.filter(b => !b.aiTags?.length && !b.aiSummary?.trim());
          }

          if (toAnalyze.length === 0) {
            return { 
              success: true, 
              data: { 
                analyzedCount: 0, 
                message: '✅ 所有书签都已分析过，可以直接进行分类建议。' 
              } 
            };
          }

          // 限制单次分析数量
          const maxBatch = 20;
          if (toAnalyze.length > maxBatch) {
            toAnalyze = toAnalyze.slice(0, maxBatch);
          }

          let successCount = 0;
          let failCount = 0;
          const results: Array<{ id: string; title: string; success: boolean; tags?: string[] }> = [];

          try {
            const analyzer = await getDefaultAnalyzer();
            
            // 并行分析，限制并发数为 5（避免过载）
            const CONCURRENT_LIMIT = 5;
            
            for (let i = 0; i < toAnalyze.length; i += CONCURRENT_LIMIT) {
              const chunk = toAnalyze.slice(i, i + CONCURRENT_LIMIT);
              
              // 并行处理当前批次
              const chunkResults = await Promise.allSettled(
                chunk.map(async (bookmark) => {
                  // 提取框架内容
                  const content = await extractFrameworkContent(bookmark.url);
                  
                  // 调用 AI 分析
                  const analysis = await analyzer.analyzeBookmark({
                    url: bookmark.url,
                    title: bookmark.title,
                    description: content.excerpt || '',
                    bodyText: content.textContent || '',
                  });

                  // 更新书签
                  await store.updateBookmark(bookmark.id, {
                    aiSummary: analysis.summary,
                    aiTags: analysis.tags,
                    lastAnalyzed: Date.now(),
                    updateTime: Date.now(),
                  });

                  return { id: bookmark.id, title: bookmark.title, success: true, tags: analysis.tags };
                })
              );

              // 处理结果
              chunkResults.forEach((result, index) => {
                const bookmark = chunk[index];
                if (result.status === 'fulfilled') {
                  results.push(result.value);
                  successCount++;
                } else {
                  console.error(`[Organize] AI analyze failed for ${bookmark.title}:`, result.reason);
                  results.push({ id: bookmark.id, title: bookmark.title, success: false });
                  failCount++;
                }
              });
            }

            await refreshAndNotify();

            let message = `💬 AI 分析完成\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            message += `✅ 成功: ${successCount} 个\n`;
            if (failCount > 0) message += `❌ 失败: ${failCount} 个\n`;
            message += `\n📋 分析结果：\n`;
            results.filter(r => r.success).slice(0, 10).forEach(r => {
              message += `• ${r.title}\n  标签: ${r.tags?.join(', ') || '-'}\n`;
            });
            if (results.filter(r => r.success).length > 10) {
              message += `...还有 ${results.filter(r => r.success).length - 10} 个\n`;
            }

            const remainingUnanalyzed = active.filter(b => !b.aiTags?.length && !b.aiSummary?.trim()).length - successCount;
            if (remainingUnanalyzed > 0) {
              message += `\n⚠️ 还有 ${remainingUnanalyzed} 个书签未分析，可以再次调用 aiAnalyze。`;
            } else {
              message += `\n✅ 所有书签都已分析，可以进行分类建议了。`;
            }

            return { 
              success: true, 
              data: { 
                analyzedCount: successCount, 
                failedCount: failCount, 
                results, 
                message,
                remainingUnanalyzed,
              } 
            };
          } catch (error) {
            return { 
              success: false, 
              error: `AI 分析失败: ${error instanceof Error ? error.message : 'Unknown error'}` 
            };
          }
        }

        case 'move': {
          if (!moves?.length) return { success: false, error: '需要提供 moves 数组' };
          if (moves.length > 100) return { success: false, error: '单次最多移动 100 个书签' };

          let successCount = 0, failCount = 0;
          const summary: Record<string, string[]> = {};

          for (const move of moves) {
            const bookmark = store.bookmarks.find(b => b.id === move.bookmarkId);
            if (!bookmark) { failCount++; continue; }

            let targetPath = move.targetPath.trim();
            if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;

            await store.updateBookmark(move.bookmarkId, {
              aiFolderPath: targetPath,
              aiFolderId: `ai-folder-${targetPath}`,
              aiCategory: targetPath.split('/').filter(Boolean)[0] || undefined,
              updateTime: Date.now(),
            });

            if (!summary[targetPath]) summary[targetPath] = [];
            summary[targetPath].push(bookmark.title);
            successCount++;
          }

          await refreshAndNotify();

          let message = `✅ 成功移动 ${successCount} 个书签`;
          if (failCount > 0) message += `，${failCount} 个失败`;
          message += '\n\n📁 分类结果：\n';
          Object.entries(summary).forEach(([path, titles]) => {
            message += `${path} (${titles.length}个)\n`;
            titles.slice(0, 3).forEach(t => { message += `  - ${t}\n`; });
            if (titles.length > 3) message += `  - ...还有 ${titles.length - 3} 个\n`;
          });

          return { success: true, data: { successCount, failCount, summary, message } };
        }

        case 'suggest': {
          // 不再写死分类规则，而是把书签数据以清晰的表格形式展示给 LLM
          // 让 LLM 自己判断怎么分类
          const allBookmarks = store.bookmarks.filter(b => b.status !== 'deleted');
          if (!allBookmarks.length) return { success: false, error: '没有可分析的书签' };

          // 优化：限制最多处理 100 个书签（从 500 减少到 100），避免超出 LLM context 限制
          const MAX_BOOKMARKS = 100;
          const bookmarks = allBookmarks.slice(0, MAX_BOOKMARKS);
          const isLimited = allBookmarks.length > MAX_BOOKMARKS;

          // 按当前目录分组
          const byFolder = new Map<string, IBookmark[]>();
          bookmarks.forEach(b => {
            const path = b.folderPath || '/';
            if (!byFolder.has(path)) byFolder.set(path, []);
            byFolder.get(path)!.push(b);
          });

          // 统计未分析的书签
          const unanalyzed = bookmarks.filter(b => !b.aiTags?.length && !b.aiSummary?.trim());

          // 生成压缩的书签概览（优化：减少表格详细程度）
          let overview = `📚 书签库概览（共 ${allBookmarks.length} 个书签${isLimited ? `，显示前 ${MAX_BOOKMARKS} 个` : ''}）\n`;
          overview += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

          if (isLimited) {
            overview += `⚠️ 书签数量超过 ${MAX_BOOKMARKS} 个限制，仅显示前 ${MAX_BOOKMARKS} 个。\n\n`;
          }

          // 按目录层级排序
          const sortedFolders = Array.from(byFolder.keys()).sort((a, b) => {
            if (a === '/') return -1;
            if (b === '/') return 1;
            return a.localeCompare(b);
          });

          // 优化：使用更紧凑的格式，减少 token 消耗
          sortedFolders.forEach(folderPath => {
            const bms = byFolder.get(folderPath)!;
            const folderName = folderPath === '/' ? '📁 根目录' : `📁 ${folderPath}`;
            overview += `${folderName} (${bms.length}个)\n`;
            
            // 只显示前 20 个书签（优化：从全部减少到 20）
            const displayBms = bms.slice(0, 20);
            displayBms.forEach((b, i) => {
              // 优化：压缩格式，减少字段长度
              const summary = b.aiSummary ? truncate(b.aiSummary, 30) : '未分析';
              const tags = b.aiTags?.slice(0, 2).join(',') || '无';
              overview += `  ${i + 1}. ${truncate(b.title, 25)} | ${summary} | ${tags}\n`;
            });
            
            if (bms.length > 20) {
              overview += `  ...还有 ${bms.length - 20} 个\n`;
            }
            overview += '\n';
          });

          // 添加统计信息
          overview += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          overview += `📊 统计：总${bookmarks.length} | 目录${sortedFolders.length} | 已分析${bookmarks.length - unanalyzed.length} | 未分析${unanalyzed.length}\n`;

          if (unanalyzed.length > 0) {
            overview += `\n⚠️ 有 ${unanalyzed.length} 个书签未分析，建议先调用 organize({ action: 'aiAnalyze' })。\n`;
          }

          overview += `\n💡 请根据以上信息提出分类建议，确定方案后使用 organize({ action: 'move', moves: [...] }) 执行。`;

          // 优化：返回压缩的数据结构
          const bookmarkData = bookmarks.slice(0, 50).map(b => ({
            id: b.id,
            title: truncate(b.title, 40),
            folder: b.folderPath || '/',
            summary: b.aiSummary ? truncate(b.aiSummary, 50) : null,
            tags: b.aiTags?.slice(0, 3) || [],
          }));

          return {
            success: true,
            data: {
              overview,
              totalBookmarks: allBookmarks.length,
              displayedBookmarks: bookmarks.length,
              analyzedCount: bookmarks.length - unanalyzed.length,
              unanalyzedCount: unanalyzed.length,
              folderCount: sortedFolders.length,
              bookmarks: bookmarkData,
            },
          };
        }

        case 'remove': {
          if (!bookmarkIds?.length) return { success: false, error: '需要提供 bookmarkIds' };

          let successCount = 0, failCount = 0;
          for (const id of bookmarkIds) {
            const bookmark = store.bookmarks.find(b => b.id === id);
            if (!bookmark) { failCount++; continue; }

            await store.updateBookmark(id, {
              aiFolderPath: undefined,
              aiFolderId: undefined,
              aiCategory: undefined,
              updateTime: Date.now(),
            });
            successCount++;
          }

          await refreshAndNotify();
          return { success: true, data: { successCount, failCount, message: `已从 AI 分类移除 ${successCount} 个书签` } };
        }

        case 'metadata': {
          if (!bookmarkId) return { success: false, error: '需要提供 bookmarkId' };
          const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
          if (!bookmark) return { success: false, error: '书签不存在' };

          const updates: Partial<IBookmark> = {};
          if (metadata?.aiTags !== undefined) updates.aiTags = metadata.aiTags;
          if (metadata?.aiSummary !== undefined) updates.aiSummary = metadata.aiSummary;
          if (metadata?.aiDifficulty !== undefined) updates.aiDifficulty = metadata.aiDifficulty;
          if (metadata?.aiTechStack !== undefined) updates.aiTechStack = metadata.aiTechStack;

          if (!Object.keys(updates).length) return { success: false, error: '没有提供有效的更新字段' };

          await store.updateBookmark(bookmarkId, { ...updates, lastAnalyzed: Date.now(), updateTime: Date.now() });
          await refreshAndNotify();
          return { success: true, data: { id: bookmarkId, updatedFields: Object.keys(updates), message: `已更新 "${bookmark.title}" 的元数据` } };
        }

        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Organize operation failed' };
    }
  },
};

// ============================================================================
// 4. Folder 工具 - 文件夹管理
// ============================================================================

export const folderTool: Tool = {
  name: 'folder',
  description: `文件夹管理工具 - 操作实际的文件夹结构。

⚠️ 与 organize 工具的区别：
- folder = 操作实际的文件夹结构
- organize = 操作书签的 AI 分类（虚拟分类）

何时使用：
- "创建一个新文件夹" → create
- "重命名文件夹" → rename
- "删除文件夹" → delete
- "移动文件夹位置" → move

操作：
- "create" - 创建文件夹（需要 name，可选 parentPath）
- "rename" - 重命名文件夹（需要 folderId 和 newName）
- "delete" - 删除文件夹（需要 folderId，⚠️书签会移到回收站）
- "move" - 移动文件夹到另一个文件夹（需要 folderId 和 targetFolderId）`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'rename', 'delete', 'move'],
        description: '操作类型',
      },
      name: { type: 'string', description: '文件夹名称（create 时需要）' },
      parentPath: { type: 'string', description: '父文件夹路径（create 时可选，默认 "/"）', default: '/' },
      folderId: { type: 'string', description: '文件夹 ID（rename/delete/move 时需要）' },
      newName: { type: 'string', description: '新名称（rename 时需要）' },
      targetFolderId: { type: 'string', description: '目标文件夹 ID（move 时需要）' },
    },
    required: ['action'],
    additionalProperties: false,
  },
  execute: async (params: any): Promise<ToolResult> => {
    const store = useBookmarkStore.getState();
    const { action, name, parentPath = '/', folderId, newName, targetFolderId } = params;

    try {
      switch (action) {
        case 'create': {
          if (!name) return { success: false, error: '需要提供文件夹名称' };

          const fullPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
          const newFolderId = `folder-${fullPath}`;

          if (store.folders.some(f => f.id === newFolderId)) {
            return { success: false, error: `文件夹 "${name}" 已存在` };
          }

          const newFolder: IFolder = {
            id: newFolderId,
            title: name,
            path: fullPath,
            parentId: parentPath === '/' ? undefined : `folder-${parentPath}`,
            bookmarkCount: 0,
            subfolderCount: 0,
            createTime: Date.now(),
            updateTime: Date.now(),
            order: store.folders.length,
          };

          store.addFolder(newFolder);
          await refreshAndNotify();
          return { success: true, data: { id: newFolderId, name, path: fullPath, message: `已创建文件夹 "${name}"` } };
        }

        case 'rename': {
          if (!folderId || !newName) return { success: false, error: '需要提供 folderId 和 newName' };
          const folder = store.folders.find(f => f.id === folderId);
          if (!folder) return { success: false, error: '文件夹不存在' };

          const oldName = folder.title;
          store.updateFolder(folderId, { title: newName, updateTime: Date.now() });
          await refreshAndNotify();
          return { success: true, data: { id: folderId, oldName, newName, message: `已将 "${oldName}" 重命名为 "${newName}"` } };
        }

        case 'delete': {
          if (!folderId) return { success: false, error: '需要提供 folderId' };
          const folder = store.folders.find(f => f.id === folderId);
          if (!folder) return { success: false, error: '文件夹不存在' };

          const folderPath = folderId.replace(/^folder-/, '');
          const affectedCount = store.bookmarks.filter(b => {
            const path = b.folderPath || '/';
            return path === folderPath || path.startsWith(folderPath + '/');
          }).length;

          store.deleteFolder(folderId);
          await refreshAndNotify();
          return { success: true, data: { id: folderId, name: folder.title, affectedBookmarks: affectedCount, message: `已删除 "${folder.title}"，${affectedCount} 个书签已移至回收站` } };
        }

        case 'move': {
          if (!folderId || !targetFolderId) return { success: false, error: '需要提供 folderId 和 targetFolderId' };
          
          store.moveFolderToFolder(folderId, targetFolderId);
          await refreshAndNotify();
          return { success: true, data: { folderId, targetFolderId, message: '文件夹已移动' } };
        }

        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Folder operation failed' };
    }
  },
};


// ============================================================================
// 5. Search 工具 - 搜索书签（内部）
// ============================================================================

export const searchTool: Tool = {
  name: 'search',
  description: `搜索用户已保存的书签。

何时使用：
- "找我的 X 书签" → query="X"
- "我收藏过 X 吗" → query="X"
- "我的星标/重要书签" → filters.starred=true
- "从没看过的书签" → filters.unvisited=true
- "很久没用的书签" → filters.unusedDays=30 或 filters.decayStatus="cold"
- "长尾书签/冷门书签" → filters.decayStatus="cold" 或 "frozen"

⚠️ 注意：
- 这个工具只搜索用户已保存的书签
- query="*" 表示搜索全部（配合 filters 使用）
- 如果用户想找新资源，请使用 discover 工具`,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词，"*" 表示全部' },
      filters: {
        type: 'object',
        description: '过滤条件',
        properties: {
          starred: { type: 'boolean', description: '只搜索星标书签' },
          unvisited: { type: 'boolean', description: '只搜索从未访问过的书签' },
          unusedDays: { type: 'number', description: '搜索超过 N 天未访问的书签' },
          decayStatus: { 
            type: 'string', 
            enum: ['active', 'cooling', 'cold', 'frozen'],
            description: '按活跃度过滤：active(7天内)、cooling(30天内)、cold(90天内)、frozen(超过90天)' 
          },
          category: { type: 'string', description: '按 AI 分类过滤' },
          tag: { type: 'string', description: '按标签过滤' },
          folder: { type: 'string', description: '按文件夹路径过滤' },
        },
      },
      sortBy: {
        type: 'string',
        enum: ['relevance', 'frecency', 'recent', 'oldest'],
        description: '排序方式：relevance(相关度)、frecency(重要性)、recent(最近访问)、oldest(最久未访问)',
        default: 'relevance',
      },
      limit: { type: 'number', description: '结果数量限制', default: 10 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (params: any): Promise<ToolResult> => {
    const { query, filters, sortBy = 'relevance', limit = 10 } = params;

    try {
      if (!query) return { success: false, error: '需要提供搜索关键词' };
      
      const store = useBookmarkStore.getState();
      const isWildcard = query === '*';
      const searchTerms = isWildcard ? [] : query.toLowerCase().split(/\s+/).filter(Boolean);
      const now = Date.now();

      let results = store.bookmarks.filter(b => {
        if (b.status === 'deleted') return false;

        // 应用过滤器（优先于搜索词）
        if (filters?.starred && !b.starred) return false;
        if (filters?.unvisited && b.analytics?.visitCount > 0) return false;
        if (filters?.unusedDays) {
          const lastVisit = b.analytics?.lastVisit || b.createTime;
          const daysSinceVisit = (now - lastVisit) / (1000 * 60 * 60 * 24);
          if (daysSinceVisit < filters.unusedDays) return false;
        }
        // 新增：按 decay status 过滤
        if (filters?.decayStatus) {
          const status = getDecayStatus(b);
          if (status !== filters.decayStatus) return false;
        }
        if (filters?.category && b.aiCategory !== filters.category) return false;
        if (filters?.tag && !b.aiTags?.includes(filters.tag) && !b.userTags?.includes(filters.tag)) return false;
        if (filters?.folder && b.folderPath !== filters.folder && !b.folderPath?.startsWith(filters.folder + '/')) return false;

        // 如果是通配符搜索，不需要匹配搜索词
        if (isWildcard) return true;

        const searchText = [
          b.title, 
          b.url, 
          b.aiSummary || '', 
          b.aiCategory || '', 
          ...(b.aiTags || []), 
          ...(b.userTags || [])
        ].join(' ').toLowerCase();

        // 所有搜索词都要匹配
        return searchTerms.every((t: string) => searchText.includes(t));
      });

      // 排序
      if (sortBy === 'frecency') {
        results.sort((a, b) => calculateFrecency(b) - calculateFrecency(a));
      } else if (sortBy === 'recent') {
        results.sort((a, b) => (b.analytics?.lastVisit || b.createTime) - (a.analytics?.lastVisit || a.createTime));
      } else if (sortBy === 'oldest') {
        results.sort((a, b) => (a.analytics?.lastVisit || a.createTime) - (b.analytics?.lastVisit || b.createTime));
      }
      // relevance 保持原有顺序

      results = results.slice(0, limit);

      // 格式化结果，添加编号和更多信息
      const formattedResults = results.map((b, i) => ({
        index: i + 1,
        id: b.id,
        title: b.title,
        url: b.url,
        folder: b.folderPath || '/',
        aiFolder: b.aiFolderPath,
        category: b.aiCategory,
        tags: [...(b.aiTags || []), ...(b.userTags || [])],
        summary: b.aiSummary,
        starred: b.starred,
        visitCount: b.analytics?.visitCount || 0,
        lastVisit: b.analytics?.lastVisit,
        decayStatus: getDecayStatus(b),
        frecency: calculateFrecency(b),
      }));

      // 生成更丰富的消息
      let filterDesc = '';
      if (filters?.starred) filterDesc = '星标';
      else if (filters?.unvisited) filterDesc = '从未访问的';
      else if (filters?.unusedDays) filterDesc = `超过${filters.unusedDays}天未访问的`;
      else if (filters?.decayStatus) {
        const statusMap: Record<string, string> = {
          active: '活跃的', cooling: '冷却中的', cold: '冷门的', frozen: '冻结的'
        };
        filterDesc = statusMap[filters.decayStatus] || '';
      }

      const decayEmoji: Record<string, string> = {
        active: '🟢', cooling: '🟡', cold: '🔵', frozen: '❄️'
      };

      let message = `🔍 找到 ${results.length} 个${filterDesc}书签：\n\n`;
      formattedResults.forEach(r => {
        const statusIcon = decayEmoji[r.decayStatus] || '';
        message += `${r.index}. ${r.starred ? '⭐' : '📖'} ${r.title} ${statusIcon}\n`;
        message += `   📁 ${r.folder} | ${extractDomain(r.url)}`;
        if (r.visitCount === 0) message += ' | ⚠️ 从未访问';
        else if (r.visitCount > 0) message += ` | 访问${r.visitCount}次`;
        if (r.tags.length) message += `\n   🏷️ ${r.tags.slice(0, 3).join(', ')}`;
        message += '\n\n';
      });
      if (results.length > 0) {
        message += `💡 说 "打开 1" 或 "删除 2" 来操作`;
      }

      return {
        success: true,
        data: {
          query: isWildcard ? '全部' : query,
          filters: filters || {},
          sortBy,
          count: results.length,
          results: formattedResults,
          message,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Search failed' };
    }
  },
};

// ============================================================================
// 导出所有核心工具
// ============================================================================

export const coreTools: Tool[] = [
  contextTool,
  bookmarkTool,
  organizeTool,
  folderTool,
  searchTool,
];

// ============================================================================
// 6. Discover 工具 - 发现外部资源
// ============================================================================

/** 解析搜索结果 */
function parseSearchResults(html: string, maxResults: number): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  
  const blockRegex = /<div class="ZINbbc xpd[^"]*"[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?<div class="ilUpNd UFvD1[^"]*">([^<]+)<\/div>[\s\S]*?<\/a>[\s\S]*?<div class="ilUpNd H66NU[^"]*">([^<]*)<\/div>/gi;
  
  let match;
  while ((match = blockRegex.exec(html)) !== null && results.length < maxResults) {
    const url = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    const snippet = match[3].replace(/<[^>]+>/g, '').trim();
    
    if (url.startsWith('http') && title) {
      results.push({ url, title, snippet });
    }
  }
  
  if (results.length === 0) {
    const simpleRegex = /<a[^>]*href="(https?:\/\/(?!localhost)[^"]+)"[^>]*>[\s\S]*?<div class="ilUpNd UFvD1[^"]*"[^>]*>([^<]+)<\/div>/gi;
    while ((match = simpleRegex.exec(html)) !== null && results.length < maxResults) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      if (url.startsWith('http') && title && !url.includes('google.com')) {
        results.push({ url, title, snippet: '' });
      }
    }
  }
  
  return results;
}

/** 统一的时间参数转换 */
function convertPeriodToOSSInsight(period: string): string {
  const map: Record<string, string> = {
    'today': 'past_24_hours',
    'week': 'past_week',
    'month': 'past_month',
  };
  return map[period] || 'past_24_hours';
}

function convertPeriodToGitHubDate(period: string): string {
  const now = new Date();
  switch (period) {
    case 'today':
      return now.toISOString().split('T')[0];
    case 'week':
      now.setDate(now.getDate() - 7);
      return now.toISOString().split('T')[0];
    case 'month':
      now.setMonth(now.getMonth() - 1);
      return now.toISOString().split('T')[0];
    default:
      return now.toISOString().split('T')[0];
  }
}

export const discoverTool: Tool = {
  name: 'discover',
  description: `发现外部新资源 - Web 搜索、GitHub 项目、热门趋势。

何时使用：
- "找 X 资源/教程" → web
- "推荐一些 X" → web
- "有什么好的 X 项目" → github
- "最近最火的项目" → trending
- "今天/本周热门" → trending
- 用户给了 URL 要了解详情 → extract

⚠️ 注意：这个工具用于发现新资源。
如果用户想搜索已保存的书签，请使用 search 工具。

操作：
- "web" - 搜索互联网
- "github" - 搜索 GitHub 仓库
- "trending" - 获取 GitHub 热门趋势
- "extract" - 提取网页内容（需要 url）`,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['web', 'github', 'trending', 'extract'],
        description: '操作类型',
      },
      query: { type: 'string', description: '搜索关键词（web/github 时需要）' },
      url: { type: 'string', description: '网页 URL（extract 时需要）' },
      language: { type: 'string', description: '编程语言过滤（github/trending 时可选）' },
      period: { 
        type: 'string', 
        enum: ['today', 'week', 'month'],
        description: '时间范围',
        default: 'today',
      },
      limit: { type: 'number', description: '结果数量限制', default: 10 },
    },
    required: ['action'],
    additionalProperties: false,
  },
  execute: async (params: any): Promise<ToolResult> => {
    const { action, query, url, language, period = 'today', limit = 10 } = params;

    try {
      switch (action) {
        case 'web': {
          if (!query) return { success: false, error: '需要提供搜索关键词' };
          const config = await getSearchConfig();

          let results: Array<{ title: string; url: string; snippet: string }> = [];

          if (config.searchUrl) {
            try {
              const response = await fetchWithRetry(
                `${config.searchUrl}/search?q=${encodeURIComponent(query)}`,
                { headers: { 'Accept': 'text/html' } },
                { timeout: TIMEOUT_CONFIG.search }
              );
              if (response.ok) {
                results = parseSearchResults(await response.text(), limit);
              }
            } catch (e) {
              console.warn('[Discover] Search service failed:', e);
            }
          }

          if (!results.length) {
            return {
              success: true,
              data: {
                query,
                results: [],
                searchUrls: {
                  google: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                  bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
                  duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                },
                message: '🔍 搜索服务暂时不可用，请点击以下链接手动搜索',
              },
            };
          }

          const formattedResults = results.map((r, i) => ({ index: i + 1, ...r }));

          let message = `🌐 找到 ${results.length} 个相关资源：\n\n`;
          formattedResults.forEach(r => {
            message += `${r.index}. ${r.title}\n`;
            message += `   ${extractDomain(r.url)}${r.snippet ? ' - ' + truncate(r.snippet, 50) : ''}\n\n`;
          });
          message += `💡 说 "收藏 1" 或 "收藏全部" 来保存`;

          return { success: true, data: { query, count: results.length, results: formattedResults, message } };
        }

        case 'github': {
          if (!query) return { success: false, error: '需要提供搜索关键词' };
          const config = await getSearchConfig();

          let searchQuery = query;
          if (language) searchQuery += ` language:${language}`;
          
          if (period && period !== 'today') {
            const dateStr = convertPeriodToGitHubDate(period);
            searchQuery += ` pushed:>=${dateStr}`;
          }

          const apiUrl = new URL('https://api.github.com/search/repositories');
          apiUrl.searchParams.set('q', searchQuery);
          apiUrl.searchParams.set('per_page', String(Math.min(limit, 30)));
          apiUrl.searchParams.set('sort', 'stars');

          const headers: Record<string, string> = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'AnyMark-BookmarkAgent',
          };
          if (config.githubToken) headers['Authorization'] = `token ${config.githubToken}`;

          const response = await fetchWithRetry(apiUrl.toString(), { headers }, { timeout: TIMEOUT_CONFIG.github });

          if (response.status === 403) {
            const remaining = response.headers.get('X-RateLimit-Remaining');
            if (remaining === '0') {
              const reset = response.headers.get('X-RateLimit-Reset');
              const resetTime = reset ? new Date(parseInt(reset) * 1000).toLocaleTimeString() : '稍后';
              return { success: false, error: `GitHub API 请求次数已达上限，请在 ${resetTime} 后重试` };
            }
          }

          if (!response.ok) throw new Error(`GitHub API failed: ${response.status}`);

          const data = await response.json();
          const repos = data.items.slice(0, limit).map((item: any, i: number) => ({
            index: i + 1,
            name: item.name,
            fullName: item.full_name,
            description: item.description,
            url: item.html_url,
            stars: item.stargazers_count,
            forks: item.forks_count,
            language: item.language,
            topics: item.topics || [],
          }));

          let message = `🐙 在 GitHub 上找到 ${data.total_count} 个相关项目：\n\n`;
          repos.forEach((r: any) => {
            message += `${r.index}. ⭐ ${r.fullName} (${r.stars.toLocaleString()} stars)\n`;
            message += `   ${r.description ? truncate(r.description, 60) : '无描述'}\n`;
            message += `   ${r.language || '未知语言'}\n\n`;
          });
          message += `💡 说 "收藏 1" 来保存项目`;

          return { success: true, data: { query, totalCount: data.total_count, count: repos.length, results: repos, message } };
        }

        case 'trending': {
          const periodText = period === 'today' ? '24小时' : period === 'week' ? '本周' : '本月';
          let repos: any[] = [];
          let usedFallback = false;

          // 尝试 OSS Insight API
          try {
            const ossPeriod = convertPeriodToOSSInsight(period);
            const apiUrl = new URL(`${OSS_INSIGHT_API}/trends/repos`);
            apiUrl.searchParams.set('period', ossPeriod);
            if (language) apiUrl.searchParams.set('language', language);

            const response = await fetchWithRetry(
              apiUrl.toString(),
              { headers: { 'Accept': 'application/json' } },
              { timeout: TIMEOUT_CONFIG.trending, maxRetries: 1 }
            );

            if (response.ok) {
              const data = await response.json();
              repos = (data.data?.rows || []).slice(0, limit).map((item: any, i: number) => ({
                index: i + 1,
                name: item.repo_name?.split('/')[1] || item.repo_name,
                fullName: item.repo_name,
                description: item.description,
                url: `https://github.com/${item.repo_name}`,
                stars: parseInt(item.stars) || 0,
                forks: parseInt(item.forks) || 0,
                language: item.primary_language,
                trendingScore: item.total_score,
              }));
            }
          } catch (ossError) {
            console.warn('[Trending] OSS Insight API failed, trying fallback:', ossError);
          }

          // 备用方案：使用 GitHub Search API 获取最近创建的高星项目
          if (repos.length === 0) {
            usedFallback = true;
            try {
              // 根据 period 计算日期范围
              const now = new Date();
              let dateStr: string;
              if (period === 'today') {
                const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                dateStr = yesterday.toISOString().split('T')[0];
              } else if (period === 'week') {
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                dateStr = weekAgo.toISOString().split('T')[0];
              } else {
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                dateStr = monthAgo.toISOString().split('T')[0];
              }

              // 构建 GitHub Search 查询：最近推送的高星项目
              let searchQuery = `pushed:>${dateStr} stars:>100`;
              if (language) searchQuery += ` language:${language}`;

              const githubUrl = new URL('https://api.github.com/search/repositories');
              githubUrl.searchParams.set('q', searchQuery);
              githubUrl.searchParams.set('sort', 'stars');
              githubUrl.searchParams.set('order', 'desc');
              githubUrl.searchParams.set('per_page', String(limit));

              const headers: Record<string, string> = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'AnyMark-Extension',
              };
              
              // 如果有 GitHub Token，添加认证
              const config = await getSearchConfig();
              if (config.githubToken) {
                headers['Authorization'] = `token ${config.githubToken}`;
              }

              const fallbackResponse = await fetchWithRetry(
                githubUrl.toString(),
                { headers },
                { timeout: TIMEOUT_CONFIG.github }
              );

              if (fallbackResponse.ok) {
                const fallbackData = await fallbackResponse.json();
                repos = (fallbackData.items || []).map((item: any, i: number) => ({
                  index: i + 1,
                  name: item.name,
                  fullName: item.full_name,
                  description: item.description,
                  url: item.html_url,
                  stars: item.stargazers_count || 0,
                  forks: item.forks_count || 0,
                  language: item.language,
                }));
              }
            } catch (fallbackError) {
              console.error('[Trending] Fallback also failed:', fallbackError);
              return { success: false, error: 'Trending 服务暂时不可用，请稍后再试' };
            }
          }

          if (repos.length === 0) {
            return { success: false, error: '未找到热门项目，请稍后再试' };
          }

          let message = `🔥 ${periodText}热门项目 Top ${repos.length}${usedFallback ? ' (via GitHub Search)' : ''}：\n\n`;
          repos.forEach((r: any) => {
            message += `${r.index}. ⭐ ${r.fullName} (${r.stars.toLocaleString()} stars)\n`;
            message += `   ${r.description ? truncate(r.description, 60) : '无描述'}\n`;
            message += `   ${r.language || '未知语言'}\n\n`;
          });
          message += `💡 说 "收藏 1" 来保存项目`;

          return { success: true, data: { period: periodText, count: repos.length, results: repos, message, usedFallback } };
        }

        case 'extract': {
          if (!url) return { success: false, error: '需要提供 URL' };
          if (!url.startsWith('http')) return { success: false, error: '请提供有效的 URL' };

          try {
            const content = await extractFullContent(url);
            const sectionsText = content.sections.map(s => `${'#'.repeat(s.level)} ${s.heading}\n\n${s.content}`).join('\n\n---\n\n');

            return {
              success: true,
              data: {
                url,
                title: content.title,
                excerpt: content.excerpt,
                sections: content.sections,
                formattedContent: sectionsText,
                author: content.byline,
                siteName: content.siteName,
                wordCount: content.length,
                message: `📄 已提取 "${content.title}" 的内容（${content.sections.length} 个章节，约 ${content.length} 字）\n\n💡 说 "收藏这个" 来保存`,
              },
            };
          } catch (error) {
            return { success: false, error: '内容提取失败，请手动查看网页' };
          }
        }

        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Discover failed' };
    }
  },
};

// 更新导出，包含 6 个工具
coreTools.push(discoverTool);
