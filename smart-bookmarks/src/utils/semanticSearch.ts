/**
 * 智能语义搜索引擎
 * 融合关键词匹配 + 同义词扩展 + AI标签语义关联 + TF-IDF相似度
 */

import Fuse from 'fuse.js';
import type { IBookmark, ISearchResult, ISearchMatch } from '../types/bookmark';

// ============================================
// 语义扩展词库 - 同义词/概念关联
// 支持多领域：编程、AI、艺术、设计、数学、科学等
// ============================================
const SEMANTIC_EXPANSION: Record<string, string[]> = {
  // ========================================
  // 编程与计算机科学
  // ========================================
  'code': ['编程', '程序', '开发', 'coding', 'programming', '软件开发', 'python', 'java', 'javascript', 'leetcode', '算法', 'algorithm'],
  'python': ['py', 'python3', 'django', 'flask', 'pandas', 'numpy', '机器学习', '数据分析', '爬虫', '自动化'],
  'javascript': ['js', 'typescript', 'node', 'nodejs', 'react', 'vue', '前端', 'frontend', 'web开发'],
  'java': ['spring', 'kotlin', 'android', '后端', 'backend', 'jvm'],
  'react': ['reactjs', 'jsx', 'tsx', 'hooks', 'redux', '前端框架', '组件化'],
  'leetcode': ['算法题', '刷题', '算法', '面试', 'coding interview', 'algorithm', '数据结构'],
  'algorithm': ['算法', '数据结构', 'data structure', 'leetcode', '刷题', '复杂度'],
  'compiler': ['编译器', '编译原理', 'llvm', 'gcc', '解释器'],
  'os': ['操作系统', 'linux', 'windows', 'unix', '内核', '进程', '线程'],
  'database': ['数据库', 'db', 'sql', 'mysql', 'postgresql', 'mongodb', 'redis', '数据存储'],
  'sql': ['数据库查询', 'mysql', 'postgresql', '关系型数据库', 'sql语句'],
  'network': ['网络', 'tcp', 'udp', 'http', 'https', 'socket', '网络协议'],
  'security': ['安全', '加密', 'crypto', 'cipher', 'authentication', '授权'],

  // ========================================
  // AI / 机器学习 / 大模型
  // ========================================
  'ai': ['人工智能', 'machine learning', '深度学习', 'neural network', '大模型', 'LLM', 'GPT', 'transformer', 'AI'],
  'machine learning': ['ML', '机器学习', '深度学习', '神经网络', 'tensorflow', 'pytorch', '深度学习'],
  'llm': ['大语言模型', '大模型', 'GPT', 'Claude', 'ChatGPT', '语言模型', 'LLM'],
  'gpt': ['openai', 'chatgpt', 'llm', '生成AI', 'transformer', 'api', 'gpt-4'],
  'chatgpt': ['openai', 'gpt', 'llm', '大语言模型', 'API', 'openai api', 'chatbot'],
  'openai': ['chatgpt', 'gpt', 'dall-e', 'whisper', 'api', 'llm', 'openai-api'],
  '豆包': ['字节跳动', '火山引擎', 'AI', '大模型', 'llm', 'API', 'doubao', 'AI助手'],
  'claude': ['anthropic', 'llm', '大语言模型', 'API', 'ai', 'Claude AI'],
  'doubao': ['豆包', '字节跳动', '火山引擎', 'AI', 'API', 'Doubao'],
  'embedding': ['向量', 'vector', 'embedding', '词向量', '语义向量'],
  'rag': ['检索增强', 'retrieval', '知识库', '向量检索'],
  'fine-tuning': ['微调', 'fine tune', '模型训练', '迁移学习'],

  // ========================================
  // API 相关
  // ========================================
  'api': ['接口', 'restful', 'rest api', '后端接口', 'endpoint', 'sdk', 'openai', 'chatgpt', '豆包', 'claude', 'http接口'],
  'sdk': ['开发工具包', 'api', '接口', '客户端', 'library'],
  '接口': ['api', '接口', 'endpoint', 'rest', 'sdk', '调用'],

  // ========================================
  // 数学
  // ========================================
  'math': ['数学', 'mathematics', '高等数学', '微积分', 'calculus'],
  'calculus': ['微积分', '积分', '微分', '导数', 'calculus'],
  'linear algebra': ['线性代数', '矩阵', 'matrix', '向量空间'],
  'statistics': ['统计学', '统计', '概率论', 'probability', '数据分析'],
  'probability': ['概率', '概率论', '随机', 'statistics', '贝叶斯'],
  'discrete math': ['离散数学', '图论', '组合数学', 'logic'],
  'graph': ['图论', 'graph theory', '最短路径', '图算法'],
  'number theory': ['数论', '素数', '密码学', '数论基础'],

  // ========================================
  // 物理
  // ========================================
  'physics': ['物理', 'physics', '物理学', '理论物理'],
  'quantum': ['量子', '量子力学', 'quantum mechanics', 'quantum computing'],
  'relativity': ['相对论', '爱因斯坦', '时空', '狭义相对论', '广义相对论'],
  'mechanics': ['力学', '经典力学', '牛顿', '动力学'],

  // ========================================
  // 化学 / 生物
  // ========================================
  'chemistry': ['化学', 'chemistry', '有机化学', '无机化学', '生化'],
  'organic': ['有机化学', '有机', '分子结构', '有机合成'],
  'biochemistry': ['生物化学', '生化', '分子生物学', '酶'],
  'genetics': ['遗传学', '基因', 'DNA', '基因组', '遗传'],
  'biology': ['生物', 'biology', '细胞', '生命科学'],

  // ========================================
  // 艺术 / 设计
  // ========================================
  'art': ['艺术', 'art', '美术', '艺术设计', 'creative'],
  'design': ['设计', 'design', 'UI', 'UX', '视觉设计', '平面设计', '设计理念'],
  'ui': ['用户界面', 'UI设计', '界面', 'user interface', 'design'],
  'ux': ['用户体验', 'UX设计', 'user experience', '交互设计'],
  'graphic': ['平面设计', 'graphic design', '视觉传达', '排版'],
  'illustration': ['插画', '插图', 'illustrator', '手绘'],
  'typography': ['字体', '排版', 'typography', '字体设计'],
  'color': ['色彩', '颜色', '配色', 'color theory'],
  '3d': ['3D', '三维', '建模', 'three.js', 'blender'],
  'animation': ['动画', 'motion', '动效', 'motion graphics'],
  'photography': ['摄影', '拍照', 'camera', '拍摄', 'photoshop'],
  'drawing': ['绘画', '素描', '油画', '手绘', 'drawing'],
  'painting': ['绘画', '油画', '水彩', '艺术画'],

  // ========================================
  // 音乐 / 音频
  // ========================================
  'music': ['音乐', 'music', '乐理', '音乐理论', '音频'],
  'audio': ['音频', '声音', 'audio processing', '音效'],
  'sound': ['声音', '音效', '音频', 'sound design'],
  'production': ['音乐制作', '编曲', 'DAW', '混音'],
  'mixing': ['混音', 'mixing', '母带', '音频处理'],
  'midi': ['MIDI', '音乐制作', '电子音乐', '编曲'],

  // ========================================
  // 电影 / 视频
  // ========================================
  'film': ['电影', 'film', ' filmmaking', '影视', 'cinema'],
  'video': ['视频', 'video', '剪辑', '后期', 'premiere'],
  'editing': ['剪辑', '剪辑软件', 'premiere', 'final cut', '视频编辑'],
  'cinematography': ['摄影', '镜头', '画面', '拍摄技巧'],
  'screenplay': ['剧本', '编剧', 'script', '剧本创作'],

  // ========================================
  // 文学 / 语言
  // ========================================
  'literature': ['文学', 'literature', '小说', '诗歌', '写作'],
  'writing': ['写作', '写作技巧', 'creative writing', '创作'],
  'poetry': ['诗歌', 'poetry', '诗词', '现代诗'],
  'novel': ['小说', '长篇', '文学'],
  'linguistics': ['语言学', 'linguistics', '语法', '语义学'],
  'translation': ['翻译', 'translator', '口译', '笔译'],

  // ========================================
  // 历史 / 哲学
  // ========================================
  'history': ['历史', 'history', '史学', '古代史', '近代史'],
  'philosophy': ['哲学', 'philosophy', '思想', '伦理学', '形而上学'],
  'ancient': ['古代', '古希腊', '古罗马', '古代文明'],
  'medieval': ['中世纪', '中世', '中世纪历史'],

  // ========================================
  // 游戏开发
  // ========================================
  'game': ['游戏', 'game development', '游戏开发', 'gaming'],
  'gamedev': ['游戏开发', '游戏开发', 'unity', 'unreal', 'game engine'],
  'unity': ['Unity', '游戏引擎', 'C#', '游戏开发'],
  'unreal': ['Unreal', '虚幻引擎', '游戏开发', 'C++'],
  'game design': ['游戏设计', '关卡设计', '机制设计'],
  'shader': ['着色器', 'shader', '图形渲染', 'GLSL'],

  // ========================================
  // 商业 / 金融 / 创业
  // ========================================
  'business': ['商业', 'business', '经营', '管理', '创业'],
  'finance': ['金融', 'finance', '投资', '理财', '财务'],
  'marketing': ['营销', 'marketing', '推广', '品牌', '市场'],
  'startup': ['创业', 'startup', '初创', '商业模式'],
  'management': ['管理', '管理学', '企业管理', '运营'],
  'accounting': ['会计', 'accounting', '财务报表', '审计'],

  // ========================================
  // 法律
  // ========================================
  'law': ['法律', 'law', '法学', '法规', 'legal'],
  'legal': ['法律', '法规', '合规', '律师'],
  'contract': ['合同', '契约', '协议', 'contract law'],
  'intellectual property': ['知识产权', '专利', '商标', '版权'],

  // ========================================
  // 教育 / 学习
  // ========================================
  'education': ['教育', 'education', '教学', '学习', 'educate'],
  'learning': ['学习', '学习技巧', '学习方法', 'study'],
  'tutorial': ['教程', '入门', '学习', 'guide', 'course', '课程'],
  'course': ['课程', '在线课程', 'MOOC', '学习路径'],
  'study': ['学习', 'studying', '复习', '考试', '学习技巧'],
  'exam': ['考试', 'exam', '备考', '测验', '资格考试'],

  // ========================================
  // 效率工具
  // ========================================
  'tool': ['工具', '软件', '效率', 'productivity', 'editor', 'ide', '生产力'],
  'editor': ['编辑器', 'ide', 'vscode', 'vim', 'sublime', '文本编辑器'],
  'git': ['版本控制', 'github', 'gitlab', '版本管理', 'commit', '代码管理'],
  'productivity': ['效率', '生产力', '时间管理', '效率工具'],
  'note': ['笔记', 'notion', 'obsidian', '笔记软件', '记录'],
  'workspace': ['工作区', 'workspace', '工作空间', '环境'],
};

