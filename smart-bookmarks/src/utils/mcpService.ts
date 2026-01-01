/**
 * MCP (Model Context Protocol) 服务集成
 *
 * 提供外部信息查询能力：
 * 1. 联网搜索 - 使用自托管 Whoogle 服务
 * 2. 实时信息 - 新闻、天气、股票等
 * 3. 知识查询 - Wikipedia、Stack Overflow等
 */

import { loadAPIKeys } from './apiKeyRotator';

// Whoogle 自托管搜索服务器配置（使用 HTTPS 默认 443 端口）
const WHOOGLE_CONFIG = {
  endpoint: 'https://search.j-o-x.tech',
};

// Ollama 本地模型配置（注意：模型由用户在设置中配置）
const OLLAMA_CONFIG = {
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: '', // 用户在设置中自行配置
};

// MCP搜索结果类型
export interface MCPSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  publishDate?: string;
  thumbnail?: string;
}

// MCP查询响应
export interface MCPQueryResponse {
  success: boolean;
  query: string;
  results: MCPSearchResult[];
  totalResults?: number;
  searchTime?: number;
  suggestions?: string[];
  error?: string;
}

// 网页内容提取结果
export interface MCPWebContent {
  url: string;
  title: string;
  content: string;
  description?: string;
  author?: string;
  publishDate?: string;
  images?: string[];
  links?: Array<{ url: string; text: string }>;
}

/**
 * 解析 Whoogle HTML 搜索结果
 */
