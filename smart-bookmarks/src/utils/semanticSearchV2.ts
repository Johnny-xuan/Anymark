/**
 * 智能语义搜索引擎 - 改进版
 * 核心思路：对 AI 总结进行分词，建立倒排索引，用 TF-IDF 排序
 */

import type { IBookmark, ISearchResult } from '../types/bookmark';

// 中文分词简单实现（基于词典和正则）
function tokenizeChinese(text: string): string[] {
  if (!text) return [];

  // 英文直接转小写
  const englishWords = text.match(/[a-zA-Z]+/g)?.map(w => w.toLowerCase()) || [];

  // 中文分词：使用简单的最大匹配算法 + 常用词词典
  const chineseDict = new Set([
    // 常用词
    '数据库', '优化', '性能', '调优', '教程', '指南', '入门', '进阶',
    '开发', '编程', '代码', '函数', '变量', '对象', '类', '接口',
    '前端', '后端', '全栈', '框架', '库', '工具',
    '人工智能', '机器学习', '深度学习', '神经网络',
    '设计', '模式', '架构', '原理', '实现',
    '安装', '配置', '部署', '运行', '测试',
    '文件', '目录', '路径', '网络', '请求', '响应',
    '数据', '存储', '缓存', '索引', '查询',
    '算法', '数据结构', '排序', '搜索',
    '用户', '界面', '交互', '体验',
    '安全', '认证', '授权', '加密',
    '系统', '操作', '管理', '监控',
  ]);

  // 简单分词：按长度切分
  const chineseChars = text.replace(/[a-zA-Z0-9\s，。！？、]/g, '');
  const chineseWords: string[] = [];

  // 2-4字词最大匹配
  let i = 0;
  while (i < chineseChars.length) {
    let matched = false;
    // 优先匹配 4 字词
    if (i + 4 <= chineseChars.length) {
      const word = chineseChars.substring(i, i + 4);
      if (chineseDict.has(word)) {
        chineseWords.push(word);
        i += 4;
        matched = true;
        continue;
      }
    }
    // 匹配 3 字词
    if (i + 3 <= chineseChars.length) {
      const word = chineseChars.substring(i, i + 3);
      if (chineseDict.has(word)) {
        chineseWords.push(word);
        i += 3;
        matched = true;
        continue;
      }
    }
    // 匹配 2 字词
    if (i + 2 <= chineseChars.length) {
      const word = chineseChars.substring(i, i + 2);
      if (chineseDict.has(word)) {
        chineseWords.push(word);
        i += 2;
        matched = true;
        continue;
      }
    }
    // 单字作为兜底
    if (!matched) {
      chineseWords.push(chineseChars[i]);
      i++;
    }
  }

  return [...englishWords, ...chineseWords].filter(w => w.length > 1);
}

// 英文分词
function tokenizeEnglish(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
}

// 统一分词接口
function tokenize(text: string): string[] {
  if (!text) return [];
  return [...new Set([...tokenizeChinese(text), ...tokenizeEnglish(text)])];
}

// 同义词扩展
const SYNONYMS: Record<string, string[]> = {
  // 数据库
  '数据库': ['mysql', 'postgresql', 'mongodb', 'redis', 'sql', 'database', 'db'],
  'mysql': ['数据库', 'sql', 'database', 'db'],
  'sql': ['数据库', 'mysql', 'postgresql'],
  'database': ['数据库', 'db', 'sql'],

  // AI / 机器学习
  'ai': ['人工智能', '机器学习', 'machine learning', '深度学习', 'llm', '大模型'],
  '人工智能': ['ai', 'machine learning', '深度学习'],
  '机器学习': ['ai', 'machine learning', 'ml'],
  '深度学习': ['ai', 'deep learning', '神经网络'],

  // 前端
  '前端': ['frontend', 'react', 'vue', 'html', 'css', 'javascript'],
  'react': ['前端', 'reactjs', 'jsx'],
  'vue': ['前端', 'vuejs'],

  // 后端
  '后端': ['backend', 'server', 'api', 'node', 'python', 'java'],
  'api': ['后端', '接口', 'rest'],

  // 性能
  '性能': ['performance', '优化', '优化', 'speed', 'fast'],
  '优化': ['性能', 'optimization', '调优'],

  // 教程
  '教程': ['tutorial', '入门', 'guide', '学习', 'course'],
  '入门': ['教程', 'tutorial', ' beginner', '初学'],

  // 开发
  '开发': ['development', 'dev', '编程', 'coding', 'programming'],
  '编程': ['开发', 'coding', 'program'],

  // ========== 金融相关 ==========
  '金融': ['finance', '银行', '银行卡', '支付', '理财', '投资', '保险', 'fintech', '数字货币', '加密货币', '虚拟货币'],
  'finance': ['金融', '银行', '理财', '投资'],
  '银行': ['金融', '银行卡', '账户', '存取款'],
  '银行卡': ['银行', '信用卡', '借记卡', '虚拟卡', 'digital card'],
  '信用卡': ['银行卡', 'credit card', '信用', '还款'],
  '支付': ['pay', '付款', '转账', '收款', '交易'],
  '理财': ['投资', '财富', '资产管理', '收益'],
  '投资': ['理财', '基金', '股票', '证券', '资产'],
  '虚拟卡': ['virtual card', '虚拟银行卡', '数字卡', 'e-card'],
  '加密货币': ['crypto', '数字货币', '比特币', '区块链', 'bitcoin', 'eth'],
  '区块链': ['blockchain', '加密货币', '智能合约', 'web3'],

  // ========== 常用分类关联 ==========
  '产品': ['product', '产品经理', 'pm', '需求', '功能'],
  '运营': ['operation', '运营', '增长', '用户运营', '内容运营'],
  '数据': ['data', '数据分析', '大数据', '指标', '统计'],
};