// ============================================
// 分类关联 - AI分类与相关关键词的映射
// ============================================
const CATEGORY_ASSOCIATIONS: Record<string, string[]> = {
  // 技术与编程
  'Technology': ['编程', 'code', '开发', 'software', '技术', '计算机', 'IT'],
  'Development': ['开发', 'programming', 'coding', '代码', '编程'],
  'Programming': ['python', 'java', 'javascript', 'coding', '算法', '编程语言'],
  'Web Development': ['html', 'css', 'javascript', '前端', 'react', 'vue', 'web开发'],
  'DevOps': ['docker', 'kubernetes', 'git', 'ci/cd', '运维', '自动化'],
  'Database': ['数据库', 'sql', 'mysql', 'mongodb', '数据', 'db'],

  // AI 与机器学习
  'AI': ['machine learning', '人工智能', 'AI', 'deep learning', '神经网络', '大模型', 'LLM', 'GPT', '豆包', 'ChatGPT', '深度学习'],
  'Machine Learning': ['ML', '机器学习', '深度学习', 'tensorflow', 'pytorch', 'AI'],
  'Data Science': ['数据分析', 'python', 'pandas', '机器学习', '数据科学', 'statistics'],

  // 数学与科学
  'Mathematics': ['数学', 'math', '微积分', '线性代数', '概率论', '统计'],
  'Physics': ['物理', 'physics', '量子', '力学', '相对论'],
  'Chemistry': ['化学', 'chemistry', '有机化学', '生化'],
  'Biology': ['生物', 'biology', '基因', '遗传', '生命科学'],

  // 艺术与设计
  'Art': ['艺术', 'art', '绘画', '美术', '创作', '艺术设计'],
  'Design': ['设计', 'design', 'UI', 'UX', '视觉设计', '平面设计', '设计理念'],
  'Graphic Design': ['平面设计', 'graphic', '排版', '视觉传达', '字体'],
  'Illustration': ['插画', 'illustration', '插图', '手绘'],
  'Photography': ['摄影', 'photography', '拍照', 'camera', '拍摄'],
  '3D Design': ['3D', '建模', '三维', 'blender', '3D建模'],
  'Animation': ['动画', 'animation', '动效', 'motion graphics'],

  // 音乐与音频
  'Music': ['音乐', 'music', '乐理', '作曲', '音频'],
  'Audio': ['音频', 'audio', '声音', '音效', '音频处理'],
  'Music Production': ['音乐制作', 'production', '混音', '编曲', 'DAW'],

  // 影视与媒体
  'Film': ['电影', 'film', '影视', 'cinema', ' filmmaking'],
  'Video': ['视频', 'video', '剪辑', '后期', 'premiere'],
  'Screenplay': ['剧本', 'screenplay', '编剧', '脚本'],

  // 文学与语言
  'Literature': ['文学', 'literature', '小说', '诗歌', '写作'],
  'Writing': ['写作', 'writing', '创作', '文案', '写作技巧'],
  'Linguistics': ['语言学', 'linguistics', '语法', '翻译'],

  // 历史与哲学
  'History': ['历史', 'history', '史学', '古代史', '世界史'],
  'Philosophy': ['哲学', 'philosophy', '思想', '伦理学', '形而上学'],

  // 游戏开发
  'Game Development': ['游戏开发', 'gamedev', 'unity', 'unreal', '游戏设计'],
  'Game Design': ['游戏设计', '关卡设计', '机制设计', '游戏策划'],

  // 商业与金融
  'Business': ['商业', 'business', '创业', '管理', '经营'],
  'Finance': ['金融', 'finance', '投资', '理财', '财务'],
  'Marketing': ['营销', 'marketing', '推广', '品牌', '市场'],
  'Startup': ['创业', 'startup', '初创', '商业模式'],

  // 法律
  'Law': ['法律', 'law', '法学', '法规', 'legal', '合同'],
  'Intellectual Property': ['知识产权', '专利', '商标', '版权'],

  // 教育
  'Education': ['教育', 'education', '教学', '学习', '课程'],
  'Learning': ['学习', 'learning', '教程', '入门', '学习技巧'],

  // 效率与生产力
  'Productivity': ['效率', 'productivity', '生产力', '时间管理', '工具'],
  'Tools': ['工具', 'tool', '软件', '效率工具', 'editor'],
};