function parseWhoogleResults(html: string): MCPSearchResult[] {
  const results: MCPSearchResult[] = [];

  // 匹配搜索结果块
  const resultBlockRegex = /<div class="ZINbbc xpd EtOod pkphOe has-favicon"([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;

  let blockMatch;
  while ((blockMatch = resultBlockRegex.exec(html)) !== null) {
    const block = blockMatch[1];

    // 提取 URL
    const linkMatch = block.match(/href="(https:\/\/[^"]+)"/);
    // 提取标题
    const titleMatch = block.match(/<div class="ilUpNd UFvD1[^"]*">([^<]+)/);
    // 提取摘要
    const snippetMatch = block.match(/<div class="ilUpNd H66NU[^"]*">([\s\S]*?)<\/div>/);

    if (linkMatch && titleMatch) {
      results.push({
        url: linkMatch[1],
        title: titleMatch[1].replace(/<[^>]*>/g, '').trim(),
        snippet: snippetMatch
          ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
          : '',
        source: 'Whoogle',
      });
    }
  }

  return results;
}

/**
 * MCP服务管理器
 */
export class MCPServiceManager {
  private searchEngines = {
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
  };

  constructor() {}

  /**
   * 获取用户AI配置
   */
  private async getUserAIConfig(): Promise<{
    provider?: string;
    apiKey?: string;
    apiKeys?: string[];
    model: string;
    endpoint: string;
  }> {
    try {
      const result = await chrome.storage.local.get(['aiConfig']);
      const aiConfig = result.aiConfig as any;

      const provider = aiConfig?.provider || 'local';
      const isOllama = provider === 'ollama';

      return {
        provider,
        apiKey: isOllama ? undefined : (aiConfig?.apiKey || aiConfig?.apiKeys?.[0]),
        apiKeys: isOllama ? [] : aiConfig?.apiKeys,
        model: aiConfig?.model || (isOllama ? OLLAMA_CONFIG.model : 'doubao-lite-4k'),
        endpoint: aiConfig?.endpoint || (isOllama ? OLLAMA_CONFIG.endpoint : 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'),
      };
    } catch (error) {
      console.warn('[MCP] Failed to get AI config:', error);
      return { model: '', endpoint: '' };
    }
  }

  /**
   * 检查是否有 AI 配置（云端或本地）
   */
  private async hasAIConfig(): Promise<boolean> {
    const config = await this.getUserAIConfig();
    const isOllama = config.provider === 'ollama';
    // Ollama 有 endpoint 即可，云端需要有 apiKey
    if (isOllama) {
      return !!config.endpoint;
    }
    return !!(config.apiKeys?.length > 0 || config.apiKey);
  }

  /**
   * 联网搜索 - 使用自托管 Whoogle 服务（免费、无需 API Key）
   */
  async searchWeb(query: string, options: { maxResults?: number } = {}): Promise<MCPQueryResponse> {
    const startTime = Date.now();
    const { maxResults = 10 } = options;

    console.log('[MCP] Searching web with Whoogle:', query);

    try {
      const response = await fetch(`${WHOOGLE_CONFIG.endpoint}/search?q=${encodeURIComponent(query)}`);
      const html = await response.text();

      const results = parseWhoogleResults(html).slice(0, maxResults);
      const searchTime = Date.now() - startTime;

      return {
        success: true,
        query,
        results,
        totalResults: results.length,
        searchTime,
        suggestions: [`${query} 教程`, `${query} 文档`, `${query} 最新`],
      };
    } catch (error) {
      console.error('[MCP] Web search failed:', error);
      return this.getFallbackSearchResults(query);
    }
  }

  /**
   * 实时信息查询（天气/新闻/股票）
   */
  async getRealtimeInfo(query: string, type: 'news' | 'weather' | 'stock' | 'general' = 'general'): Promise<MCPQueryResponse> {
    console.log('[MCP] Getting realtime info:', query, type);

    // 检查是否有 AI 配置
    const hasAI = await this.hasAIConfig();
    if (!hasAI) {
      return {
        success: false,
        query,
        results: [],
        error: '需要配置 AI 服务（本地 Ollama 或云端 API）才能使用实时信息功能',
      };
    }

    try {
      const config = await this.getUserAIConfig();
      const isOllama = config.provider === 'ollama';
      const apiKey = isOllama ? undefined : (config.apiKeys?.[0] || config.apiKey);

      const prompt = this.buildRealtimePrompt(query, type);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
      });

      if (!response.ok) throw new Error('API request failed');

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) throw new Error('Invalid JSON response');

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        success: true,
        query,
        results: parsed.results || [],
        totalResults: parsed.results?.length || 0,
      };
    } catch (error) {
      console.error('[MCP] Realtime info failed:', error);
      return {
        success: false,
        query,
        results: [],
        error: '获取实时信息失败',
      };
    }
  }

  /**
   * 构建实时信息 prompt
   */
  private buildRealtimePrompt(query: string, type: string): string {
    const prompts: Record<string, string> = {
      news: `关于"${query}"的最新新闻资讯，返回JSON格式：{"results":[{"title":"新闻标题","url":"链接","snippet":"摘要","source":"来源","publishDate":"时间"}]}`,
      weather: `关于"${query}"的天气信息，返回JSON格式：{"results":[{"title":"天气","url":"天气网站","snippet":"温度、湿度、天气状况","source":"天气服务"}]}`,
      stock: `关于"${query}"的股票/金融信息，返回JSON格式：{"results":[{"title":"股票名称","url":"财经网站","snippet":"价格、涨跌幅、市值","source":"数据源"}]}`,
    };
    return prompts[type] || `关于"${query}"的最新信息，返回JSON格式：{"results":[{"title":"标题","url":"链接","snippet":"内容摘要"}]}`;
  }

  /**
   * 网页内容提取（使用 AI 推测内容）
   */
  async extractWebContent(url: string): Promise<MCPWebContent | null> {
    console.log('[MCP] Extracting content from:', url);

    const hasAI = await this.hasAIConfig();
    if (!hasAI) {
      // 无 AI 时返回 URL 解析结果
      return this.extractFromUrl(url);
    }

    try {
      const config = await this.getUserAIConfig();
      const isOllama = config.provider === 'ollama';
      const apiKey = isOllama ? undefined : (config.apiKeys?.[0] || config.apiKey);

      const prompt = `根据URL推测网页内容：${url}，返回JSON格式：{"title":"标题","description":"描述","content":"摘要（200字）","author":"作者"}`;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
      });

      if (!response.ok) return this.extractFromUrl(url);

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) return this.extractFromUrl(url);

      const parsed = JSON.parse(jsonMatch[0]);
      return { url, ...parsed };
    } catch (error) {
      console.error('[MCP] Content extraction failed:', error);
      return this.extractFromUrl(url);
    }
  }

  /**
   * 从 URL 简单解析内容（无需 AI）
   */
  private extractFromUrl(url: string): MCPWebContent {
    try {
      const urlObj = new URL(url);
      const title = urlObj.hostname.replace('www.', '').split('.')[0].toUpperCase();
      return {
        url,
        title: `${title} - ${urlObj.pathname.split('/').pop() || '页面'}`,
        content: `网页 URL: ${url}`,
        description: '无法直接获取网页内容，请打开链接查看',
      };
    } catch {
      return { url, title: '未知页面', content: '无法解析 URL' };
    }
  }

  /**
   * 知识库查询（使用 Whoogle 搜索）
   */
  async queryKnowledge(query: string, source: 'wikipedia' | 'stackoverflow' | 'github' = 'wikipedia'): Promise<MCPQueryResponse> {
    console.log('[MCP] Querying knowledge:', query, source);

    const searchQuery = source === 'wikipedia'
      ? `site:zh.wikipedia.org ${query}`
      : source === 'stackoverflow'
      ? `site:stackoverflow.com ${query}`
      : `site:github.com ${query}`;

    return this.searchWeb(searchQuery, { maxResults: 5 });
  }

  /**
   * 智能问答（搜索 + 可选 AI 总结）
   */
  async answerQuestion(question: string): Promise<{ answer: string; sources: MCPSearchResult[]; confidence: number }> {
    console.log('[MCP] Answering question:', question);

    // 先搜索
    const searchResults = await this.searchWeb(question, { maxResults: 5 });

    // 检查是否有 AI 配置
    const hasAI = await this.hasAIConfig();
    if (!hasAI) {
      // 无 AI 时直接返回搜索结果摘要
      const summary = searchResults.results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`)
        .join('\n\n');

      return {
        answer: `关于"${question}"的搜索结果：\n\n${summary || '未找到相关结果'}`,
        sources: searchResults.results,
        confidence: 0.5,
      };
    }

    // 有 AI 时生成智能回答
    try {
      const config = await this.getUserAIConfig();
      const isOllama = config.provider === 'ollama';
      const apiKey = isOllama ? undefined : (config.apiKeys?.[0] || config.apiKey);

      const sourcesText = searchResults.results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`)
        .join('\n\n');

      const prompt = `基于以下搜索结果，回答用户问题。

用户问题: ${question}

搜索结果：
${sourcesText}

请提供简洁准确的答案（100-200字），返回JSON格式：{"answer":"答案","confidence":0.8}`;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], temperature: 0.5 }),
      });

      if (!response.ok) throw new Error('AI request failed');

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { answer: parsed.answer || content, sources: searchResults.results, confidence: parsed.confidence || 0.5 };
      }

      return { answer: content, sources: searchResults.results, confidence: 0.5 };
    } catch (error) {
      console.error('[MCP] Answer question failed:', error);
      return {
        answer: '抱歉，无法回答这个问题。请尝试重新表述或使用搜索引擎。',
        sources: searchResults.results,
        confidence: 0,
      };
    }
  }

  /**
   * 降级搜索结果（返回搜索引擎链接）
   */
  private getFallbackSearchResults(query: string): MCPQueryResponse {
    const encodedQuery = encodeURIComponent(query);
    return {
      success: true,
      query,
      results: [
        { title: `在 Google 搜索 "${query}"`, url: `${this.searchEngines.google}${encodedQuery}`, snippet: '使用 Google 搜索', source: 'Google' },
        { title: `在 Bing 搜索 "${query}"`, url: `${this.searchEngines.bing}${encodedQuery}`, snippet: '使用 Bing 搜索', source: 'Bing' },
        { title: `在 DuckDuckGo 搜索 "${query}"`, url: `${this.searchEngines.duckduckgo}${encodedQuery}`, snippet: '隐私友好搜索', source: 'DuckDuckGo' },
      ],
      totalResults: 3,
      suggestions: [`${query} 教程`, `${query} 文档`, `${query} 最新`],
    };
  }
}

// 导出单例
export const mcpService = new MCPServiceManager();
