/**
 * 内容提取模块
 * 使用 @mozilla/readability 进行专业的网页内容提取
 * 
 * 提供两种提取模式：
 * 1. 框架内容提取（轻量级）- 用于 AI 智能分析
 * 2. 完整内容提取（深度阅读）- 用于 Agent extract_content 工具
 */

import { Readability } from '@mozilla/readability';

/**
 * 框架内容提取结果
 */
export interface FrameworkContent {
  title: string;
  excerpt: string;          // 摘要
  textContent: string;      // 前 2000 字符的纯文本
  siteName?: string;
  byline?: string;          // 作者
}

/**
 * 文档章节
 */
export interface ContentSection {
  heading: string;          // 章节标题
  content: string;          // 章节内容（纯文本，保留段落结构）
  level: number;            // 标题级别（1-6，对应 h1-h6）
}

/**
 * 完整内容提取结果（结构化）
 */
export interface FullContent {
  title: string;
  excerpt: string;
  
  // 结构化内容
  sections: ContentSection[];  // 按章节组织的内容
  
  // 纯文本（用于快速预览，保留段落分隔）
  textContent: string;         // 前 5000 字符，保留 \n\n 段落分隔
  
  // 元数据
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  length: number;              // 文章总长度
}

/**
 * 提取框架内容（轻量级）
 * 用于 AI 智能分析、快速保存等场景
 * 
 * 策略：
 * 1. 优先使用 content script（如果有 tabId）
 * 2. 降级使用 background fetch（可能被 CORS 阻止）
 * 
 * @param url - 网页 URL
 * @param tabId - 可选的 tab ID，如果提供则使用 content script
 * @returns 框架内容（约 1000-2000 字符）
 */
export async function extractFrameworkContent(
  url: string,
  tabId?: number
): Promise<FrameworkContent> {
  try {
    // 策略 1：如果有 tabId，使用 content script（最稳定）
    if (tabId !== undefined) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'EXTRACT_FROM_TAB',
          data: { tabId, url }
        });
        
        if (response.success && response.data) {
          const pageContent = response.data;
          
          return {
            title: cleanText(pageContent.title),
            excerpt: cleanText(pageContent.description),
            textContent: cleanText(pageContent.bodyText).substring(0, 2000),
            siteName: pageContent.article?.siteName,
            byline: pageContent.article?.byline,
          };
        }
      } catch (error) {
        console.warn('[ContentExtractor] Content script extraction failed, falling back:', error);
      }
    }

    // 策略 2：使用 background fetch（降级方案，可能被 CORS 阻止）
    let html: string;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_URL_CONTENT',
        data: { url }
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch content');
      }
      
      html = response.data.html;
    } catch (error) {
      console.warn('[ContentExtractor] Background fetch failed:', error);
      // 最终降级：返回基础信息
      return fallbackExtraction('', url);
    }

    // 环境检测：Service Worker 中没有 DOMParser
    if (!isDOMEnvironment()) {
      console.warn('[ContentExtractor] Running in non-DOM environment, returning basic info');
      return {
        title: extractTitleFromUrl(url),
        excerpt: '',
        textContent: '',
      };
    }

    // 2. 使用 DOMParser 解析
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 3. 使用 Readability 提取内容
    const reader = new Readability(doc, {
      charThreshold: 500,
      keepClasses: false,
      debug: false,
    });

    const article = reader.parse();

    if (!article) {
      // 降级到基础提取
      return fallbackExtraction(html, url);
    }

    // 4. 清洗文本内容
    const cleanedText = cleanText(article.textContent);

    return {
      title: cleanText(article.title),
      excerpt: cleanText(article.excerpt || ''),
      textContent: cleanedText.substring(0, 2000), // 前 2000 字符
      siteName: article.siteName || undefined,
      byline: article.byline || undefined,
    };
  } catch (error) {
    console.error('[ContentExtractor] Framework extraction failed:', error);
    // 降级到基础提取
    return fallbackExtraction('', url);
  }
}

/**
 * 提取完整内容（深度阅读）
 * 用于 Agent extract_content 工具
 * 
 * 策略优先级：
 * 1. Content Script（如果有 tabId）- 最稳定
 * 2. 服务器代理（如果配置了）- 绕过 CORS
 * 3. Background Fetch（降级）- 会被 CORS 阻止
 * 
 * @param url - 网页 URL
 * @param tabId - 可选的 tab ID，如果提供则使用 content script
 * @returns 完整内容（约 3000-5000 字符，结构化）
 */