// 标签关联 - 用户标签与AI标签的双向映射
function getAssociatedTags(tags: string[]): string[] {
  const associated = new Set<string>();
  tags.forEach(tag => {
    const lowerTag = tag.toLowerCase();
    // 查找SEMANTIC_EXPANSION中的关联词
    Object.entries(SEMANTIC_EXPANSION).forEach(([key, values]) => {
      if (key.includes(lowerTag) || lowerTag.includes(key)) {
        values.forEach(v => associated.add(v));
      }
      values.forEach(v => {
        if (v.includes(lowerTag) || lowerTag.includes(v)) {
          associated.add(key);
        }
      });
    });
  });
  return Array.from(associated);
}

// ============================================
// TF-IDF 相似度计算
// ============================================

/**
 * 计算词频 (TF)
 */
function computeTF(text: string): Map<string, number> {
  const words = tokenize(text);
  const tf = new Map<string, number>();
  const total = words.length;

  words.forEach(word => {
    tf.set(word, (tf.get(word) || 0) + 1);
  });

  // 归一化
  tf.forEach((count, word) => {
    tf.set(word, count / total);
  });

  return tf;
}

/**
 * 计算逆文档频率 (IDF)
 */
function computeIDF(documents: string[][], totalDocs: number): Map<string, number> {
  const idf = new Map<string, number>();
  const docCount = new Map<string, number>();

  documents.forEach(doc => {
    const uniqueWords = new Set(tokenize(doc.join(' ')));
    uniqueWords.forEach(word => {
      docCount.set(word, (docCount.get(word) || 0) + 1);
    });
  });

  docCount.forEach((count, word) => {
    idf.set(word, Math.log(totalDocs / (count + 1)) + 1);
  });

  return idf;
}

