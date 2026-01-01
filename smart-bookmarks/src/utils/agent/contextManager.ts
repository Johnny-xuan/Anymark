/**
 * Context Manager - 对话上下文管理器
 * 管理对话历史、指代解析和上下文压缩
 */

import type { Message } from './types';

/**
 * 解析后的引用
 */
export interface ResolvedReference {
  type: 'bookmark' | 'folder' | 'search_result' | 'index';
  id?: string;
  index?: number;
  originalText: string;
}

/**
 * 上下文管理器配置
 */
export interface ContextManagerConfig {
  maxMessages: number;        // 最大消息数量
  compressThreshold: number;  // 触发压缩的阈值
  keepRecentCount: number;    // 压缩时保留的最近消息数
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  maxMessages: 100,          // 提高到 100 条
  compressThreshold: 80,     // 80 条时触发压缩
  keepRecentCount: 30,       // 保留最近 30 条完整消息
};

/**
 * 上下文管理器
 * 负责管理对话历史、解析指代、压缩上下文
 */
export class ContextManager {
  private messages: Message[] = [];
  private systemMessage: Message | null = null;  // 系统提示词，只设置一次
  private config: ContextManagerConfig;
  private lastSearchResults: any[] = [];
  private lastMentionedBookmarks: { id: string; title: string }[] = [];

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化系统提示词（只调用一次）
   */
  initializeSystem(systemPrompt: string): void {
    if (!this.systemMessage) {
      this.systemMessage = {
        role: 'system' as any,
        content: systemPrompt,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.systemMessage !== null;
  }

  /**
   * 添加消息到历史
   */
  addMessage(message: Message): void {
    this.messages.push(message);

    // 提取工具结果中的实体
    if (message.role === 'tool' && message.name) {
      try {
        const content = typeof message.content === 'string'
          ? JSON.parse(message.content)
          : message.content;

        // 提取搜索结果
        if (message.name === 'search_bookmarks' && content.data?.results) {
          this.lastSearchResults = content.data.results;
          this.lastMentionedBookmarks = content.data.results.map((r: any) => ({
            id: r.id,
            title: r.title,
          }));
        }

        // 提取书签操作结果
        if (content.data?.id && content.data?.title) {
          this.lastMentionedBookmarks = [{
            id: content.data.id,
            title: content.data.title,
          }];
        }
      } catch {
        // 忽略解析错误
      }
    }

    // 检查是否需要压缩
    if (this.messages.length >= this.config.compressThreshold) {
      this.compress();
    }
  }

  /**
   * 获取所有消息（包含系统提示词）
   */
  getAllMessages(): Message[] {
    if (this.systemMessage) {
      return [this.systemMessage, ...this.messages];
    }
    return [...this.messages];
  }

  /**
   * 获取历史消息（不包含系统提示词，用于显示）
   */
  getHistory(limit?: number): Message[] {
    const count = limit || this.config.maxMessages;
    return this.messages.slice(-count);
  }

  /**
   * 获取完整请求消息（系统提示词 + 历史消息）
   */
  getMessagesForRequest(limit?: number): Message[] {
    const history = this.getHistory(limit);
    if (this.systemMessage) {
      return [this.systemMessage, ...history];
    }
    return history;
  }

  /**
   * 清空历史（保留系统提示词）
   */
  clear(): void {
    this.messages = [];
    this.lastSearchResults = [];
    this.lastMentionedBookmarks = [];
    // 注意：不清除 systemMessage，它是会话的 Rules
  }

  /**
   * 完全重置（包括系统提示词）
   */
  reset(): void {
    this.clear();
    this.systemMessage = null;
  }

  /**
   * 压缩历史消息
   * 优化策略：保留关键消息（user/assistant）+ 关键工具结果（压缩后）
   * 这样既减少消息数，又保留重要的工具执行结果
   */
  compress(): void {
    if (this.messages.length <= this.config.keepRecentCount) {
      return;
    }

    const recentMessages = this.messages.slice(-this.config.keepRecentCount);
    const oldMessages = this.messages.slice(0, -this.config.keepRecentCount);

    // 关键工具列表（需要保留结果的工具）
    const importantTools = ['search', 'organize', 'context'];

    // 从旧消息中保留关键消息：
    // 1. 所有 user 消息（用户意图）
    // 2. 所有 assistant 消息（AI 回复）
    // 3. 关键工具的结果（压缩后）
    const importantMessages: Message[] = [];
    oldMessages.forEach(msg => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        importantMessages.push(msg);
      } else if (msg.role === 'tool' && msg.name && importantTools.includes(msg.name)) {
        // 保留关键工具结果，但压缩内容
        const compressed = this.compressToolResult(msg);
        importantMessages.push(compressed);
      }
      // 其他 tool 消息被跳过
    });

    // 重组消息列表
    this.messages = [...importantMessages, ...recentMessages];

    console.log(`[ContextManager] Compressed: ${oldMessages.length} → ${importantMessages.length} (kept ${recentMessages.length} recent)`);
  }

