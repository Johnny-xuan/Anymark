/**
 * AI分类树和Few-Shot Learning
 * 提供一致的分类体系和分类示例
 */

export interface CategoryNode {
  id: string;
  name: string;
  keywords: string[];
  examples: string[];
  children?: CategoryNode[];
  parent?: string;
}

export interface FewShotExample {
  url: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  tags: string[];
  reasoning: string; // 分类推理
}

export interface CategoryMatch {
  category: string;
  subcategory?: string;
  confidence: number;
  matchedKeywords: string[];
  matchedExamples: FewShotExample[];
  reasoning: string;
}

/**
 * 预设分类树
 * 参考知识管理最佳实践（如PARA、Zettelkasten）
 */
export const PRESET_CATEGORY_TREE: CategoryNode[] = [
  {
    id: 'development',
    name: '开发',
    keywords: ['code', 'programming', 'developer', 'github', 'api', '编程', '开发'],
    examples: ['github.com', 'stackoverflow.com', 'npmjs.com', 'developer.mozilla.org'],
    children: [
      {
        id: 'development-documentation',
        name: '文档',
        keywords: ['docs', 'documentation', 'api reference', '文档', '手册'],
        examples: ['docs.python.org', 'reactjs.org/docs', 'docs.microsoft.com'],
        parent: 'development',
      },
      {
        id: 'development-tutorial',
        name: '教程',
        keywords: ['tutorial', 'guide', 'how to', 'learn', '教程', '指南'],
        examples: ['freecodecamp.org', 'codecademy.com', 'udemy.com'],
        parent: 'development',
      },
      {
        id: 'development-tool',
        name: '工具',
        keywords: ['tool', 'utility', 'generator', 'converter', '工具'],
        examples: ['regex101.com', 'jsonlint.com', 'postman.com'],
        parent: 'development',
      },
      {
        id: 'development-repository',
        name: '代码库',
        keywords: ['github', 'gitlab', 'repository', 'repo', '代码库'],
        examples: ['github.com/facebook/react', 'gitlab.com'],
        parent: 'development',
      },
    ],
  },
  {
    id: 'learning',
    name: '学习',
    keywords: ['learn', 'education', 'course', 'training', '学习', '教育', '课程'],
    examples: ['coursera.org', 'edx.org', 'khanacademy.org'],
    children: [
      {
        id: 'learning-course',
        name: '课程',
        keywords: ['course', 'class', 'mooc', '课程', '在线课程'],
        examples: ['coursera.org', 'udacity.com'],
        parent: 'learning',
      },
      {
        id: 'learning-video',
        name: '视频教程',
        keywords: ['video tutorial', 'youtube', 'bilibili', '视频', '教学视频'],
        examples: ['youtube.com/watch', 'bilibili.com/video'],
        parent: 'learning',
      },
      {
        id: 'learning-article',
        name: '文章',
        keywords: ['article', 'blog', 'post', '文章', '博客'],
        examples: ['medium.com', 'dev.to', 'csdn.net'],
        parent: 'learning',
      },
    ],
  },
  {
    id: 'reference',
    name: '参考资料',
    keywords: ['reference', 'wiki', 'encyclopedia', '参考', '百科', '字典'],
    examples: ['wikipedia.org', 'britannica.com'],
    children: [
      {
        id: 'reference-wiki',
        name: '百科',
        keywords: ['wiki', 'wikipedia', '百科', '维基'],
        examples: ['wikipedia.org', 'baike.baidu.com'],
        parent: 'reference',
      },
      {
        id: 'reference-qa',
        name: '问答',
        keywords: ['stackoverflow', 'zhihu', 'quora', '问答', '知乎'],
        examples: ['stackoverflow.com', 'zhihu.com', 'quora.com'],
        parent: 'reference',
      },
    ],
  },
  {
    id: 'productivity',
    name: '效率工具',
    keywords: ['productivity', 'tool', 'app', '效率', '工具', '应用'],
    examples: ['notion.so', 'trello.com', 'slack.com'],
    children: [
      {
        id: 'productivity-project',
        name: '项目管理',
        keywords: ['project management', 'task', 'kanban', '项目管理', '任务'],
        examples: ['asana.com', 'jira.com', 'trello.com'],
        parent: 'productivity',
      },
      {
        id: 'productivity-note',
        name: '笔记',
        keywords: ['note', 'markdown', 'writing', '笔记', '写作'],
        examples: ['notion.so', 'evernote.com', 'obsidian.md'],
        parent: 'productivity',
      },
    ],
  },
  {
    id: 'media',
    name: '媒体',
    keywords: ['video', 'audio', 'podcast', 'music', '视频', '音频', '音乐'],
    examples: ['youtube.com', 'spotify.com', 'soundcloud.com'],
    children: [
      {
        id: 'media-video',
        name: '视频',
        keywords: ['video', 'youtube', 'vimeo', '视频'],
        examples: ['youtube.com', 'vimeo.com', 'bilibili.com'],
        parent: 'media',
      },
      {
        id: 'media-audio',
        name: '音频',
        keywords: ['audio', 'podcast', 'music', '音频', '播客', '音乐'],
        examples: ['spotify.com', 'soundcloud.com'],
        parent: 'media',
      },
    ],
  },
  {
    id: 'news',
    name: '新闻资讯',
    keywords: ['news', 'blog', 'magazine', '新闻', '资讯', '杂志'],
    examples: ['techcrunch.com', 'arstechnica.com', '36kr.com'],
  },
  {
    id: 'social',
    name: '社交',
    keywords: ['social', 'community', 'forum', '社交', '社区', '论坛'],
    examples: ['twitter.com', 'reddit.com', 'discord.com'],
  },
  {
    id: 'shopping',
    name: '购物',
    keywords: ['shop', 'store', 'buy', 'product', '购物', '商城'],
    examples: ['amazon.com', 'taobao.com', 'jd.com'],
  },
];