/**
 * 计算TF-IDF向量
 */
function computeTFIDF(text: string, idf: Map<string, number>): number[] {
  const tf = computeTF(text);
  const words = Array.from(tf.keys());
  const vector: number[] = [];

  words.forEach(word => {
    const tfValue = tf.get(word) || 0;
    const idfValue = idf.get(word) || 1;
    vector.push(tfValue * idfValue);
  });

  return vector;
}

/**
 * 余弦相似度
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  const minLen = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < minLen; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * 文本分词
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1);
}

// ============================================
// 搜索配置 - 语义搜索配置
// ============================================

const SEARCH_CONFIG = {
  // Fuse.js 配置
  fuseOptions: {
    threshold: 0.3, // 语义搜索阈值：0-1，值越大越宽松
    distance: 100,
    minMatchCharLength: 1,
    ignoreLocation: true,
    useExtendedSearch: true,
    includeScore: true,
    includeMatches: true,
  },
  // 搜索字段及权重（核心字段：标题、URL、AI总结、AI标签）
  keys: [
    { name: 'title', weight: 0.5 },        // 标题权重最高
    { name: 'url', weight: 0.25 },          // URL 次之
    { name: 'aiSummary', weight: 0.15 },    // AI 总结
    { name: 'aiTags', weight: 0.1 },        // AI 标签
  ],
};

// ============================================
// 智能搜索引擎类
// ============================================

export class SemanticSearchEngine {
  private fuse: Fuse<IBookmark>;
  private bookmarks: IBookmark[];
  private idfCache: Map<string, number> = new Map();

  constructor(bookmarks: IBookmark[]) {
    this.bookmarks = bookmarks;
    this.fuse = new Fuse(bookmarks, {
      keys: SEARCH_CONFIG.keys.map(k => k.name),
      ...SEARCH_CONFIG.fuseOptions,
    });
    // 预计算IDF
    this.precomputeIDF();
  }

  /**
   * 预计算IDF（用于TF-IDF相似度）
   */
  private precomputeIDF() {
    const documents = this.bookmarks.map(b =>
      this.getIndexableText(b)
    );
    this.idfCache = computeIDF(documents, this.bookmarks.length);
  }

  /**
   * 获取可索引的文本
   */
  private getIndexableText(bookmark: IBookmark): string {
    const parts: string[] = [
      bookmark.title,
      bookmark.userTitle || '',
      ...(bookmark.userTags || []),
      bookmark.userNotes || '',
      bookmark.aiSummary || '',
      ...(bookmark.aiTags || []),
      bookmark.aiCategory || '',
      bookmark.folderPath || '',
      bookmark.url,
    ];
    return parts.filter(Boolean).join(' ');
  }

  /**
   * 扩展查询词（语义扩展）
   */
  private expandQuery(query: string): string[] {
    const expanded = new Set<string>();
    const words = tokenize(query);

    words.forEach(word => {
      // 添加原词
      expanded.add(word);

      // 同义词扩展
      const synonyms = SEMANTIC_EXPANSION[word] || [];
      synonyms.forEach(s => expanded.add(s.toLowerCase()));

      // 反向查找（如果某个词条包含当前词）
      Object.entries(SEMANTIC_EXPANSION).forEach(([key, values]) => {
        if (key.includes(word) || word.includes(key)) {
          expanded.add(key.toLowerCase());
          values.forEach(v => expanded.add(v.toLowerCase()));
        }
      });
    });

    return Array.from(expanded);
  }

  /**
   * 计算语义增强分数
   */
  private computeSemanticScore(
    bookmark: IBookmark,
    query: string,
    originalScore: number
  ): number {
    let semanticBoost = 0;
    const queryLower = query.toLowerCase();
    const queryWords = tokenize(query);

    // 1. AI分类语义匹配
    if (bookmark.aiCategory) {
      const categorySynonyms = CATEGORY_ASSOCIATIONS[bookmark.aiCategory] || [];
      const categoryMatch = categorySynonyms.some(syn =>
        queryWords.some(qw => syn.toLowerCase().includes(qw) || qw.includes(syn.toLowerCase()))
      );
      if (categoryMatch) {
        semanticBoost += 0.15;
      }
    }

    // 2. AI标签语义匹配
    if (bookmark.aiTags && bookmark.aiTags.length > 0) {
      const aiTagSet = new Set(bookmark.aiTags.map(t => t.toLowerCase()));
      queryWords.forEach(qw => {
        // 检查是否有语义关联
        const associated = getAssociatedTags([qw]);
        const hasMatch = associated.some(a =>
          aiTagSet.has(a.toLowerCase()) ||
          bookmark.aiTags!.some(tag => tag.toLowerCase().includes(a))
        );
        if (hasMatch) {
          semanticBoost += 0.1;
        }
      });
    }

    // 3. 用户标签与查询的语义关联
    if (bookmark.userTags && bookmark.userTags.length > 0) {
      const associated = getAssociatedTags(queryWords);
      const hasAssociation = associated.some(a =>
        bookmark.userTags!.some(tag => tag.toLowerCase().includes(a))
      );
      if (hasAssociation) {
        semanticBoost += 0.1;
      }
    }

    // 4. AI摘要语义匹配（检查摘要中是否包含查询的相关概念）
    if (bookmark.aiSummary) {
      const expandedTerms = this.expandQuery(query);
      const summaryLower = bookmark.aiSummary.toLowerCase();
      const matchCount = expandedTerms.filter(term =>
        summaryLower.includes(term)
      ).length;
      if (matchCount > 0) {
        semanticBoost += Math.min(matchCount * 0.05, 0.2);
      }
    }

    // 综合分数：原始分数越高越好，语义增强加分
    // 分数范围 0-1，需要反转fuse分数
    const baseScore = 1 - originalScore;
    return Math.min(baseScore + semanticBoost, 1);
  }

  /**
   * 检查是否是精确关键词匹配（不区分大小写）
   */
  private isExactMatch(bookmark: IBookmark, query: string): boolean {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);

    // 检查标题是否包含查询词
    const titleMatch = queryWords.some(word => bookmark.title.toLowerCase().includes(word));

    // 检查URL是否包含查询词
    const urlMatch = queryWords.some(word => bookmark.url.toLowerCase().includes(word));

    // 检查用户标签
    const tagsMatch = bookmark.userTags?.some(tag =>
      queryWords.some(word => tag.toLowerCase().includes(word))
    );

    // 检查AI标签
    const aiTagsMatch = bookmark.aiTags?.some(tag =>
      queryWords.some(word => tag.toLowerCase().includes(word))
    );

    return titleMatch || urlMatch || tagsMatch || aiTagsMatch;
  }

  /**
   * 计算匹配优先级分数
   * 优先级：精确匹配 > 模糊匹配 > 语义匹配
   */
  private computeMatchPriority(bookmark: IBookmark, query: string, fuseScore: number): number {
    const queryLower = query.toLowerCase();

    // 1. 标题精确匹配 - 最高优先级
    if (bookmark.title.toLowerCase().includes(queryLower)) {
      return 100;
    }

    // 2. URL精确匹配
    if (bookmark.url.toLowerCase().includes(queryLower)) {
      return 90;
    }

    // 3. 标签精确匹配
    const tagMatch = [...(bookmark.userTags || []), ...(bookmark.aiTags || [])]
      .some(tag => tag.toLowerCase().includes(queryLower));
    if (tagMatch) {
      return 80;
    }

    // 4. Fuse 模糊匹配分数（分数越低匹配越好，转为 0-79）
    if (fuseScore < 0.1) return 70;
    if (fuseScore < 0.2) return 60;
    if (fuseScore < 0.3) return 50;
    if (fuseScore < 0.4) return 40;

    // 5. 语义匹配 - 最低优先级
    const semanticBoost = this.computePureSemanticBoost(bookmark, query);
    if (semanticBoost > 0.2) return 30;
    if (semanticBoost > 0.1) return 20;
    if (semanticBoost > 0) return 10;

    return 0;
  }

  /**
   * 计算纯语义增强分数（无副作用版本）
   */
  private computePureSemanticBoost(bookmark: IBookmark, query: string): number {
    let boost = 0;
    const queryWords = tokenize(query);

    // AI分类语义匹配
    if (bookmark.aiCategory) {
      const categorySynonyms = CATEGORY_ASSOCIATIONS[bookmark.aiCategory] || [];
      const categoryMatch = categorySynonyms.some(syn =>
        queryWords.some(qw => syn.toLowerCase().includes(qw) || qw.includes(syn.toLowerCase()))
      );
      if (categoryMatch) boost += 0.15;
    }

    // AI标签语义匹配
    if (bookmark.aiTags && bookmark.aiTags.length > 0) {
      queryWords.forEach(qw => {
        const associated = getAssociatedTags([qw]);
        const hasMatch = associated.some(a =>
          bookmark.aiTags!.some(tag => tag.toLowerCase().includes(a.toLowerCase()))
        );
        if (hasMatch) boost += 0.1;
      });
    }

    // 摘要中的语义匹配
    if (bookmark.aiSummary) {
      const expandedTerms = this.expandQuery(query);
      const summaryLower = bookmark.aiSummary.toLowerCase();
      const matchCount = expandedTerms.filter(term => summaryLower.includes(term)).length;
      boost += Math.min(matchCount * 0.03, 0.15);
    }

    return boost;
  }

  /**
   * 执行智能语义搜索
   */
  search(query: string): ISearchResult[] {
    if (!query || query.trim().length < 1) {
      return [];
    }

    const trimmedQuery = query.trim();

    // 1. 原始Fuse搜索（关键词匹配）
    const fuseResults = this.fuse.search(trimmedQuery);

    // 2. 语义扩展搜索（补充结果）
    let expandedResults: Fuse.FuseResult<IBookmark>[] = [];
    const expandedQuery = this.expandQuery(trimmedQuery).join(' ');
    if (expandedQuery !== trimmedQuery) {
      expandedResults = this.fuse.search(expandedQuery);
      // 过滤掉已经有的
      const existingIds = new Set(fuseResults.map(r => r.item.id));
      expandedResults = expandedResults.filter(r => !existingIds.has(r.item.id));
    }

    // 3. 标记结果来源并计算综合分数
    const allResults = [...fuseResults, ...expandedResults].map(result => {
      const fuseScore = result.score || 1;
      const priority = this.computeMatchPriority(result.item, trimmedQuery, fuseScore);
      const semanticBoost = this.computePureSemanticBoost(result.item, trimmedQuery);

      // 综合分数 = 优先级权重(70%) + 语义匹配(20%) + Fuse原始分数(10%)
      const finalScore = (priority / 100) * 0.7 + semanticBoost * 0.2 + (1 - fuseScore) * 0.1;

      return {
        item: result.item,
        score: finalScore,
        matches: this.processMatches(result.matches ? [...result.matches] : []),
        highlights: this.generateHighlights(result.matches ? [...result.matches] : []),
        // 调试用：标记来源
        _priority: priority,
        _source: fuseResults.includes(result) ? 'keyword' : 'semantic',
      };
    });

    // 4. 按综合分数降序排序
    allResults.sort((a, b) => {
      // 首先按优先级排序，同优先级再按分数
      if (b._priority !== a._priority) {
        return b._priority - a._priority;
      }
      return b.score - a.score;
    });

    // 5. 过滤低相关性结果（阈值：0.3）
    // 语义搜索阈值，保留更相关的结果
    const RELEVANCE_THRESHOLD = 0.3;
    const filteredResults = allResults.filter(result => result.score >= RELEVANCE_THRESHOLD);

    // 6. 返回结果（移除调试字段）
    return filteredResults.map(({ _priority, _source, ...rest }) => rest);
  }

  /**
   * 传统关键词搜索（保持兼容性）
   */
  searchKeywords(query: string): ISearchResult[] {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const results = this.fuse.search(query);
    return results.map(result => ({
      item: result.item,
      score: result.score || 0,
      matches: this.processMatches(result.matches ? [...result.matches] : []),
      highlights: this.generateHighlights(result.matches ? [...result.matches] : []),
    }));
  }

  /**
   * 基于TF-IDF的相似书签推荐
   */
  getSimilarBookmarks(bookmarkId: string, limit: number = 5): IBookmark[] {
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) return [];

    const bookmarkText = this.getIndexableText(bookmark);
    const bookmarkVector = computeTFIDF(bookmarkText, this.idfCache);

    const similarities = this.bookmarks
      .filter(b => b.id !== bookmarkId)
      .map(b => {
        const text = this.getIndexableText(b);
        const vector = computeTFIDF(text, this.idfCache);
        return {
          bookmark: b,
          similarity: cosineSimilarity(bookmarkVector, vector),
        };
      })
      .filter(item => item.similarity > 0) // 只返回有相似度的
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return similarities.map(s => s.bookmark);
  }

  /**
   * 更新书签数据
   */
  updateBookmarks(bookmarks: IBookmark[]) {
    this.bookmarks = bookmarks;
    this.fuse = new Fuse(bookmarks, {
      keys: SEARCH_CONFIG.keys.map(k => k.name),
      ...SEARCH_CONFIG.fuseOptions,
    });
    this.precomputeIDF();
  }

  /**
   * 处理匹配信息
   */
  private processMatches(matches: any[]): ISearchMatch[] {
    return matches.map(match => ({
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

    matches.forEach(match => {
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
      result += text.substring(lastIndex, start);
      result += `<mark>${text.substring(start, end + 1)}</mark>`;
      lastIndex = end + 1;
    });

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

    const suggestions = new Set<string>();
    const inputLower = input.toLowerCase();

    // 从同义词库中获取建议
    Object.keys(SEMANTIC_EXPANSION).forEach(key => {
      if (key.includes(inputLower) || inputLower.includes(key)) {
        suggestions.add(key);
      }
      SEMANTIC_EXPANSION[key].forEach(value => {
        if (value.toLowerCase().includes(inputLower)) {
          suggestions.add(value);
        }
      });
    });

    // 从书签中提取建议
    this.bookmarks.forEach(bookmark => {
      // 标题
      const words = bookmark.title.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.includes(inputLower) && word.length > 2) {
          suggestions.add(word);
        }
      });

      // 标签
      [...bookmark.userTags, ...(bookmark.aiTags || [])].forEach(tag => {
        if (tag.toLowerCase().includes(inputLower)) {
          suggestions.add(tag);
        }
      });
    });

    return Array.from(suggestions).slice(0, limit);
  }
}

// ============================================
// 单例工厂
// ============================================

// 先定义实例变量
let searchEngineInstance: SemanticSearchEngine | null = null;

export function getSearchEngine(bookmarks?: IBookmark[]): SemanticSearchEngine {
  // 确保实例存在
  if (!searchEngineInstance && bookmarks) {
    searchEngineInstance = new SemanticSearchEngine(bookmarks);
  } else if (searchEngineInstance && bookmarks) {
    searchEngineInstance.updateBookmarks(bookmarks);
  }

  // 如果还没有书签，返回空引擎而不是抛出错误
  if (!searchEngineInstance) {
    // 返回一个空的 SemanticSearchEngine
    searchEngineInstance = new SemanticSearchEngine([]);
  }

  return searchEngineInstance;
}

// 导出语义扩展词库供其他模块使用
export { SEMANTIC_EXPANSION, CATEGORY_ASSOCIATIONS, getAssociatedTags };
