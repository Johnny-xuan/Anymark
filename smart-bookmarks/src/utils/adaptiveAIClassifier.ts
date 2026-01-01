/**
 * 自适应AI分类器
 * 通过学习用户的书签使用习惯，动态生成个性化的分类体系
 * 不使用固定分类树，让AI根据实际内容自行组织
 */

import type { IBookmark } from '../types/bookmark';

export interface UserClassificationPattern {
  // 用户分类模式
  userFolderPath: string; // 用户原始文件夹路径
  bookmarkCount: number; // 该分类下的书签数量
  commonKeywords: string[]; // 常见关键词
  commonTags: string[]; // 常见标签
  domainPatterns: string[]; // 常见域名模式
  lastUsed: number; // 最后使用时间
  confidence: number; // 置信度
}

export interface AIClassificationContext {
  // AI分类上下文
  existingUserFolders: string[]; // 用户现有的文件夹结构
  userClassificationPatterns: UserClassificationPattern[]; // 用户分类习惯
  recentClassifications: Array<{
    url: string;
    title: string;
    userFolder: string;
    aiSuggestion: string;
    userAccepted: boolean; // 用户是否接受了AI建议
  }>;
  userPreferences: {
    preferredLanguage: 'zh' | 'en'; // 分类名称语言偏好
    granularity: 'detailed' | 'simple'; // 分类粒度
    autoMerge: boolean; // 是否自动合并相似分类
  };
}

export interface AIClassificationResult {
  suggestedFolder: string; // AI建议的文件夹路径
  confidence: number; // 置信度
  reasoning: string; // 分类推理
  alternatives: Array<{
    folder: string;
    confidence: number;
    reason: string;
  }>; // 备选方案
  isNewCategory: boolean; // 是否是新分类
  similarBookmarks: IBookmark[]; // 相似的已分类书签
}

export class AdaptiveAIClassifier {
  private context: AIClassificationContext;

  constructor(context: AIClassificationContext) {
    this.context = context;
  }

  /**
   * 学习用户的分类习惯
   * 通过分析用户现有的书签分类，提取分类模式
   */
  async learnUserPatterns(bookmarks: IBookmark[]): Promise<UserClassificationPattern[]> {
    const folderMap = new Map<string, IBookmark[]>();

    // 按用户文件夹分组
    for (const bookmark of bookmarks) {
      const folder = bookmark.folderPath || '/未分类';
      if (!folderMap.has(folder)) {
        folderMap.set(folder, []);
      }
      folderMap.get(folder)!.push(bookmark);
    }

    const patterns: UserClassificationPattern[] = [];

    // 分析每个文件夹的特征
    for (const [folder, items] of folderMap.entries()) {
      if (items.length === 0) continue;

      // 提取关键词
      const allKeywords: string[] = [];
      const allTags: string[] = [];
      const domains = new Set<string>();
      let lastUsed = 0;

      for (const item of items) {
        // 从标题和摘要提取关键词
        const text = `${item.title} ${item.aiSummary || ''} ${item.userNotes || ''}`;
        const words = text.toLowerCase().match(/\b\w{3,}\b/g) || [];
        allKeywords.push(...words);

        // 收集标签
        allTags.push(...item.aiTags, ...item.userTags);

        // 收集域名
        try {
          const url = new URL(item.url);
          domains.add(url.hostname);
        } catch {}

        // 记录最后使用时间
        if (item.analytics.lastVisit && item.analytics.lastVisit > lastUsed) {
          lastUsed = item.analytics.lastVisit;
        }
      }

      // 统计关键词频率
      const keywordFreq = new Map<string, number>();
      for (const keyword of allKeywords) {
        keywordFreq.set(keyword, (keywordFreq.get(keyword) || 0) + 1);
      }

      // 取前10个最常见的关键词
      const commonKeywords = Array.from(keywordFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word);

      // 统计标签频率
      const tagFreq = new Map<string, number>();
      for (const tag of allTags) {
        tagFreq.set(tag, (tagFreq.get(tag) || 0) + 1);
      }

      const commonTags = Array.from(tagFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);

      // 计算置信度（基于书签数量和使用频率）
      const confidence = Math.min(
        0.5 + (items.length / 50) * 0.3 + // 数量因素
        (lastUsed > 0 ? 0.2 : 0), // 使用因素
        1.0
      );

      patterns.push({
        userFolderPath: folder,
        bookmarkCount: items.length,
        commonKeywords,
        commonTags,
        domainPatterns: Array.from(domains),
        lastUsed,
        confidence,
      });
    }

    // 更新上下文
    this.context.userClassificationPatterns = patterns;

    return patterns;
  }