export async function extractFullContent(
  url: string,
  tabId?: number
): Promise<FullContent> {
  try {
    // 策略 1：如果有 tabId，使用 content script（最稳定）
    if (tabId !== undefined) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'EXTRACT_FROM_TAB',
          data: { tabId, url, fullContent: true }
        });
        
        if (response.success && response.data && response.data.article) {
          const pageContent = response.data;
          const article = pageContent.article;
          
          // 从 article.content 提取章节
          const sections = extractSections(article.content);
          
          return {
            title: cleanText(article.title),
            excerpt: cleanText(article.excerpt || ''),
            sections,
            textContent: cleanText(article.textContent).substring(0, 5000),
            byline: article.byline,
            siteName: article.siteName,
            publishedTime: undefined,
            length: article.length,
          };
        }
      } catch (error) {
        console.warn('[ContentExtractor] Content script extraction failed, falling back:', error);
      }
    }

    // 策略 2：尝试使用服务器代理（如果配置了）
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_URL_VIA_PROXY',
        data: { url }
      });
      
      if (response.success && response.data.html) {
        const html = response.data.html;
        
        // 环境检测：Service Worker 中没有 DOMParser
        if (!isDOMEnvironment()) {
          console.warn('[ContentExtractor] Running in non-DOM environment, cannot parse HTML');
          throw new Error('DOM environment required for content extraction');
        }
        
        // 使用 DOMParser 解析
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 使用 Readability 提取内容
        const reader = new Readability(doc, {
          charThreshold: 500,
          keepClasses: false,
          debug: false,
        });

        const article = reader.parse();

        if (article) {
          const sections = extractSections(article.content);
          const cleanedText = cleanText(article.textContent);

          return {
            title: cleanText(article.title),
            excerpt: cleanText(article.excerpt || ''),
            sections,
            textContent: cleanedText.substring(0, 5000),
            byline: article.byline || undefined,
            siteName: article.siteName || undefined,
            publishedTime: article.publishedTime || undefined,
            length: article.length,
          };
        }
      }
    } catch (error) {
      console.warn('[ContentExtractor] Server proxy fetch failed, trying direct fetch:', error);
    }

    // 策略 3：降级使用 background fetch（会被 CORS 阻止）
    let html: string;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_URL_CONTENT',
        data: { url }
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch content');
      }
      
      html = response.data.html;
    } catch (error) {
      console.warn('[ContentExtractor] Background fetch failed:', error);
      throw new Error('无法获取页面内容。请确保：1) 页面已在浏览器中打开，或 2) 网站允许跨域访问');
    }

    // 环境检测：Service Worker 中没有 DOMParser
    if (!isDOMEnvironment()) {
      console.warn('[ContentExtractor] Running in non-DOM environment, cannot parse HTML');
      throw new Error('DOM environment required for content extraction. Please open the page in a browser tab first.');
    }

    // 使用 DOMParser 解析
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 使用 Readability 提取内容
    const reader = new Readability(doc, {
      charThreshold: 500,
      keepClasses: false,
      debug: false,
    });

    const article = reader.parse();

    if (!article) {
      throw new Error('Readability failed to parse article');
    }

    // 提取结构化章节
    const sections = extractSections(article.content);

    // 清洗文本内容
    const cleanedText = cleanText(article.textContent);

    return {
      title: cleanText(article.title),
      excerpt: cleanText(article.excerpt || ''),
      sections,
      textContent: cleanedText.substring(0, 5000),
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
      publishedTime: article.publishedTime || undefined,
      length: article.length,
    };
  } catch (error) {
    console.error('[ContentExtractor] Full extraction failed:', error);
    throw error;
  }
}

/**
 * 提取章节结构
 * 从 HTML 内容中提取标题和对应的内容
 * 注意：此函数需要 DOM 环境，在 Service Worker 中会返回空数组
 */
function extractSections(htmlContent: string): ContentSection[] {
  // 环境检测：Service Worker 中没有 DOMParser
  if (!isDOMEnvironment()) {
    console.warn('[ContentExtractor] extractSections called in non-DOM environment, returning empty sections');
    return [];
  }
  
  const parser = new DOMParser();
  const contentDoc = parser.parseFromString(htmlContent, 'text/html');
  
  const sections: ContentSection[] = [];
  const headings = contentDoc.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName[1]); // h1 -> 1, h2 -> 2
    const title = cleanText(heading.textContent || '');
    
    // 获取该标题到下一个标题之间的内容
    let content = '';
    let nextNode = heading.nextElementSibling;
    const nextHeading = headings[index + 1];
    
    while (nextNode && nextNode !== nextHeading) {
      // 提取段落文本，保留段落分隔
      if (nextNode.tagName === 'P') {
        const text = cleanText(nextNode.textContent || '');
        if (text) {
          content += text + '\n\n';
        }
      } else if (nextNode.tagName === 'UL' || nextNode.tagName === 'OL') {
        // 提取列表项
        const items = nextNode.querySelectorAll('li');
        items.forEach(item => {
          const text = cleanText(item.textContent || '');
          if (text) {
            content += '- ' + text + '\n';
          }
        });
        content += '\n';
      } else if (nextNode.tagName === 'PRE' || nextNode.tagName === 'CODE') {
        // 提取代码块
        const code = nextNode.textContent || '';
        if (code.trim()) {
          content += '\n```\n' + code.trim() + '\n```\n\n';
        }
      }
      nextNode = nextNode.nextElementSibling;
    }
    
    if (title || content.trim()) {
      sections.push({
        heading: title,
        content: content.trim(),
        level,
      });
    }
  });
  
  // 如果没有标题，将整个内容作为一个章节
  if (sections.length === 0) {
    const allText = cleanText(contentDoc.body.textContent || '');
    if (allText) {
      sections.push({
        heading: 'Content',
        content: allText.substring(0, 5000),
        level: 1,
      });
    }
  }
  
  return sections;
}