  /**
   * 压缩工具结果
   * 只保留关键信息，删除详细数据
   */
  private compressToolResult(msg: Message): Message {
    try {
      const content = typeof msg.content === 'string' 
        ? JSON.parse(msg.content) 
        : msg.content;

      // 构建压缩后的内容
      const compressed: any = {
        success: content.success,
      };

      // 根据工具类型保留不同的信息
      if (msg.name === 'search') {
        compressed.summary = `找到 ${content.data?.count || 0} 个结果`;
        if (content.data?.results?.length > 0) {
          compressed.topResults = content.data.results.slice(0, 3).map((r: any) => r.title);
        }
      } else if (msg.name === 'organize') {
        if (content.data?.analyzedCount !== undefined) {
          compressed.summary = `分析了 ${content.data.analyzedCount} 个书签`;
        } else if (content.data?.successCount !== undefined) {
          compressed.summary = `移动了 ${content.data.successCount} 个书签`;
        } else {
          compressed.summary = content.data?.message || '操作完成';
        }
      } else if (msg.name === 'context') {
        compressed.summary = `获取了 ${content.data?.total || content.data?.count || 0} 个书签的上下文`;
      } else {
        compressed.summary = content.message || '操作成功';
      }

      return {
        ...msg,
        content: JSON.stringify(compressed),
      };
    } catch (error) {
      // 解析失败，返回简化版本
      return {
        ...msg,
        content: JSON.stringify({ success: true, summary: '操作完成' }),
      };
    }
  }

  /**
   * 生成消息摘要（已废弃，保留用于向后兼容）
   */
  private generateSummary(messages: Message[]): string {
    const topics: string[] = [];
    const actions: string[] = [];

    messages.forEach(msg => {
      if (msg.role === 'user') {
        // 提取用户话题
        const content = (msg.content || '').slice(0, 50);
        if (!topics.includes(content)) {
          topics.push(content);
        }
      } else if (msg.role === 'tool' && msg.name) {
        // 记录执行的操作
        if (!actions.includes(msg.name)) {
          actions.push(msg.name);
        }
      }
    });

    const parts: string[] = [];
    if (topics.length > 0) {
      parts.push(`讨论了: ${topics.slice(0, 3).join(', ')}`);
    }
    if (actions.length > 0) {
      parts.push(`执行了: ${actions.join(', ')}`);
    }

    return parts.join('。') || '之前的对话内容';
  }