  /**
   * 智能分类：基于用户习惯和AI分析
   * 不使用固定分类树，完全基于用户现有分类和内容特征
   */
  async classifyBookmark(
    bookmark: IBookmark,
    existingBookmarks: IBookmark[]
  ): Promise<AIClassificationResult> {
    // 1. 检查是否有完全匹配的用户习惯模式
    const patternMatch = this.matchUserPattern(bookmark);

    if (patternMatch && patternMatch.confidence > 0.7) {
      return {
        suggestedFolder: patternMatch.folder,
        confidence: patternMatch.confidence,
        reasoning: patternMatch.reasoning,
        alternatives: [],
        isNewCategory: false,
        similarBookmarks: patternMatch.similarBookmarks,
      };
    }

    // 2. 使用AI动态生成分类建议
    const aiSuggestion = await this.generateAIClassification(bookmark, existingBookmarks);

    return aiSuggestion;
  }

  /**
   * 匹配用户分类模式
   */
  private matchUserPattern(bookmark: IBookmark): {
    folder: string;
    confidence: number;
    reasoning: string;
    similarBookmarks: IBookmark[];
  } | null {
    if (this.context.userClassificationPatterns.length === 0) {
      return null;
    }

    const bookmarkText = `${bookmark.title} ${bookmark.aiSummary || ''} ${bookmark.userNotes || ''}`.toLowerCase();
    const bookmarkTags = new Set([...bookmark.aiTags, ...bookmark.userTags]);
    const bookmarkDomain = this.extractDomain(bookmark.url);

    let bestMatch: {
      folder: string;
      score: number;
      matchedKeywords: string[];
      matchedTags: string[];
    } | null = null;

    for (const pattern of this.context.userClassificationPatterns) {
      let score = 0;
      const matchedKeywords: string[] = [];
      const matchedTags: string[] = [];

      // 关键词匹配 (权重: 40%)
      for (const keyword of pattern.commonKeywords) {
        if (bookmarkText.includes(keyword)) {
          score += 4;
          matchedKeywords.push(keyword);
        }
      }

      // 标签匹配 (权重: 30%)
      for (const tag of pattern.commonTags) {
        if (bookmarkTags.has(tag)) {
          score += 6;
          matchedTags.push(tag);
        }
      }

      // 域名匹配 (权重: 30%)
      if (bookmarkDomain && pattern.domainPatterns.includes(bookmarkDomain)) {
        score += 30;
      }

      // 归一化分数
      const normalizedScore = Math.min(score / 100, 1);

      if (!bestMatch || normalizedScore > bestMatch.score) {
        bestMatch = {
          folder: pattern.userFolderPath,
          score: normalizedScore,
          matchedKeywords,
          matchedTags,
        };
      }
    }

    if (!bestMatch || bestMatch.score < 0.3) {
      return null;
    }

    const reasoning = this.generateMatchReasoning(bestMatch);

    return {
      folder: bestMatch.folder,
      confidence: bestMatch.score,
      reasoning,
      similarBookmarks: [], // TODO: 查找相似书签
    };
  }

