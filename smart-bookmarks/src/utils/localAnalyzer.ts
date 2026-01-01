/**
 * 本地AI分析器 - 免费版
 * 基于关键词和规则的分析，不依赖外部API
 */

interface AnalysisResult {
  summary: string;
  tags: string[];
  category: string;
  subcategory: string;
  confidence: number;
}

interface PageContent {
  url: string;
  title: string;
  description?: string;
}

class LocalAnalyzer {
  private categoryKeywords: Record<string, string[]> = {
    '技术': ['github', 'stackoverflow', 'code', 'api', '开发', '编程', 'javascript', 'python', 'react', 'vue', 'angular', 'node', 'docker', 'kubernetes', 'aws', 'linux', 'git', 'npm', 'yarn', 'typescript'],
    '设计': ['design', 'ui', 'ux', 'figma', 'sketch', 'adobe', 'photoshop', 'illustrator', '创意', '设计', '界面', '原型', 'mockup'],
    '学习': ['course', 'tutorial', 'learn', '教程', '课程', '学习', '教育', '大学', '学校', '培训', 'MOOC', '慕课', '视频', '文档', '手册', '指南'],
    '新闻': ['news', '新闻', '资讯', 'report', '报道', 'article', '文章', 'blog', '博客', '评论', '分析'],
    '娱乐': ['video', 'youtube', '电影', '音乐', '游戏', '娱乐', '搞笑', '综艺', '剧集', 'anime', '漫画', '小说'],
    '购物': ['shop', 'store', 'buy', '购物', '商城', '淘宝', '京东', '亚马逊', 'ebay', '价格', '促销', '优惠'],
    '社交': ['social', 'twitter', 'facebook', '微博', '微信', 'qq', '知乎', '豆瓣', '贴吧', '论坛', '社区'],
    '工具': ['tool', '工具', '软件', 'app', '应用', '在线', '转换', '生成', '检查', '测试', '调试'],
    '文档': ['doc', 'docs', '文档', 'API', 'wiki', '手册', '说明', '规范', '标准', '协议'],
    '图片': ['image', 'photo', '图片', '壁纸', '素材', '图标', '插画', '摄影', '设计素材'],
  };

  private tagKeywords: Record<string, string[]> = {
    '免费': ['free', '免费', '开源', 'open source'],
    '热门': ['hot', 'trending', '热门', '流行', '推荐'],
    '最新': ['new', 'latest', '最新', '刚刚', 'recent'],
    '官方': ['official', '官方', '正品'],
    '中文': ['zh', 'cn', '中文', '简体', 'china'],
    '英文': ['en', '英文', 'english'],
    '开源': ['open source', 'github', '开源', 'public'],
    'API': ['api', 'rest', 'graphql', '接口'],
    '教程': ['tutorial', '教程', 'guide', '入门', '基础'],
    '高级': ['advanced', '高级', '进阶', '专业'],
    '快速': ['fast', 'quick', '快速', '高效'],
    '简单': ['simple', 'easy', '简单', '易用'],
    '安全': ['secure', '安全', 'https', 'ssl'],
    '云端': ['cloud', '云', 'saas', '在线'],
    '本地': ['local', '本地', '离线', 'desktop'],
  };

  async analyzeBookmark(content: PageContent): Promise<AnalysisResult> {
    const { url, title, description } = content;

    const text = `${title} ${description || ''} ${url}`.toLowerCase();

    const tags = this.extractTags(text);
    const difficulty = this.detectDifficulty(text);
    const summary = this.generateSummary(title, description);

    // 基于内容质量计算置信度
    let confidence = 0.5;
    if (description && description.length > 50) {
      confidence = 0.6;
    }
    if (tags.length >= 3) {
      confidence += 0.1;
    }
    if (difficulty) {
      confidence += 0.1;
    }

    return {
      summary,
      tags,
      difficulty,
      confidence: Math.min(confidence, 0.8), // 本地分析最高 0.8
    };
  }

  private detectDifficulty(text: string): 'beginner' | 'intermediate' | 'advanced' | undefined {
    if (text.includes('beginner') || text.includes('入门') || text.includes('基础') || text.includes('getting started')) {
      return 'beginner';
    }
    if (text.includes('advanced') || text.includes('高级') || text.includes('进阶') || text.includes('expert')) {
      return 'advanced';
    }
    if (text.includes('intermediate') || text.includes('中级')) {
      return 'intermediate';
    }
    return undefined;
  }

  private categorize(text: string): { category: string; subcategory: string; confidence: number } {
    let bestMatch = { category: '其他', subcategory: '', confidence: 0 };

    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      let matches = 0;
      const matchedKeywords = keywords.filter(keyword => text.includes(keyword.toLowerCase()));
      matches = matchedKeywords.length;

      if (matches > bestMatch.confidence) {
        bestMatch = {
          category,
          subcategory: matchedKeywords.slice(0, 3).join(', '),
          confidence: Math.min(matches * 0.2, 0.9),
        };
      }
    }

    return bestMatch;
  }

  private extractTags(text: string): string[] {
    const tags = new Set<string>();

    for (const [tag, keywords] of Object.entries(this.tagKeywords)) {
      if (keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
        tags.add(tag);
      }
    }

    const domainTags = this.extractDomainTags(text);
    domainTags.forEach(tag => tags.add(tag));

    return Array.from(tags).slice(0, 5);
  }

  private extractDomainTags(text: string): string[] {
    const tags: string[] = [];

    if (text.includes('github.com')) tags.push('GitHub');
    if (text.includes('stackoverflow.com')) tags.push('Stack Overflow');
    if (text.includes('youtube.com') || text.includes('youtu.be')) tags.push('YouTube');
    if (text.includes('wikipedia.org')) tags.push('Wikipedia');
    if (text.includes('medium.com')) tags.push('Medium');
    if (text.includes('zhihu.com')) tags.push('知乎');
    if (text.includes('juejin.cn') || text.includes('juejin.im')) tags.push('掘金');

    return tags;
  }

  private generateSummary(title: string, description?: string): string {
    const baseDesc = description || '';

    if (baseDesc.length > 0) {
      const shortDesc = baseDesc.length > 100 ? baseDesc.substring(0, 100) + '...' : baseDesc;
      return shortDesc;
    }

    // 如果没有描述，从 URL 提取信息
    return `${title}`;
  }
}

let analyzerInstance: LocalAnalyzer | null = null;

export async function getLocalAnalyzer(): Promise<LocalAnalyzer> {
  if (!analyzerInstance) {
    analyzerInstance = new LocalAnalyzer();
  }
  return analyzerInstance;
}

export type { AnalysisResult, PageContent };