  /**
   * 解析指代
   * 解析中英文指代词：
   * - 中文："第一个"、"上一个"、"最后一个"、"那个书签"、"它"
   * - 英文："the first one"、"the last one"、"that project"、"it"
   */
  resolveReference(text: string): ResolvedReference | null {
    const lowerText = text.toLowerCase();

    // === 特殊指代 ===
    // 中文："上一个"、"上个"
    // 英文："the previous one"、"previous"
    if (/上一个|上个|the previous one|previous one/i.test(text)) {
      if (this.lastMentionedBookmarks.length > 0) {
        const bookmark = this.lastMentionedBookmarks[0];
        return {
          type: 'bookmark',
          id: bookmark.id,
          originalText: text.match(/上一个|上个|the previous one|previous one/i)?.[0] || '',
        };
      }
    }

    // 中文："最后一个"、"最后那个"
    // 英文："the last one"、"last one"
    if (/最后一个|最后那个|the last one|last one/i.test(text)) {
      if (this.lastSearchResults.length > 0) {
        const result = this.lastSearchResults[this.lastSearchResults.length - 1];
        return {
          type: 'search_result',
          id: result.id,
          index: this.lastSearchResults.length - 1,
          originalText: text.match(/最后一个|最后那个|the last one|last one/i)?.[0] || '',
        };
      }
    }

    // === 数字索引引用 ===
    // 中文："第一个"、"第二个"、"第1个"、"1号"、"第1条"
    const chineseIndexPatterns = [
      /第([一二三四五六七八九十\d]+)个/,
      /(\d+)号/,
      /第(\d+)条/,
    ];

    for (const pattern of chineseIndexPatterns) {
      const match = text.match(pattern);
      if (match) {
        const index = this.parseChineseNumber(match[1]);
        if (index !== null && index > 0) {
          if (this.lastSearchResults.length >= index) {
            const result = this.lastSearchResults[index - 1];
            return {
              type: 'search_result',
              id: result.id,
              index: index - 1,
              originalText: match[0],
            };
          }
          return {
            type: 'index',
            index: index - 1,
            originalText: match[0],
          };
        }
      }
    }

    // 英文："the first one"、"the second one"、"number 1"、"#1"
    const englishIndexPatterns = [
      /the (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) (?:one|result|item|bookmark|project)/i,
      /(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) (?:one|result|item|bookmark|project)/i,
      /(?:number|#)\s*(\d+)/i,
      /(?:result|item|bookmark|project)\s*(\d+)/i,
      /(\d+)(?:st|nd|rd|th)\s+(?:one|result|item|bookmark|project)/i,
    ];

    const ordinalMap: Record<string, number> = {
      'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
      'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10,
    };

    for (const pattern of englishIndexPatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        let index: number | null = null;
        
        // 尝试解析序数词
        if (ordinalMap[match[1]?.toLowerCase()]) {
          index = ordinalMap[match[1].toLowerCase()];
        } else {
          // 尝试解析数字
          index = parseInt(match[1], 10);
        }

        if (index !== null && index > 0) {
          if (this.lastSearchResults.length >= index) {
            const result = this.lastSearchResults[index - 1];
            return {
              type: 'search_result',
              id: result.id,
              index: index - 1,
              originalText: match[0],
            };
          }
          return {
            type: 'index',
            index: index - 1,
            originalText: match[0],
          };
        }
      }
    }

    // === 代词引用 ===
    // 中文："它"、"这个"、"那个"、"这个书签"、"那个书签"
    // 英文："it"、"this"、"that"、"this bookmark"、"that project"
    const pronounPatterns = [
      // 中文
      /这个书签/,
      /那个书签/,
      /这个项目/,
      /那个项目/,
      /它/,
      /这个/,
      /那个/,
      // 英文
      /this bookmark/i,
      /that bookmark/i,
      /this project/i,
      /that project/i,
      /this one/i,
      /that one/i,
      /\bit\b/i,  // 单独的 "it"，使用 word boundary
    ];

    for (const pattern of pronounPatterns) {
      if (pattern.test(text)) {
        // 返回最近提到的书签
        if (this.lastMentionedBookmarks.length > 0) {
          const bookmark = this.lastMentionedBookmarks[0];
          return {
            type: 'bookmark',
            id: bookmark.id,
            originalText: text.match(pattern)?.[0] || '',
          };
        }
      }
    }

    // === 标题引用 ===
    // 直接匹配书签标题
    for (const bookmark of this.lastMentionedBookmarks) {
      if (lowerText.includes(bookmark.title.toLowerCase())) {
        return {
          type: 'bookmark',
          id: bookmark.id,
          originalText: bookmark.title,
        };
      }
    }

    return null;
  }

  /**
   * 解析中文数字
   */
  private parseChineseNumber(str: string): number | null {
    const chineseNumbers: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
      '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    };

    // 直接数字
    const num = parseInt(str, 10);
    if (!isNaN(num)) {
      return num;
    }

    // 中文数字
    if (chineseNumbers[str] !== undefined) {
      return chineseNumbers[str];
    }

    // 复合中文数字（如"十一"）
    if (str.startsWith('十')) {
      if (str.length === 1) return 10;
      const rest = str.slice(1);
      const restNum = chineseNumbers[rest];
      if (restNum !== undefined) {
        return 10 + restNum;
      }
    }

    return null;
  }

  /**
   * 获取最近的搜索结果
   */
  getLastSearchResults(): any[] {
    return this.lastSearchResults;
  }

  /**
   * 获取最近提到的书签
   */
  getLastMentionedBookmarks(): { id: string; title: string }[] {
    return this.lastMentionedBookmarks;
  }

  /**
   * 设置最近的搜索结果（用于外部更新）
   */
  setLastSearchResults(results: any[]): void {
    this.lastSearchResults = results;
    this.lastMentionedBookmarks = results.map((r: any) => ({
      id: r.id,
      title: r.title,
    }));
  }

  /**
   * 获取消息数量
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * 导出上下文（用于存档）
   */
  export(): {
    messages: Message[];
    lastSearchResults: any[];
    lastMentionedBookmarks: { id: string; title: string }[];
  } {
    return {
      messages: [...this.messages],
      lastSearchResults: [...this.lastSearchResults],
      lastMentionedBookmarks: [...this.lastMentionedBookmarks],
    };
  }

  /**
   * 导入上下文（用于恢复存档）
   */
  import(data: {
    messages: Message[];
    lastSearchResults?: any[];
    lastMentionedBookmarks?: { id: string; title: string }[];
  }): void {
    this.messages = [...data.messages];
    this.lastSearchResults = data.lastSearchResults || [];
    this.lastMentionedBookmarks = data.lastMentionedBookmarks || [];
  }
}

// 导出默认实例
export const contextManager = new ContextManager();
