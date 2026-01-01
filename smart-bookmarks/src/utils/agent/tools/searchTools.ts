/**
 * 搜索工具 (Search Tools)
 * 提供网络搜索、GitHub 搜索和内容提取功能
 */

import { Tool, ToolResult } from '../types';
import { extractFullContent } from '../../contentExtractor';

/**
 * 默认搜索服务器（无端口，使用 HTTPS 默认 443）
 */
const DEFAULT_WHOOGLE_URL = 'https://search.j-o-x.tech';

/**
 * 搜索服务配置
 */
interface SearchConfig {
  whoogleUrl?: string;
  githubToken?: string;
}

/**
 * 获取搜索配置
 */
async function getSearchConfig(): Promise<SearchConfig> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(['searchConfig', 'userSettings']);
      return {
        // 优先使用用户配置，否则使用默认 Whoogle 服务器
        whoogleUrl: result.searchConfig?.whoogleUrl || result.userSettings?.searchServiceUrl || DEFAULT_WHOOGLE_URL,
        githubToken: result.searchConfig?.githubToken || result.userSettings?.githubToken,
      };
    }
  } catch (error) {
    console.warn('[SearchTools] Failed to get config:', error);
  }
  // 返回默认配置
  return {
    whoogleUrl: DEFAULT_WHOOGLE_URL,
  };
}

/**
 * 搜索结果类型
 */
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * GitHub 仓库结果类型
 */
interface GitHubRepo {
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  stars: number;
  language: string | null;
  updatedAt: string;
  topics: string[];
}

/**
 * 网络搜索工具
 * 使用 Whoogle 或备选搜索服务搜索网络
 */