  /**
   * 使用AI动态生成分类
   * 这里会调用AI API，让AI基于用户现有分类和内容自行决定
   */
  private async generateAIClassification(
    bookmark: IBookmark,
    existingBookmarks: IBookmark[]
  ): Promise<AIClassificationResult> {
    // 构建AI提示词
    const prompt = this.buildAdaptiveClassificationPrompt(bookmark, existingBookmarks);

    // 调用AI API
    try {
      const { getDefaultAnalyzer } = await import('./aiAnalyzer');
      const analyzer = await getDefaultAnalyzer();

      // 使用自定义prompt进行分类
      const analysis = await analyzer.analyzeBookmark({
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.aiSummary || bookmark.userNotes || '',
      }, {
        existingFolders: this.context.existingUserFolders,
        userPatterns: this.context.userClassificationPatterns,
        customPrompt: prompt,
      });

      // 检查建议的分类是否是新分类
      const isNewCategory = !this.context.existingUserFolders.some(
        folder => folder.toLowerCase() === (analysis.suggestedFolder?.[0]?.path || '').toLowerCase()
      );

      return {
        suggestedFolder: analysis.suggestedFolder?.[0]?.path || '/未分类',
        confidence: analysis.confidence || 0.5,
        reasoning: `AI分析: ${analysis.summary}`,
        alternatives: analysis.suggestedFolder?.slice(1, 3).map(sf => ({
          folder: sf.path,
          confidence: sf.confidence,
          reason: sf.reason,
        })) || [],
        isNewCategory,
        similarBookmarks: [],
      };
    } catch (error) {
      console.error('[AdaptiveAI] Classification failed:', error);

      // 降级：使用本地规则
      return this.fallbackClassification(bookmark);
    }
  }

  /**
   * 构建自适应分类提示词
   * 让AI根据用户现有分类自行组织，而不是使用固定分类树
   */
  private buildAdaptiveClassificationPrompt(
    bookmark: IBookmark,
    existingBookmarks: IBookmark[]
  ): string {
    const userFolders = this.context.existingUserFolders.slice(0, 20); // 只取前20个
    const patterns = this.context.userClassificationPatterns.slice(0, 10);

    let prompt = `你是一个智能书签分类助手。请根据用户的现有分类习惯，为新书签推荐最合适的分类。

**重要原则**：
1. 优先使用用户已有的分类体系，保持一致性
2. 如果现有分类都不合适，可以创建新分类，但要符合用户的命名风格
3. 分类名称要简洁、准确、易于理解
4. 考虑用户的使用习惯和偏好

**用户现有的分类结构**：
`;

    if (userFolders.length > 0) {
      prompt += userFolders.map((f, i) => `${i + 1}. ${f}`).join('\n');
    } else {
      prompt += '(用户还没有创建分类，请根据内容创建合适的分类)';
    }

    prompt += `\n\n**用户的分类习惯特征**：\n`;

    if (patterns.length > 0) {
      for (const pattern of patterns) {
        prompt += `\n- 分类 "${pattern.userFolderPath}":\n`;
        prompt += `  常用标签: ${pattern.commonTags.join(', ')}\n`;
        prompt += `  常见关键词: ${pattern.commonKeywords.slice(0, 5).join(', ')}\n`;
        prompt += `  书签数量: ${pattern.bookmarkCount}\n`;
      }
    } else {
      prompt += '(暂无足够数据分析用户习惯)';
    }

    prompt += `\n\n**待分类的书签**：
- URL: ${bookmark.url}
- 标题: ${bookmark.title}
- 摘要: ${bookmark.aiSummary || bookmark.userNotes || '无'}
- 现有标签: ${[...bookmark.aiTags, ...bookmark.userTags].join(', ') || '无'}

**任务**：
1. 分析这个书签的核心主题和用途
2. 查看用户现有分类，找出最匹配的分类
3. 如果现有分类都不合适，建议创建新分类（使用用户习惯的命名风格）
4. 提供2-3个备选分类方案
5. 解释你的分类逻辑

**返回格式**（JSON）：
{
  "suggestedFolder": [
    {
      "path": "/推荐的分类路径",
      "confidence": 0.85,
      "reason": "选择此分类的原因"
    },
    {
      "path": "/备选分类1",
      "confidence": 0.65,
      "reason": "备选原因"
    }
  ],
  "summary": "简短说明这个书签的主题",
  "tags": ["相关标签1", "相关标签2"],
  "reasoning": "详细的分类推理过程"
}`;

    return prompt;
  }