// AI 分类关键词映射
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'AI': ['ai', '人工智能', '机器学习', '深度学习', 'llm', 'gpt', '大语言模型', '神经网络', 'transformer'],
  'Development': ['开发', '编程', 'code', 'programming', '开发', 'coding', '前端', '后端', '全栈'],
  'Design': ['设计', 'ui', 'ux', '设计', '视觉', '交互', '原型', 'figma'],
  'Productivity': ['效率', '工具', '生产力', '时间管理', '工作流', '自动化'],
  'Learning': ['教程', '学习', '入门', '教程', '课程', '指南', '学习'],
};

// 扩展查询词
function expandQuery(query: string): string[] {
  const words = tokenize(query);
  const expanded = new Set<string>(words);

  words.forEach(word => {
    // 同义词扩展
    if (SYNONYMS[word]) {
      SYNONYMS[word].forEach(s => expanded.add(s));
    }
    // 反向查找
    Object.entries(SYNONYMS).forEach(([key, values]) => {
      if (values.includes(word)) {
        expanded.add(key);
        values.forEach(v => expanded.add(v));
      }
    });
  });

  return Array.from(expanded);
}

// TF-IDF 计算
interface TFIDFIndex {
  termToBookmarks: Map<string, Set<string>>; // 词 -> 书签ID集合
  bookmarkTerms: Map<string, Map<string, number>>; // 书签ID -> 词 -> TF-IDF
  idf: Map<string, number>; // 词 -> IDF
  totalBookmarks: number;
}

export class SemanticSearchEngine {
  private bookmarks: IBookmark[];
  private index: TFIDFIndex;

  constructor(bookmarks: IBookmark[]) {
    this.bookmarks = bookmarks;
    this.index = this.buildIndex();
  }

  /**
   * 构建 TF-IDF 倒排索引
   */
  private buildIndex(): TFIDFIndex {
    const index: TFIDFIndex = {
      termToBookmarks: new Map(),
      bookmarkTerms: new Map(),
      idf: new Map(),
      totalBookmarks: this.bookmarks.length,
    };

    // 第一步：统计词频 (TF)
    this.bookmarks.forEach(bookmark => {
      const terms = this.extractTerms(bookmark);
      const tf = new Map<string, number>();

      terms.forEach(term => {
        tf.set(term, (tf.get(term) || 0) + 1);
      });

      // 归一化 TF
      const total = terms.length;
      tf.forEach((count, term) => {
        tf.set(term, count / total);
      });

      index.bookmarkTerms.set(bookmark.id, tf);

      // 更新倒排索引
      terms.forEach(term => {
        if (!index.termToBookmarks.has(term)) {
          index.termToBookmarks.set(term, new Set());
        }
        index.termToBookmarks.get(term)!.add(bookmark.id);
      });
    });

    // 第二步：计算 IDF
    index.termToBookmarks.forEach((bookmarkIds, term) => {
      const idf = Math.log(index.totalBookmarks / bookmarkIds.size + 1);
      index.idf.set(term, idf);
    });

    return index;
  }