/**
 * 清理文本内容
 * - 解码 HTML 实体
 * - 移除特殊字符
 * - 规范化空白
 */
function cleanText(text: string): string {
  if (!text) return '';
  
  // 1. 解码 HTML 实体
  const decoded = decodeHtmlEntities(text);
  
  // 2. 清理特殊字符和空白
  return decoded
    .replace(/&nbsp;/g, ' ')           // 替换 &nbsp;
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // 移除零宽字符
    .replace(/\r\n/g, '\n')            // 统一换行符
    .replace(/\n{3,}/g, '\n\n')        // 最多保留两个换行
    .replace(/[ \t]+/g, ' ')           // 合并多个空格
    .trim();
}

/**
 * 检查是否在 DOM 环境中运行
 */
function isDOMEnvironment(): boolean {
  return typeof document !== 'undefined' && typeof DOMParser !== 'undefined';
}

/**
 * 解码 HTML 实体 - Service Worker 兼容版本
 * 使用正则表达式替换，不依赖 DOM
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  
  // 常见的命名实体 - 使用 Unicode 码点避免字符串解析问题
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&nbsp;': ' ',
    '&copy;': '\u00A9',      // ©
    '&reg;': '\u00AE',       // ®
    '&trade;': '\u2122',     // ™
    '&mdash;': '\u2014',     // —
    '&ndash;': '\u2013',     // –
    '&hellip;': '\u2026',    // …
    '&lsquo;': '\u2018',     // '
    '&rsquo;': '\u2019',     // '
    '&ldquo;': '\u201C',     // "
    '&rdquo;': '\u201D',     // "
    '&bull;': '\u2022',      // •
    '&middot;': '\u00B7',    // ·
    '&times;': '\u00D7',     // ×
    '&divide;': '\u00F7',    // ÷
    '&euro;': '\u20AC',      // €
    '&pound;': '\u00A3',     // £
    '&yen;': '\u00A5',       // ¥
    '&cent;': '\u00A2',      // ¢
  };
  
  let result = text;
  
  // 替换命名实体
  for (const [entity, char] of Object.entries(namedEntities)) {
    result = result.split(entity).join(char);
  }
  
  // 替换数字实体 (&#123;)
  result = result.replace(/&#(\d+);/g, (_, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });
  
  // 替换十六进制实体 (&#x7B;)
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  return result;
}

/**
 * 降级提取（当 Readability 失败时）
 * 提取基础元数据
 * 注意：此函数需要 DOM 环境来解析 HTML
 */
function fallbackExtraction(html: string, url: string): FrameworkContent {
  try {
    // 如果没有 HTML 或不在 DOM 环境中，返回基础信息
    if (!html || !isDOMEnvironment()) {
      return {
        title: extractTitleFromUrl(url),
        excerpt: '',
        textContent: '',
      };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 提取基础元数据
    const title = extractTitle(doc) || extractTitleFromUrl(url);
    const description = extractDescription(doc);
    const keywords = extractKeywords(doc);

    return {
      title: cleanText(title),
      excerpt: cleanText(description),
      textContent: cleanText(description + ' ' + keywords).substring(0, 2000),
    };
  } catch (error) {
    console.error('[ContentExtractor] Fallback extraction failed:', error);
    return {
      title: extractTitleFromUrl(url),
      excerpt: '',
      textContent: '',
    };
  }
}

/**
 * 从 HTML 提取标题
 */
function extractTitle(doc: Document): string {
  // 尝试 <title> 标签
  const titleEl = doc.querySelector('title');
  if (titleEl?.textContent) {
    return titleEl.textContent;
  }

  // 尝试 og:title
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    return ogTitle.getAttribute('content') || '';
  }

  // 尝试 <h1>
  const h1 = doc.querySelector('h1');
  if (h1?.textContent) {
    return h1.textContent;
  }

  return '';
}

/**
 * 提取描述
 */
function extractDescription(doc: Document): string {
  // meta description
  const descMeta = doc.querySelector('meta[name="description"]');
  if (descMeta) {
    return descMeta.getAttribute('content') || '';
  }

  // og:description
  const ogDesc = doc.querySelector('meta[property="og:description"]');
  if (ogDesc) {
    return ogDesc.getAttribute('content') || '';
  }

  return '';
}

/**
 * 提取关键词
 */
function extractKeywords(doc: Document): string {
  const keywordsMeta = doc.querySelector('meta[name="keywords"]');
  if (keywordsMeta) {
    return keywordsMeta.getAttribute('content') || '';
  }
  return '';
}

/**
 * 从 URL 提取标题
 */
function extractTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // 从路径提取
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      // 移除文件扩展名和连字符
      const cleaned = lastPart
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]/g, ' ')
        .trim();

      if (cleaned.length > 0) {
        return cleaned.replace(/\b\w/g, c => c.toUpperCase());
      }
    }

    // 如果路径为空，使用主机名
    return urlObj.hostname || url;
  } catch {
    return url;
  }
}
