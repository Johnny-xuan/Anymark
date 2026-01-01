/**
 * Agent 配置
 * 统一管理所有外部服务配置
 */

// 默认搜索服务器（无端口，使用 HTTPS 默认 443）
export const DEFAULT_SEARCH_URL = 'https://search.j-o-x.tech';

// OSS Insight API（GitHub Trending）
export const OSS_INSIGHT_API = 'https://api.ossinsight.io/v1';

// 重试配置
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // ms
  maxDelay: 10000, // ms
};

// 超时配置
export const TIMEOUT_CONFIG = {
  search: 10000,   // 10s
  github: 15000,   // 15s
  trending: 10000, // 10s
  extract: 30000,  // 30s
};

/**
 * 搜索配置接口
 */
export interface SearchConfig {
  searchUrl?: string;
  githubToken?: string;
}

/**
 * 从 Chrome Storage 获取搜索配置
 */
export async function getSearchConfig(): Promise<SearchConfig> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(['searchConfig', 'userSettings']);
      return {
        searchUrl: result.searchConfig?.whoogleUrl || result.userSettings?.searchServiceUrl || DEFAULT_SEARCH_URL,
        githubToken: result.searchConfig?.githubToken || result.userSettings?.githubToken,
      };
    }
  } catch (error) {
    console.warn('[Config] Failed to get search config:', error);
  }
  return { searchUrl: DEFAULT_SEARCH_URL };
}

/**
 * 带重试的 fetch
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: { maxRetries?: number; timeout?: number } = {}
): Promise<Response> {
  const { maxRetries = RETRY_CONFIG.maxRetries, timeout = TIMEOUT_CONFIG.search } = config;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok || response.status < 500) {
        return response;
      }
      
      // 5xx 错误，重试
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // 如果是 abort，不重试
      if (lastError.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
    }
    
    // 指数退避
    if (attempt < maxRetries - 1) {
      const delay = Math.min(
        RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
        RETRY_CONFIG.maxDelay
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Request failed after retries');
}