  /**
   * 从书签提取可搜索的词
   */
  private extractTerms(bookmark: IBookmark): string[] {
    const terms = new Set<string>();

    // 从标题提取
    tokenize(bookmark.title).forEach(t => terms.add(t));

    // 从 URL 提取
    try {
      const url = new URL(bookmark.url);
      url.hostname.split('.').forEach(p => {
        if (p.length > 2 && p !== 'www') {
          tokenize(p).forEach(t => terms.add(t));
        }
      });
    } catch {}

    // 从 AI 总结提取（核心！）
    if (bookmark.aiSummary) {
      tokenize(bookmark.aiSummary).forEach(t => terms.add(t));
    }

    // 从 AI 标签提取
    bookmark.aiTags?.forEach(tag => {
      tokenize(tag).forEach(t => terms.add(t));
    });

    // 从 AI 分类提取
    if (bookmark.aiCategory) {
      tokenize(bookmark.aiCategory).forEach(t => terms.add(t));

      // 添加分类关联词
      const categoryWords = CATEGORY_KEYWORDS[bookmark.aiCategory] || [];
      categoryWords.forEach(w => terms.add(w));
    }

    // 从文件夹路径提取（重要！）
    if (bookmark.folderPath) {
      // 路径如 "/金融/银行卡" 提取 "金融"、"银行卡"
      const pathParts = bookmark.folderPath.split('/').filter(Boolean);
      pathParts.forEach(part => {
        tokenize(part).forEach(t => terms.add(t));
        // 添加关联词
        Object.entries(SYNONYMS).forEach(([key, values]) => {
          if (values.includes(part) || part.includes(key)) {
            terms.add(key);
            values.forEach(v => terms.add(v));
          }
        });
      });
    }

    return Array.from(terms);
  }

  /**
   * 计算书签与查询的相关性分数
   */
  private computeScore(bookmarkId: string, queryTerms: string[]): number {
    const tf = this.index.bookmarkTerms.get(bookmarkId);
    if (!tf) return 0;

    let score = 0;

    queryTerms.forEach(term => {
      const tfValue = tf.get(term) || 0;
      const idfValue = this.index.idf.get(term) || 0;
      score += tfValue * idfValue;
    });

    return score;
  }

  /**
   * 执行语义搜索
   */
  search(query: string): ISearchResult[] {
    if (!query || query.trim().length < 1) {
      return [];
    }

    const queryLower = query.toLowerCase().trim();

    // 1. 关键词搜索 - 精确匹配（最高优先级）
    const keywordMatches = this.bookmarks.filter(b => {
      const titleMatch = b.title.toLowerCase().includes(queryLower);
      const urlMatch = b.url.toLowerCase().includes(queryLower);
      const summaryMatch = b.aiSummary?.toLowerCase().includes(queryLower);
      const tagsMatch = b.aiTags?.some(t => t.toLowerCase().includes(queryLower));
      const categoryMatch = b.aiCategory?.toLowerCase().includes(queryLower);

      return titleMatch || urlMatch || summaryMatch || tagsMatch || categoryMatch;
    });

    // 2. 语义搜索 - 分词 + TF-IDF
    const expandedTerms = expandQuery(query);
    const semanticMatches = new Map<string, { bookmark: IBookmark; score: number }>();

    this.bookmarks.forEach(bookmark => {
      const score = this.computeScore(bookmark.id, expandedTerms);
      if (score > 0) {
        semanticMatches.set(bookmark.id, { bookmark, score });
      }
    });

    // 3. 合并结果
    const results: ISearchResult[] = [];
    const seenIds = new Set<string>();

    // 先添加关键词匹配的结果（优先级最高）
    for (const b of keywordMatches) {
      if (!seenIds.has(b.id)) {
        seenIds.add(b.id);
        results.push({
          item: b,
          score: 1.0, // 关键词匹配满分
          matches: [],
          highlights: {},
        });
      }
    }

    // 再添加语义匹配的结果（按分数排序）
    const sortedSemantic = Array.from(semanticMatches.values())
      .filter(item => !seenIds.has(item.bookmark.id))
      .sort((a, b) => b.score - a.score);

    for (const { bookmark, score } of sortedSemantic) {
      if (!seenIds.has(bookmark.id)) {
        seenIds.add(bookmark.id);
        // 归一化分数到 0-1
        const normalizedScore = Math.min(score * 10, 0.99);
        results.push({
          item: bookmark,
          score: normalizedScore,
          matches: [],
          highlights: {},
        });
      }
    }

    return results;
  }

  /**
   * 更新索引
   */
  updateBookmarks(bookmarks: IBookmark[]) {
    this.bookmarks = bookmarks;
    this.index = this.buildIndex();
  }
}

// 单例工厂
let searchEngineInstance: SemanticSearchEngine | null = null;

export function getSearchEngine(bookmarks?: IBookmark[]): SemanticSearchEngine {
  if (!searchEngineInstance && bookmarks) {
    searchEngineInstance = new SemanticSearchEngine(bookmarks);
  } else if (searchEngineInstance && bookmarks) {
    searchEngineInstance.updateBookmarks(bookmarks);
  }

  if (!searchEngineInstance) {
    searchEngineInstance = new SemanticSearchEngine([]);
  }

  return searchEngineInstance;
}

// 导出分词函数供测试
export { tokenize, expandQuery, SYNONYMS };
