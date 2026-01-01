/**
 * 内存优化工具
 * 用于大量书签时的内存管理
 */

const MAX_BOOKMARKS_TO_LOAD = 5000; // 最多加载5000个书签到内存
const BATCH_SIZE = 1000; // 每次加载1000个

export interface LoadBookmarksOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'date' | 'title' | 'importance';
}

/**
 * 优化书签加载 - 只加载必要的部分
 * 当书签数量超过阈值时，应用过滤和限制
 */
export function optimizeBookmarksForMemory(
  bookmarks: any[],
  options: LoadBookmarksOptions = {}
): any[] {
  const {
    limit = MAX_BOOKMARKS_TO_LOAD,
    sortBy = 'importance'
  } = options;

  // 如果书签数量少于限制，直接返回
  if (bookmarks.length <= limit) {
    return bookmarks;
  }

  console.warn(
    `[MemoryOptimization] Found ${bookmarks.length} bookmarks, limiting to ${limit}`
  );

  // 根据排序方式处理
  let sortedBookmarks = [...bookmarks];

  switch (sortBy) {
    case 'importance':
      // 按 importance 降序排序
      sortedBookmarks.sort((a, b) => {
        const aImportance = a.analytics?.importance || 50;
        const bImportance = b.analytics?.importance || 50;
        return bImportance - aImportance;
      });
      break;
    case 'date':
      // 按创建时间降序排序
      sortedBookmarks.sort((a, b) => b.createTime - a.createTime);
      break;
    case 'title':
      // 按标题升序排序
      sortedBookmarks.sort((a, b) => a.title.localeCompare(b.title));
      break;
  }

  // 只返回前 limit 个
  return sortedBookmarks.slice(0, limit);
}

/**
 * 检查是否需要分页加载
 */
export function needsPagination(bookmarkCount: number): boolean {
  return bookmarkCount > MAX_BOOKMARKS_TO_LOAD;
}

/**
 * 获取分页信息
 */
export function getPaginationInfo(bookmarkCount: number): {
  totalPages: number;
  currentPage: number;
  pageSize: number;
  hasMore: boolean;
} {
  const totalPages = Math.ceil(bookmarkCount / BATCH_SIZE);
  const currentPage = 1;
  const pageSize = BATCH_SIZE;
  const hasMore = bookmarkCount > BATCH_SIZE;

  return { totalPages, currentPage, pageSize, hasMore };
}

/**
 * 批量处理书签 - 避免一次性处理过多数据
 */
export async function processBookmarksInBatches<T>(
  bookmarks: any[],
  processor: (batch: any[]) => Promise<T>,
  batchSize: number = BATCH_SIZE
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize);
    const result = await processor(batch);
    results.push(result);

    // 每批之间短暂延迟，避免阻塞主线程
    if (i + batchSize < bookmarks.length) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return results;
}

/**
 * 估算内存使用（粗略估算）
 */
export function estimateMemoryUsage(bookmarks: any[]): number {
  // 假设每个书签对象大约占用 2KB
  const BOOKMARK_SIZE_BYTES = 2048;
  return bookmarks.length * BOOKMARK_SIZE_BYTES;
}

/**
 * 格式化内存大小
 */
export function formatMemorySize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 检查内存使用是否过高
 */
export function isMemoryUsageHigh(bookmarkCount: number): boolean {
  // 如果书签超过 10000 个，视为内存使用过高
  return bookmarkCount > 10000;
}
