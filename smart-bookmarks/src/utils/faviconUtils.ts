/**
 * Favicon 处理工具
 * 优先使用 Chrome 内置 favicon API，备选 Google Favicon Service
 */

// Favicon URL 缓存（内存缓存，避免重复请求）
const faviconCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000; // 最多缓存1000个

/**
 * 清理缓存（当缓存过大时）
 */
function cleanupCache(): void {
  if (faviconCache.size > MAX_CACHE_SIZE) {
    // 删除最旧的条目（简单实现：删除前20%）
    const entriesToRemove = Math.floor(MAX_CACHE_SIZE * 0.2);
    let count = 0;
    for (const key of faviconCache.keys()) {
      if (count >= entriesToRemove) break;
      faviconCache.delete(key);
      count++;
    }
    console.log(`[faviconUtils] Cache cleaned: removed ${count} entries`);
  }
}

/**
 * 获取缓存键
 */
function getCacheKey(url: string, size: number): string {
  return `${url}_${size}`;
}

/**
 * 从书签 URL 提取域名
 * @param url 书签 URL
 * @returns 域名，如果失败返回空字符串
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return '';
  }
}

/**
 * 获取 Chrome 内置 favicon URL (Manifest V3)
 * 使用 chrome.runtime.getURL("/_favicon/") API
 * @param pageUrl 页面 URL
 * @param size 图标大小
 * @returns Chrome favicon URL
 */
export function getChromeFaviconUrl(pageUrl: string, size: number = 32): string | undefined {
  try {
    // 检查是否在 Chrome 扩展环境中
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
      faviconUrl.searchParams.set('pageUrl', pageUrl);
      faviconUrl.searchParams.set('size', size.toString());
      return faviconUrl.toString();
    }
  } catch (e) {
    console.warn('[faviconUtils] Chrome favicon API not available:', e);
  }
  return undefined;
}

/**
 * 获取 Google Favicon Service URL (备选方案)
 * @param domain 域名
 * @param size 图标大小
 * @returns Google favicon URL
 */
export function getGoogleFaviconUrl(domain: string, size: number = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * 获取优化后的 favicon URL（带缓存）
 * 优先使用 Chrome 内置 API，备选 Google Favicon Service
 * @param originalFavicon 原始 favicon URL（可能是 chrome://favicon/ 格式）
 * @param bookmarkUrl 书签的 URL
 * @param size 图标大小（默认32）
 * @returns 优化后的 favicon URL
 */
export function getOptimizedFaviconUrl(
  _originalFavicon: string | undefined,
  bookmarkUrl: string,
  size: number = 32
): string | undefined {
  // 如果没有书签 URL，返回 undefined
  if (!bookmarkUrl) return undefined;

  // 检查缓存
  const cacheKey = getCacheKey(bookmarkUrl, size);
  const cached = faviconCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. 优先使用 Chrome 内置 favicon API
  const chromeFavicon = getChromeFaviconUrl(bookmarkUrl, size);
  if (chromeFavicon) {
    faviconCache.set(cacheKey, chromeFavicon);
    cleanupCache();
    return chromeFavicon;
  }

  // 2. 备选：使用 Google Favicon Service
  const domain = extractDomain(bookmarkUrl);
  if (domain) {
    const googleFavicon = getGoogleFaviconUrl(domain, size);
    faviconCache.set(cacheKey, googleFavicon);
    cleanupCache();
    return googleFavicon;
  }

  return undefined;
}

/**
 * 获取 favicon 的备选 URL 列表
 * @param bookmarkUrl 书签的 URL
 * @returns 备选 URL 数组，按优先级排序
 */
export function getFaviconFallbacks(bookmarkUrl: string): string[] {
  const fallbacks: string[] = [];

  try {
    const urlObj = new URL(bookmarkUrl);
    const domain = urlObj.hostname;
    const origin = urlObj.origin;

    // 1. Google Favicon Service (最可靠，有缓存)
    fallbacks.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`);

    // 2. DuckDuckGo Favicon Service (备选)
    fallbacks.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`);

    // 3. 原始网站的 /favicon.ico
    fallbacks.push(`${origin}/favicon.ico`);

    // 4. Favicon.io 服务 (另一个备选)
    fallbacks.push(`https://favicons.githubusercontent.com/${encodeURIComponent(domain)}`);
  } catch (e) {
    console.warn('[faviconUtils] Invalid bookmark URL:', bookmarkUrl);
  }

  return fallbacks;
}

/**
 * 在 img 元素上设置 favicon，带自动 fallback
 * @param img HTML Image 元素
 * @param bookmarkUrl 书签 URL
 * @param onAllFailed 所有备选都失败时的回调
 */
export function setFaviconWithFallback(
  img: HTMLImageElement,
  bookmarkUrl: string,
  onAllFailed: () => void
): void {
  const fallbacks = getFaviconFallbacks(bookmarkUrl);
  let currentIndex = 0;

  const tryNext = () => {
    if (currentIndex >= fallbacks.length) {
      // 所有备选都失败
      onAllFailed();
      return;
    }

    const url = fallbacks[currentIndex];
    currentIndex++;

    // 设置错误处理
    img.onerror = () => {
      console.warn(`[faviconUtils] Favicon failed (${currentIndex}/${fallbacks.length}):`, url);
      tryNext();
    };

    // 尝试加载
    img.src = url;
  };

  // 开始尝试第一个
  tryNext();
}

/**
 * 预加载常用域名的 favicon（在初始化时调用）
 * @param commonDomains 常用域名列表
 */
export function preloadFavicons(commonDomains: string[]): void {
  console.log(`[faviconUtils] Preloading ${commonDomains.length} favicons`);
  
  commonDomains.forEach(domain => {
    const size = 64;
    const cacheKey = getCacheKey(domain, size);
    
    if (!faviconCache.has(cacheKey)) {
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
      faviconCache.set(cacheKey, faviconUrl);
    }
  });
}

/**
 * 获取缓存统计信息
 */
export function getFaviconCacheStats(): {
  size: number;
  maxSize: number;
  hitRate: number;
} {
  return {
    size: faviconCache.size,
    maxSize: MAX_CACHE_SIZE,
    hitRate: 0, // TODO: 添加命中率追踪
  };
}

/**
 * 清空 favicon 缓存
 */
export function clearFaviconCache(): void {
  faviconCache.clear();
  console.log('[faviconUtils] Favicon cache cleared');
}