/**
 * Few-Shot 分类示例
 * 用于提示AI进行一致性分类
 */
export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    url: 'https://github.com/facebook/react',
    title: 'facebook/react: A declarative, efficient, and flexible JavaScript library',
    description: 'A JavaScript library for building user interfaces',
    category: 'development',
    subcategory: 'repository',
    tags: ['react', 'javascript', 'library', 'frontend', 'ui'],
    reasoning: '这是GitHub上的一个开源代码库，属于开发类别下的代码库子类别',
  },
  {
    url: 'https://reactjs.org/docs/getting-started.html',
    title: 'Getting Started – React',
    description: 'A JavaScript library for building user interfaces',
    category: 'development',
    subcategory: 'documentation',
    tags: ['react', 'documentation', 'javascript', 'guide'],
    reasoning: '这是React官方文档，属于开发类别下的文档子类别',
  },
  {
    url: 'https://www.youtube.com/watch?v=w7ejDZ8SWv8',
    title: 'React Tutorial for Beginners',
    description: 'Learn React in this full tutorial',
    category: 'learning',
    subcategory: 'video',
    tags: ['react', 'tutorial', 'beginner', 'video', 'javascript'],
    reasoning: '这是一个YouTube教学视频，属于学习类别下的视频教程子类别',
  },
  {
    url: 'https://stackoverflow.com/questions/tagged/react',
    title: 'Newest React Questions - Stack Overflow',
    description: 'Questions tagged with react',
    category: 'reference',
    subcategory: 'qa',
    tags: ['react', 'qa', 'stackoverflow', 'programming'],
    reasoning: '这是Stack Overflow的问答页面，属于参考资料类别下的问答子类别',
  },
  {
    url: 'https://notion.so',
    title: 'Notion - The all-in-one workspace',
    description: 'Write, plan, collaborate, and get organized',
    category: 'productivity',
    subcategory: 'note',
    tags: ['notion', 'productivity', 'note-taking', 'collaboration'],
    reasoning: '这是一个笔记和协作工具，属于效率工具类别下的笔记子类别',
  },
];

/**
 * AI分类树管理器
 */
export class AICategoryTreeManager {
  private categoryTree: CategoryNode[];
  private fewShotExamples: FewShotExample[];
  private categoryIndex: Map<string, CategoryNode> = new Map();

  constructor(
    customTree?: CategoryNode[],
    customExamples?: FewShotExample[]
  ) {
    this.categoryTree = customTree || PRESET_CATEGORY_TREE;
    this.fewShotExamples = customExamples || FEW_SHOT_EXAMPLES;
    this.buildCategoryIndex();
  }

  /**
   * 构建分类索引
   */
  private buildCategoryIndex(): void {
    const buildIndex = (nodes: CategoryNode[]) => {
      for (const node of nodes) {
        this.categoryIndex.set(node.id, node);
        if (node.children) {
          buildIndex(node.children);
        }
      }
    };
    buildIndex(this.categoryTree);
  }

  /**
   * 根据URL和内容智能匹配分类
   */
  matchCategory(
    url: string,
    title: string,
    description: string = ''
  ): CategoryMatch {
    const text = `${url} ${title} ${description}`.toLowerCase();
    const matches: Array<{
      category: string;
      subcategory?: string;
      score: number;
      matchedKeywords: string[];
    }> = [];

    // 遍历分类树计算匹配度
    const calculateMatch = (nodes: CategoryNode[], parentCategory?: string) => {
      for (const node of nodes) {
        const matchedKeywords = node.keywords.filter(kw =>
          text.includes(kw.toLowerCase())
        );

        const exampleMatch = node.examples.some(example =>
          url.includes(example.toLowerCase())
        );

        let score = matchedKeywords.length * 10; // 关键词权重
        if (exampleMatch) score += 50; // 示例URL匹配权重更高

        if (score > 0) {
          matches.push({
            category: parentCategory || node.id,
            subcategory: parentCategory ? node.id : undefined,
            score,
            matchedKeywords,
          });
        }

        if (node.children) {
          calculateMatch(node.children, node.id);
        }
      }
    };

    calculateMatch(this.categoryTree);

    // 排序并选择最佳匹配
    matches.sort((a, b) => b.score - a.score);

    const best = matches[0] || {
      category: 'uncategorized',
      score: 0,
      matchedKeywords: [],
    };

    // 查找相似的Few-Shot示例
    const similarExamples = this.findSimilarExamples(url, title, description);

    return {
      category: best.category,
      subcategory: best.subcategory,
      confidence: Math.min(best.score / 100, 1),
      matchedKeywords: best.matchedKeywords,
      matchedExamples: similarExamples,
      reasoning: this.generateReasoning(best, similarExamples),
    };
  }