  /**
   * 降级分类（当AI不可用时）
   */
  private fallbackClassification(bookmark: IBookmark): AIClassificationResult {
    // 基于域名的简单分类
    const domain = this.extractDomain(bookmark.url);
    let suggestedFolder = '/未分类';

    if (domain) {
      // 检查是否有相同域名的已分类书签
      const samePattern = this.context.userClassificationPatterns.find(p =>
        p.domainPatterns.includes(domain)
      );

      if (samePattern) {
        suggestedFolder = samePattern.userFolderPath;
      }
    }

    return {
      suggestedFolder,
      confidence: 0.4,
      reasoning: '无法连接AI服务，使用简单规则分类',
      alternatives: [],
      isNewCategory: false,
      similarBookmarks: [],
    };
  }

  /**
   * 生成匹配推理
   */
  private generateMatchReasoning(match: {
    folder: string;
    matchedKeywords: string[];
    matchedTags: string[];
  }): string {
    let reasoning = `匹配到用户分类 "${match.folder}"`;

    if (match.matchedKeywords.length > 0) {
      reasoning += `\n关键词匹配: ${match.matchedKeywords.join(', ')}`;
    }

    if (match.matchedTags.length > 0) {
      reasoning += `\n标签匹配: ${match.matchedTags.join(', ')}`;
    }

    return reasoning;
  }

  /**
   * 提取域名
   */
  private extractDomain(url: string): string | null {
    try {
      const { hostname } = new URL(url);
      return hostname.replace('www.', '');
    } catch {
      return null;
    }
  }

  /**
   * 记录用户反馈
   * 当用户接受或修改AI建议时，更新学习数据
   */
  async recordUserFeedback(
    bookmark: IBookmark,
    aiSuggestion: string,
    userChosen: string,
    accepted: boolean
  ): Promise<void> {
    this.context.recentClassifications.push({
      url: bookmark.url,
      title: bookmark.title,
      userFolder: userChosen,
      aiSuggestion,
      userAccepted: accepted,
    });

    // 只保留最近100条记录
    if (this.context.recentClassifications.length > 100) {
      this.context.recentClassifications.shift();
    }

    // 保存到本地存储
    await this.saveContext();
  }

  /**
   * 获取分类准确率统计
   */
  getAccuracyStats(): {
    totalClassifications: number;
    acceptedRate: number;
    recentAccuracy: number;
  } {
    const total = this.context.recentClassifications.length;
    if (total === 0) {
      return { totalClassifications: 0, acceptedRate: 0, recentAccuracy: 0 };
    }

    const accepted = this.context.recentClassifications.filter(
      c => c.userAccepted
    ).length;

    // 最近20条的准确率
    const recent20 = this.context.recentClassifications.slice(-20);
    const recentAccepted = recent20.filter(c => c.userAccepted).length;

    return {
      totalClassifications: total,
      acceptedRate: accepted / total,
      recentAccuracy: recentAccepted / recent20.length,
    };
  }

  /**
   * 保存上下文到本地存储
   */
  private async saveContext(): Promise<void> {
    try {
      await chrome.storage.local.set({
        aiClassificationContext: this.context,
      });
    } catch (error) {
      console.error('[AdaptiveAI] Failed to save context:', error);
    }
  }

  /**
   * 从本地存储加载上下文
   */
  static async loadContext(): Promise<AIClassificationContext> {
    try {
      const result = await chrome.storage.local.get('aiClassificationContext');
      if (result.aiClassificationContext) {
        return result.aiClassificationContext;
      }
    } catch (error) {
      console.error('[AdaptiveAI] Failed to load context:', error);
    }

    // 返回默认上下文
    return {
      existingUserFolders: [],
      userClassificationPatterns: [],
      recentClassifications: [],
      userPreferences: {
        preferredLanguage: 'zh',
        granularity: 'simple',
        autoMerge: false,
      },
    };
  }

  /**
   * 更新用户偏好
   */
  updatePreferences(
    preferences: Partial<AIClassificationContext['userPreferences']>
  ): void {
    this.context.userPreferences = {
      ...this.context.userPreferences,
      ...preferences,
    };
    this.saveContext();
  }
}

// 导出单例
let classifierInstance: AdaptiveAIClassifier | null = null;

export async function getAdaptiveClassifier(): Promise<AdaptiveAIClassifier> {
  if (!classifierInstance) {
    const context = await AdaptiveAIClassifier.loadContext();
    classifierInstance = new AdaptiveAIClassifier(context);
  }
  return classifierInstance;
}
