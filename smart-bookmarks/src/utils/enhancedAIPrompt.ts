/**
 * 增强的AI Prompt生成器
 * 结合用户习惯、标签约束、分类示例，生成更智能的提示词
 */

import type { IBookmark } from '../types/bookmark';
import type { UserClassificationPattern } from './adaptiveAIClassifier';

export interface PromptContext {
  // 用户现有分类
  existingFolders?: string[];
  recentFolders?: string[];
  
  // 相似书签
  similarBookmarks?: IBookmark[];
  
  // 用户常用标签
  userCommonTags?: string[];
  
  // 用户分类习惯
  userPatterns?: UserClassificationPattern[];
  
  // 自定义prompt片段
  customPrompt?: string;
}

export class EnhancedAIPromptBuilder {
  /**
   * 构建增强的AI分析提示词
   * 包含用户上下文、习惯、标签约束等
   */
  static buildEnhancedPrompt(
    url: string,
    title: string,
    description: string,
    bodyText: string,
    context?: PromptContext
  ): string {
    let prompt = `你是一个智能书签分析专家。请分析以下网页并提供分类建议。

**重要：请遵循用户的现有分类体系和标签习惯，保持一致性。**

【待分析网页】
- URL: ${url}
- 标题: ${title}
- 描述: ${description || '无'}
- 内容摘要: ${bodyText || '无'}
`;

    // 添加用户上下文
    if (context) {
      // 用户现有文件夹
      if (context.existingFolders && context.existingFolders.length > 0) {
        prompt += `\n【用户现有分类】（优先使用这些分类）：\n`;
        const folders = context.existingFolders.slice(0, 15);
        prompt += folders.map((f, i) => `${i + 1}. ${f}`).join('\n');
      }

      // 用户最近使用的文件夹
      if (context.recentFolders && context.recentFolders.length > 0) {
        prompt += `\n\n【最近使用的分类】（这些分类使用频率较高）：\n`;
        prompt += context.recentFolders.slice(0, 5).join(', ');
      }

      // 相似书签的分类示例
      if (context.similarBookmarks && context.similarBookmarks.length > 0) {
        prompt += `\n\n【相似书签的分类示例】：\n`;
        for (const similar of context.similarBookmarks.slice(0, 3)) {
          const tags = [...similar.aiTags, ...similar.userTags].slice(0, 3).join(', ');
          prompt += `- "${similar.title}" → 分类: ${similar.folderPath}`;
          if (tags) {
            prompt += `, 标签: ${tags}`;
          }
          prompt += '\n';
        }
      }

      // 用户常用标签（标签约束）
      if (context.userCommonTags && context.userCommonTags.length > 0) {
        prompt += `\n【用户常用标签】（优先使用这些标签）：\n`;
        prompt += context.userCommonTags.slice(0, 20).join(', ');
      }

      // 用户分类习惯模式
      if (context.userPatterns && context.userPatterns.length > 0) {
        prompt += `\n\n【用户分类习惯】：\n`;
        for (const pattern of context.userPatterns.slice(0, 3)) {
          prompt += `- "${pattern.userFolderPath}" 分类下常见：\n`;
          if (pattern.commonKeywords.length > 0) {
            prompt += `  关键词: ${pattern.commonKeywords.slice(0, 5).join(', ')}\n`;
          }
          if (pattern.commonTags.length > 0) {
            prompt += `  标签: ${pattern.commonTags.join(', ')}\n`;
          }
        }
      }

      // 自定义prompt
      if (context.customPrompt) {
        prompt += `\n\n${context.customPrompt}\n`;
      }
    }

    prompt += `\n【分析任务】：
1. 理解网页的核心主题和用途
2. 参考用户现有的分类体系，找出最匹配的分类
3. 使用用户常用的标签词汇，保持标签一致性
4. 如果现有分类都不合适，建议符合用户命名风格的新分类
5. 提供清晰的分类推理

【返回格式】（纯JSON，不要任何其他文字）：
{
  "summary": "精准的40-80字内容总结，说明核心价值",
  "category": "内容类别",
  "techStack": ["相关技术"],
  "suggestedFolder": [
    {
      "path": "/推荐分类1",
      "confidence": 0.85,
      "reason": "选择原因"
    },
    {
      "path": "/备选分类2",
      "confidence": 0.65,
      "reason": "备选原因"
    }
  ],
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "confidence": 0.85,
  "difficulty": "beginner/intermediate/advanced",
  "reasoning": "分类推理过程"
}

**要求**：
✓ 优先匹配用户现有分类
✓ 使用用户常用标签词汇
✓ 保持分类命名风格一致
✓ 标签具体实用，避免泛泛而谈
✓ 只返回JSON，不要解释文字`;

    return prompt;
  }

  /**
   * 提取用户常用标签
   */
  static extractCommonTags(bookmarks: IBookmark[], limit: number = 20): string[] {
    const tagFreq = new Map<string, number>();

    for (const bookmark of bookmarks) {
      const tags = [...bookmark.aiTags, ...bookmark.userTags];
      for (const tag of tags) {
        tagFreq.set(tag, (tagFreq.get(tag) || 0) + 1);
      }
    }

    return Array.from(tagFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => tag);
  }

  /**
   * 获取最近使用的文件夹
   */
  static getRecentFolders(bookmarks: IBookmark[], limit: number = 5): string[] {
    // 按创建时间排序，取最近的文件夹
    const recentBookmarks = [...bookmarks]
      .sort((a, b) => b.createTime - a.createTime)
      .slice(0, 20);

    const folderSet = new Set<string>();
    for (const bookmark of recentBookmarks) {
      if (bookmark.folderPath) {
        folderSet.add(bookmark.folderPath);
      }
      if (folderSet.size >= limit) break;
    }

    return Array.from(folderSet);
  }

  /**
   * 查找相似书签
   */
  static findSimilarBookmarks(
    targetUrl: string,
    targetTitle: string,
    allBookmarks: IBookmark[],
    limit: number = 3
  ): IBookmark[] {
    const targetDomain = this.extractDomain(targetUrl);
    const targetWords = new Set(
      targetTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );

    const scored = allBookmarks
      .map(bookmark => {
        let score = 0;

        // 域名匹配
        const bookmarkDomain = this.extractDomain(bookmark.url);
        if (bookmarkDomain === targetDomain) {
          score += 50;
        }

        // 标题词匹配
        const bookmarkWords = new Set(
          bookmark.title.toLowerCase().split(/\s+/).filter(w => w.length > 2)
        );
        const commonWords = [...targetWords].filter(w => bookmarkWords.has(w));
        score += commonWords.length * 10;

        return { bookmark, score };
      })
      .filter(({ score }) => score > 10)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(({ bookmark }) => bookmark);
  }

  /**
   * 提取域名
   */
  private static extractDomain(url: string): string | null {
    try {
      const { hostname } = new URL(url);
      return hostname.replace('www.', '');
    } catch {
      return null;
    }
  }
}