  /**
   * 查找相似的分类示例
   */
  private findSimilarExamples(
    url: string,
    title: string,
    description: string
  ): FewShotExample[] {
    const urlDomain = this.extractDomain(url);
    const text = `${title} ${description}`.toLowerCase();

    return this.fewShotExamples
      .map(example => {
        const exampleDomain = this.extractDomain(example.url);
        let similarity = 0;

        // 域名匹配
        if (urlDomain === exampleDomain) similarity += 50;

        // 标题相似度
        const titleWords = title.toLowerCase().split(/\s+/);
        const exampleTitleWords = example.title.toLowerCase().split(/\s+/);
        const commonWords = titleWords.filter(w =>
          exampleTitleWords.some(ew => ew.includes(w) || w.includes(ew))
        );
        similarity += commonWords.length * 5;

        // 标签匹配
        const matchedTags = example.tags.filter(tag =>
          text.includes(tag.toLowerCase())
        );
        similarity += matchedTags.length * 10;

        return { example, similarity };
      })
      .filter(({ similarity }) => similarity > 10)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map(({ example }) => example);
  }

  /**
   * 提取域名
   */
  private extractDomain(url: string): string {
    try {
      const { hostname } = new URL(url);
      return hostname.replace('www.', '');
    } catch {
      return '';
    }
  }

  /**
   * 生成分类推理
   */
  private generateReasoning(
    match: { category: string; subcategory?: string; matchedKeywords: string[] },
    examples: FewShotExample[]
  ): string {
    const category = this.categoryIndex.get(match.category);
    const subcategory = match.subcategory
      ? this.categoryIndex.get(match.subcategory)
      : undefined;

    let reasoning = `匹配到分类: ${category?.name || match.category}`;
    if (subcategory) {
      reasoning += ` → ${subcategory.name}`;
    }

    if (match.matchedKeywords.length > 0) {
      reasoning += `\n关键词匹配: ${match.matchedKeywords.join(', ')}`;
    }

    if (examples.length > 0) {
      reasoning += `\n相似示例: ${examples.map(e => e.title).join('; ')}`;
    }

    return reasoning;
  }

  /**
   * 获取分类树
   */
  getCategoryTree(): CategoryNode[] {
    return this.categoryTree;
  }

  /**
   * 获取Few-Shot示例
   */
  getFewShotExamples(): FewShotExample[] {
    return this.fewShotExamples;
  }

  /**
   * 添加自定义分类
   */
  addCustomCategory(category: CategoryNode): void {
    this.categoryTree.push(category);
    this.buildCategoryIndex();
  }

  /**
   * 添加Few-Shot示例
   */
  addFewShotExample(example: FewShotExample): void {
    this.fewShotExamples.push(example);
  }

  /**
   * 生成AI Prompt用的分类树描述
   */
  generateCategoryTreePrompt(): string {
    const formatNode = (node: CategoryNode, indent: number = 0): string => {
      const prefix = '  '.repeat(indent);
      let result = `${prefix}- ${node.name} (${node.id})\n`;
      result += `${prefix}  关键词: ${node.keywords.join(', ')}\n`;
      result += `${prefix}  示例: ${node.examples.join(', ')}\n`;

      if (node.children && node.children.length > 0) {
        result += `${prefix}  子分类:\n`;
        for (const child of node.children) {
          result += formatNode(child, indent + 2);
        }
      }

      return result;
    };

    let prompt = '# 预设分类体系\n\n';
    for (const node of this.categoryTree) {
      prompt += formatNode(node);
    }

    return prompt;
  }

  /**
   * 生成Few-Shot示例Prompt
   */
  generateFewShotPrompt(): string {
    let prompt = '# 分类示例 (Few-Shot Examples)\n\n';
    prompt += '以下是一些正确的分类示例，请参考这些示例进行分类:\n\n';

    for (let i = 0; i < this.fewShotExamples.length; i++) {
      const example = this.fewShotExamples[i];
      prompt += `## 示例 ${i + 1}\n`;
      prompt += `URL: ${example.url}\n`;
      prompt += `标题: ${example.title}\n`;
      prompt += `分类: ${example.category}`;
      if (example.subcategory) {
        prompt += ` → ${example.subcategory}`;
      }
      prompt += `\n标签: ${example.tags.join(', ')}\n`;
      prompt += `推理: ${example.reasoning}\n\n`;
    }

    return prompt;
  }
}

// 导出单例
let treeManagerInstance: AICategoryTreeManager | null = null;

export function getCategoryTreeManager(
  customTree?: CategoryNode[],
  customExamples?: FewShotExample[]
): AICategoryTreeManager {
  if (!treeManagerInstance) {
    treeManagerInstance = new AICategoryTreeManager(customTree, customExamples);
  }
  return treeManagerInstance;
}
