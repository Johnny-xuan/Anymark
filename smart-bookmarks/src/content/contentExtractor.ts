/**
 * 智能内容提取器
 * 从网页中提取重要内容，控制在 800-1200 tokens
 */

export interface ExtractedContent {
  url: string;
  title: string;
  description: string;
  keywords: string;
  mainContent: string;
  headings: string;
  firstParagraph: string;
  favicon: string;
  structured: string;
  estimatedTokens: number;
}

export class SmartContentExtractor {
  /**
   * 提取重要内容
   */
  static extract(): ExtractedContent {
    const data = {
      url: window.location.href,
      title: document.title,
      description: this.getMetaDescription(),
      keywords: this.getKeywords(),
      mainContent: this.getMainContent(),
      headings: this.getHeadings(),
      firstParagraph: this.getFirstParagraph(),
      favicon: this.getFavicon(),
    };

    const structured = this.buildStructuredPrompt(data);
    const estimatedTokens = Math.round(structured.length * 0.75);

    return {
      ...data,
      structured,
      estimatedTokens,
    };
  }

  /**
   * 获取 Meta 描述
   */
  static getMetaDescription(): string {
    const selectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ];

    for (const selector of selectors) {
      const meta = document.querySelector(selector);
      if (meta && meta.getAttribute('content')) {
        const content = meta.getAttribute('content') || '';
        if (content.length > 20) {
          return content;
        }
      }
    }

    return '';
  }

  /**
   * 获取关键词
   */
  static getKeywords(): string {
    const meta = document.querySelector('meta[name="keywords"]');
    if (meta && meta.getAttribute('content')) {
      const keywords = meta.getAttribute('content') || '';
      return keywords.split(',').slice(0, 10).join(', ');
    }
    return '';
  }

  /**
   * 获取主要内容
   */
  static getMainContent(): string {
    const mainElement = this.findMainElement();
    if (mainElement) {
      return this.extractTextFromElement(mainElement, 500);
    }

    return this.extractImportantParagraphs();
  }

  /**
   * 查找主内容区域
   */
  static findMainElement(): Element | null {
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      '#content',
      '.content',
      '.main-content',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && this.isValidContent(element)) {
        return element;
      }
    }

    return null;
  }

  /**
   * 验证内容是否有效
   */
  static isValidContent(element: Element): boolean {
    const text = element.textContent?.trim() || '';
    return text.length > 100 && !this.isNavigationElement(element);
  }

  /**
   * 判断是否是导航元素
   */
  static isNavigationElement(element: Element): boolean {
    const navClasses = ['nav', 'menu', 'sidebar', 'footer', 'header'];
    const className = element.className.toString().toLowerCase();
    return navClasses.some(nav => className.includes(nav));
  }

  /**
   * 从元素提取文本
   */
  static extractTextFromElement(element: Element, maxChars = 500): string {
    let text = element.textContent || '';

    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();

    if (text.length > maxChars) {
      text = this.smartTruncate(text, maxChars);
    }

    return text;
  }

  /**
   * 智能截断（保留完整句子）
   */
  static smartTruncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const truncated = text.substring(0, maxLength);
    const lastPunctuation = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('？'),
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('! '),
      truncated.lastIndexOf('? ')
    );

    if (lastPunctuation > maxLength * 0.7) {
      return truncated.substring(0, lastPunctuation + 1);
    }

    return truncated + '...';
  }

  /**
   * 提取重要段落
   */
  static extractImportantParagraphs(): string {
    const paragraphs = Array.from(document.querySelectorAll('p'))
      .map(p => p.textContent?.trim() || '')
      .filter(text => {
        return (
          text.length > 50 &&
          text.length < 500 &&
          !this.isBoilerplate(text)
        );
      })
      .slice(0, 5);

    const combined = paragraphs.join(' ');
    return this.smartTruncate(combined, 500);
  }

  /**
   * 判断是否是模板文字
   */
  static isBoilerplate(text: string): boolean {
    const boilerplateKeywords = [
      'cookie',
      'privacy policy',
      'terms of service',
      '订阅',
      '关注我们',
      '分享到',
      '评论',
      '相关文章',
    ];

    const lowerText = text.toLowerCase();
    return boilerplateKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * 获取标题结构
   */
  static getHeadings(): string {
    const headings: string[] = [];
    const selectors = ['h1', 'h2', 'h3'];

    selectors.forEach(tag => {
      document.querySelectorAll(tag).forEach(heading => {
        const text = heading.textContent?.trim() || '';
        if (text.length > 3 && text.length < 100) {
          headings.push(text);
        }
      });
    });

    return headings.slice(0, 8).join(' | ');
  }

  /**
   * 获取第一段
   */
  static getFirstParagraph(): string {
    const paragraphs = document.querySelectorAll('p');

    for (const p of paragraphs) {
      const text = p.textContent?.trim() || '';
      if (text.length > 50 && text.length < 500) {
        return this.smartTruncate(text, 200);
      }
    }

    return '';
  }

  /**
   * 获取 Favicon
   */
  static getFavicon(): string {
    const selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
    ];

    for (const selector of selectors) {
      const link = document.querySelector(selector);
      if (link && link.getAttribute('href')) {
        return link.getAttribute('href') || '';
      }
    }

    return `${window.location.origin}/favicon.ico`;
  }

  /**
   * 构建结构化提示内容
   */
  static buildStructuredPrompt(data: any): string {
    const parts: string[] = [];

    if (data.title) {
      parts.push(`【标题】${data.title}`);
    }

    if (data.description) {
      parts.push(`【描述】${data.description}`);
    }

    if (data.firstParagraph) {
      parts.push(`【开篇】${data.firstParagraph}`);
    }

    if (data.headings) {
      parts.push(`【章节】${data.headings}`);
    }

    if (data.keywords) {
      parts.push(`【关键词】${data.keywords}`);
    }

    if (data.mainContent) {
      parts.push(`【正文】${data.mainContent}`);
    }

    return parts.join('\n\n');
  }
}

// 用于 Chrome Extension 的导出
if (typeof window !== 'undefined') {
  (window as any).SmartContentExtractor = SmartContentExtractor;
}