export const webSearchTool: Tool = {
  name: 'web_search',
  description: '搜索互联网上的内容。可以搜索学习资源、文档、教程等。使用 Whoogle 或 DuckDuckGo 搜索引擎。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词',
      },
      maxResults: {
        type: 'number',
        description: '返回结果数量，默认 10，范围 1-30',
        minimum: 1,
        maximum: 30,
        default: 10,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (params: {
    query: string;
    maxResults?: number;
  }): Promise<ToolResult> => {
    try {
      const { query, maxResults = 10 } = params;

      if (!query || query.trim().length === 0) {
        return {
          success: false,
          error: '请提供搜索关键词',
        };
      }

      const config = await getSearchConfig();
      let results: SearchResult[] = [];
      let searchMethod = 'fallback';

      // 尝试使用 Whoogle
      if (config.whoogleUrl) {
        try {
          results = await searchWithWhoogle(query, config.whoogleUrl, maxResults);
          searchMethod = 'whoogle';
        } catch (error) {
          console.warn('[WebSearch] Whoogle failed, using fallback:', error);
        }
      }

      // 如果 Whoogle 失败或未配置，使用 DuckDuckGo HTML 搜索
      if (results.length === 0) {
        try {
          results = await searchWithDuckDuckGo(query, maxResults);
          searchMethod = 'duckduckgo';
        } catch (error) {
          console.warn('[WebSearch] DuckDuckGo failed:', error);
        }
      }

      // 如果所有搜索都失败，返回搜索引擎链接
      if (results.length === 0) {
        return {
          success: true,
          data: {
            query,
            results: [],
            searchMethod: 'manual',
            searchUrls: {
              google: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
              bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
              duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            },
            message: '自动搜索暂时不可用，请使用以下搜索引擎链接',
          },
        };
      }

      return {
        success: true,
        data: {
          query,
          count: results.length,
          results,
          searchMethod,
          message: `找到 ${results.length} 个相关结果`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Web search failed',
      };
    }
  },
};

/**
 * 使用 Whoogle 搜索
 */
async function searchWithWhoogle(
  query: string,
  whoogleUrl: string,
  maxResults: number
): Promise<SearchResult[]> {
  const searchUrl = `${whoogleUrl}/search?q=${encodeURIComponent(query)}`;

  // Whoogle 在 CSP 白名单中，直接 fetch
  const response = await fetch(searchUrl, {
    headers: {
      'Accept': 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Whoogle request failed: ${response.status}`);
  }

  const html = await response.text();
  return parseSearchResults(html, maxResults);
}

/**
 * 使用 DuckDuckGo HTML 搜索
 */
async function searchWithDuckDuckGo(
  query: string,
  maxResults: number
): Promise<SearchResult[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  // DuckDuckGo 在 CSP 白名单中，直接 fetch
  const response = await fetch(searchUrl, {
    headers: {
      'Accept': 'text/html',
      'User-Agent': 'Mozilla/5.0 (compatible; BookmarkAgent/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo request failed: ${response.status}`);
  }

  const html = await response.text();
  return parseDuckDuckGoResults(html, maxResults);
}

/**
 * 解析 Whoogle 搜索结果
 */
function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // 匹配搜索结果块 - 适配 Whoogle 的 HTML 结构
  // 结构: <div class="ZINbbc xpd EtOod pkphOe has-favicon">...</div>
  const resultBlockRegex = /<div class="ZINbbc xpd EtOod pkphOe has-favicon">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g;

  let blockMatch;
  while ((blockMatch = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
    const block = blockMatch[1];

    // 提取 URL - 更宽松的匹配
    const linkMatch = block.match(/href="(https:\/\/[^"]+)"/);
    // 提取标题 - 更宽松的匹配
    const titleMatch = block.match(/class="[^"]*UFvD1[^"]*">([^<]+)/);
    // 提取摘要 - 更宽松的匹配
    const snippetMatch = block.match(/class="[^"]*H66NU[^"]*">([^<]+)/);

    if (linkMatch && titleMatch) {
      results.push({
        url: linkMatch[1],
        title: titleMatch[1].replace(/<[^>]*>/g, '').trim(),
        snippet: snippetMatch
          ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
          : '',
      });
    }
  }

  // 如果上面的正则没匹配到，尝试备用正则
  if (results.length === 0) {
    const fallbackPattern = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<p[^>]*>([^<]*)<\/p>/gi;
    let match;

    while ((match = fallbackPattern.exec(html)) !== null && results.length < maxResults) {
      const url = match[1];
      const title = match[2].trim();
      const snippet = match[3].trim();

      // 过滤掉非 HTTP 链接和空标题
      if (url.startsWith('http') && title) {
        results.push({ title, url, snippet });
      }
    }
  }

  return results;
}

/**
 * 解析 DuckDuckGo HTML 搜索结果
 */
function parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML 结果格式 - 支持单引号和双引号
  // 先替换 HTML 实体
  const cleanedHtml = html.replace(/&amp;/g, '&');

  // 匹配结果链接和标题
  const linkRegex = /<a[^>]*class=['"]result__a['"][^>]*href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(cleanedHtml)) !== null && results.length < maxResults) {
    let url = match[1];
    const title = match[2].trim();

    // DuckDuckGo 使用重定向 URL，需要解析真实 URL
    if (url.includes('uddg=')) {
      const urlMatch = url.match(/uddg=([^&]+)/);
      if (urlMatch) {
        url = decodeURIComponent(urlMatch[1]);
      }
    }

    // 移除跟踪参数
    if (url.includes('&rut=')) {
      url = url.split('&rut=')[0];
    }

    // 提取摘要（查找后面的 result__snippet）
    let snippet = '';
    const lastIndex = linkRegex.lastIndex;
    const afterMatch = cleanedHtml.substring(lastIndex, lastIndex + 200);
    const snippetMatch = afterMatch.match(/class=['"]result__snippet['"][^>]*>([^<]+)/i);
    if (snippetMatch) {
      snippet = snippetMatch[1].trim();
    }

    if (url.startsWith('http') && title) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

/**
 * GitHub 搜索工具
 * 搜索 GitHub 仓库
 */
export const githubSearchTool: Tool = {
  name: 'github_search',
  description: '搜索 GitHub 上的开源项目和代码仓库。可以按语言、星标数等排序。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词',
      },
      type: {
        type: 'string',
        enum: ['repositories', 'code', 'issues'],
        description: '搜索类型，默认 repositories',
        default: 'repositories',
      },
      language: {
        type: 'string',
        description: '编程语言过滤（可选），如 Python、JavaScript 等',
      },
      sort: {
        type: 'string',
        enum: ['stars', 'forks', 'updated', 'best-match'],
        description: '排序方式，默认 best-match',
        default: 'best-match',
      },
      maxResults: {
        type: 'number',
        description: '返回结果数量，默认 10，范围 1-30',
        minimum: 1,
        maximum: 30,
        default: 10,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (params: {
    query: string;
    type?: 'repositories' | 'code' | 'issues';
    language?: string;
    sort?: 'stars' | 'forks' | 'updated' | 'best-match';
    maxResults?: number;
  }): Promise<ToolResult> => {
    try {
      const {
        query,
        type = 'repositories',
        language,
        sort = 'best-match',
        maxResults = 10,
      } = params;

      if (!query || query.trim().length === 0) {
        return {
          success: false,
          error: '请提供搜索关键词',
        };
      }

      const config = await getSearchConfig();

      // 构建搜索查询
      let searchQuery = query;
      if (language) {
        searchQuery += ` language:${language}`;
      }

      // 构建 API URL
      const apiUrl = new URL(`https://api.github.com/search/${type}`);
      apiUrl.searchParams.set('q', searchQuery);
      apiUrl.searchParams.set('per_page', String(Math.min(maxResults, 30)));
      if (sort !== 'best-match') {
        apiUrl.searchParams.set('sort', sort);
      }

      // 发送请求
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AnyMark-BookmarkAgent',
      };

      if (config.githubToken) {
        headers['Authorization'] = `token ${config.githubToken}`;
      }

      const response = await fetch(apiUrl.toString(), { headers });

      // 处理 Rate Limit
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
        const rateLimitReset = response.headers.get('X-RateLimit-Reset');

        if (rateLimitRemaining === '0') {
          const resetTime = rateLimitReset
            ? new Date(parseInt(rateLimitReset) * 1000).toLocaleTimeString()
            : '稍后';

          return {
            success: false,
            error: `GitHub API 请求次数已达上限，请在 ${resetTime} 后重试。配置 GitHub Token 可以提高限额。`,
          };
        }
      }

      if (!response.ok) {
        throw new Error(`GitHub API request failed: ${response.status}`);
      }

      const data = await response.json();

      // 解析仓库结果
      const repos: GitHubRepo[] = data.items.slice(0, maxResults).map((item: any) => ({
        name: item.name,
        fullName: item.full_name,
        description: item.description,
        url: item.html_url,
        stars: item.stargazers_count,
        language: item.language,
        updatedAt: item.updated_at,
        topics: item.topics || [],
      }));

      return {
        success: true,
        data: {
          query,
          type,
          totalCount: data.total_count,
          count: repos.length,
          results: repos,
          message: `在 GitHub 上找到 ${data.total_count} 个相关${type === 'repositories' ? '仓库' : '结果'}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'GitHub search failed',
      };
    }
  },
};

/**
 * 内容提取工具（增强版）
 * 提取网页的完整详细内容，包括结构化章节
 * 
 * 使用场景：
 * - 用户明确询问网页的详细内容（如"这个链接具体讲了什么"）
 * - 用户要求深入分析某篇文章
 * 
 * 不要在以下情况使用：
 * - 整理或分类书签时（使用 preview 信息即可）
 * - 搜索结果展示时（除非用户明确要求）
 * 
 * 注意：此工具调用成本较高，请谨慎使用
 */
export const extractContentTool: Tool = {
  name: 'extract_content',
  description: `提取网页的完整详细内容（3000-5000字符，结构化）。

仅在以下情况使用：
- 用户明确询问网页的详细内容（如"这个链接具体讲了什么"、"分析一下这篇文章"）
- 用户要求深入了解某个网页的内容

不要在以下情况使用：
- 整理或分类书签时（使用书签的 preview 信息即可，包含 aiSummary 和 aiTags）
- 搜索结果展示时（除非用户明确要求查看详细内容）
- 批量处理书签时

注意：此工具成本较高（提取 3000-5000 字符），请仅在必要时使用。`,
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要提取内容的网页 URL（必须是有效的 HTTP/HTTPS URL）',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  execute: async (params: { url: string }): Promise<ToolResult> => {
    try {
      const { url } = params;

      if (!url || !url.startsWith('http')) {
        return {
          success: false,
          error: '请提供有效的 URL',
        };
      }

      // 使用完整内容提取（结构化）
      const content = await extractFullContent(url);

      // 格式化章节内容为易读的文本
      const sectionsText = content.sections.map(section => {
        const headingPrefix = '#'.repeat(section.level);
        return `${headingPrefix} ${section.heading}\n\n${section.content}`;
      }).join('\n\n---\n\n');

      return {
        success: true,
        data: {
          url,
          title: content.title,
          excerpt: content.excerpt,
          
          // 结构化内容（按章节组织）
          sections: content.sections,
          sectionsCount: content.sections.length,
          
          // 纯文本（保留段落结构）
          textContent: content.textContent,
          
          // 格式化的章节文本（用于 Agent 阅读）
          formattedContent: sectionsText,
          
          // 元数据
          author: content.byline,
          siteName: content.siteName,
          publishedTime: content.publishedTime,
          wordCount: content.length,
          
          extractionMethod: 'readability-full',
          message: `已提取 "${content.title}" 的完整内容（${content.sections.length} 个章节，约 ${content.length} 字）`,
        },
      };
    } catch (error) {
      console.error('[ExtractContent] Extraction failed:', error);
      
      // 降级处理：返回基础信息
      return {
        success: false,
        error: '内容提取失败，请手动查看网页',
        data: {
          url: params.url,
          title: extractTitleFromUrl(params.url),
          message: '建议直接访问网页查看内容',
        },
      };
    }
  },
};

/**
 * 从 URL 提取标题（降级方案）
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

    // 如果路径为空或只有扩展名，使用主机名
    return urlObj.hostname || url;
  } catch {
    return url;
  }
}

// 导出所有搜索工具
export const searchTools: Tool[] = [
  webSearchTool,
  githubSearchTool,
  extractContentTool,
];
