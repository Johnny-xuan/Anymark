/**
 * 智能搜索引擎 - 基于 Fuse.js
 */

import Fuse from 'fuse.js';
import type { IBookmark, ISearchResult, ISearchMatch } from '../types/bookmark';

// 搜索字段配置及其权重
const searchConfiguration = {
  keys: [
    // 最高权重 - 直接匹配
    { name: 'title', weight: 0.35 },
    { name: 'userTitle', weight: 0.30 },

    // 高权重 - 用户标注
    { name: 'userTags', weight: 0.15 },
    { name: 'userNotes', weight: 0.10 },

    // 中权重 - AI生成内容
    { name: 'aiSummary', weight: 0.20 },
    { name: 'aiTags', weight: 0.10 },
    { name: 'aiCategory', weight: 0.08 },

    // 低权重 - 路径和URL
    { name: 'folderPath', weight: 0.12 },
    { name: 'url', weight: 0.05 },
  ],
  options: {
    threshold: 0.3, // 相似度阈值（越小越严格）
    distance: 100, // 匹配距离
    minMatchCharLength: 2, // 最小匹配字符数
    ignoreLocation: true, // 忽略匹配位置
    useExtendedSearch: true, // 启用高级搜索
    includeScore: true, // 包含评分
    includeMatches: true, // 包含匹配信息
  },
};

export class IntelligentSearchEngine {
  private fuse: Fuse<IBookmark>;
  private bookmarks: IBookmark[];

  constructor(bookmarks: IBookmark[]) {
    this.bookmarks = bookmarks;
    this.fuse = new Fuse(bookmarks, {
      keys: searchConfiguration.keys,
      ...searchConfiguration.options,
    });
  }

  /**
   * 执行搜索
   */
  search(query: string): ISearchResult[] {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const results = this.fuse.search(query);

    return results.map((result) => ({
      item: result.item,
      score: result.score || 0,
      matches: this.processMatches(result.matches ? [...result.matches] : []),
      highlights: this.generateHighlights(result.matches ? [...result.matches] : []),
    }));
  }

  /**
   * 更新书签数据
   */
  updateBookmarks(bookmarks: IBookmark[]) {
    this.bookmarks = bookmarks;
    this.fuse = new Fuse(bookmarks, {
      keys: searchConfiguration.keys,
      ...searchConfiguration.options,
    });
  }

  /**
   * 处理匹配信息
   */
  private processMatches(matches: any[]): ISearchMatch[] {
    return matches.map((match) => ({
      field: match.key,
      value: match.value,
      indices: match.indices,
    }));
  }

  /**
   * 生成高亮片段
   */
  private generateHighlights(matches: any[]): Record<string, string> {
    const highlights: Record<string, string> = {};

    matches.forEach((match) => {
      const field = match.key;
      const text = match.value;
      const indices = match.indices;

      highlights[field] = this.highlightText(text, indices);
    });

    return highlights;
  }

  /**
   * 文本高亮处理
   */
  private highlightText(text: string, indices: [number, number][]): string {
    if (!text || !indices || indices.length === 0) {
      return text;
    }

    let result = '';
    let lastIndex = 0;

    indices.forEach(([start, end]) => {
      // 添加未匹配的文本
      result += text.substring(lastIndex, start);
      // 添加匹配的文本（带标记）
      result += `<mark>${text.substring(start, end + 1)}</mark>`;
      lastIndex = end + 1;
    });

    // 添加剩余文本
    result += text.substring(lastIndex);

    return result;
  }

  /**
   * 获取搜索建议
   */
  getSuggestions(input: string, limit: number = 5): string[] {
    if (!input || input.length < 1) {
      return [];
    }

    // 从所有书签中提取可能的搜索词
    const suggestions = new Set<string>();

    this.bookmarks.forEach((bookmark) => {
      // 从标题中提取
      const words = bookmark.title.toLowerCase().split(/\s+/);
      words.forEach((word) => {
        if (word.includes(input.toLowerCase()) && word.length > 2) {
          suggestions.add(word);
        }
      });

      // 从标签中提取
      [...bookmark.userTags, ...bookmark.aiTags].forEach((tag) => {
        if (tag.toLowerCase().includes(input.toLowerCase())) {
          suggestions.add(tag);
        }
      });
    });

    return Array.from(suggestions).slice(0, limit);
  }
}

// 导出单例工厂
let searchEngineInstance: IntelligentSearchEngine | null = null;

export function getSearchEngine(bookmarks?: IBookmark[]): IntelligentSearchEngine {
  if (!searchEngineInstance && bookmarks) {
    searchEngineInstance = new IntelligentSearchEngine(bookmarks);
  } else if (searchEngineInstance && bookmarks) {
    searchEngineInstance.updateBookmarks(bookmarks);
  }

  if (!searchEngineInstance) {
    throw new Error('Search engine not initialized');
  }

  return searchEngineInstance;
}
