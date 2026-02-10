/**
 * Content Script - 页面内容提取器
 * 
 * 在目标页面内部运行，直接读取 DOM，绕过 CSP 和 CORS 限制
 * 
 * 使用场景：
 * 1. 用户正在浏览的页面（快速保存）
 * 2. 批量分析已打开的标签页
 * 3. 任何需要提取页面内容的场景
 */

import { Readability } from '@mozilla/readability';

/**
 * 页面内容提取结果
 */
export interface PageContent {
  url: string;
  title: string;
  description: string;
  keywords: string;
  bodyText: string;
  
  // Readability 提取的正文（可选）
  article?: {
    title: string;
    content: string;
    textContent: string;
    excerpt: string;
    byline?: string;
    siteName?: string;
    length: number;
  };
}

/**
 * 提取页面内容（在页面内部执行）
 * 
 * 此函数会被 chrome.scripting.executeScript 注入到目标页面
 * 必须是自包含的（不能引用外部变量）
 */
export function extractPageContent(): PageContent {
  // 提取 meta description
  const getMetaDescription = (): string => {
    const selectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]'
    ];
    for (const sel of selectors) {
      const meta = document.querySelector(sel);
      const content = meta?.getAttribute('content');
      if (content && content.length > 20) return content;
    }
    return '';
  };

  // 提取 meta keywords
  const getMetaKeywords = (): string => {
    const meta = document.querySelector('meta[name="keywords"]');
    return meta?.getAttribute('content') || '';
  };

  // 提取主要内容（简单版本）
  const getMainContent = (): string => {
    const selectors = ['article', 'main', '[role="main"]', '.content', '#content'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent?.trim() || '';
        if (text.length > 100) {
          return text.substring(0, 2000).replace(/\s+/g, ' ');
        }
      }
    }
    
    // 降级：使用 body
    const bodyText = document.body.textContent?.trim() || '';
    return bodyText.substring(0, 2000).replace(/\s+/g, ' ');
  };

  // 基础内容
  const content: PageContent = {
    url: window.location.href,
    title: document.title,
    description: getMetaDescription(),
    keywords: getMetaKeywords(),
    bodyText: getMainContent(),
  };

  // 尝试使用 Readability 提取正文（如果可用）
  try {
    // 注意：Readability 需要在注入时一起提供
    // 这里我们先返回基础内容，Readability 提取在 background 中处理
  } catch (error) {
    console.warn('[PageExtractor] Readability extraction failed:', error);
  }

  return content;
}

/**
 * 提取页面内容（增强版，包含 Readability）
 * 
 * 此函数需要 Readability 库，会在 background script 中调用
 */
export function extractPageContentWithReadability(): PageContent {
  // 基础提取
  const content = extractPageContent();

  // 使用 Readability 提取正文
  try {
    const documentClone = document.cloneNode(true) as Document;
    const reader = new Readability(documentClone, {
      charThreshold: 500,
      keepClasses: false,
      debug: false,
    });

    const article = reader.parse();

    if (article) {
      content.article = {
        title: article.title,
        content: article.content,
        textContent: article.textContent,
        excerpt: article.excerpt,
        byline: article.byline || undefined,
        siteName: article.siteName || undefined,
        length: article.length,
      };
    }
  } catch (error) {
    console.warn('[PageExtractor] Readability extraction failed:', error);
  }

  return content;
}

/**
 * 提取页面 HTML（用于后续处理）
 */
export function extractPageHTML(): { html: string; url: string } {
  return {
    html: document.documentElement.outerHTML,
    url: window.location.href,
  };
}
