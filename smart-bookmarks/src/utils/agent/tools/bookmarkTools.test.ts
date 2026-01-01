/**
 * 书签工具测试
 * 包含单元测试和属性测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  searchBookmarksTool,
  addBookmarkTool,
  deleteBookmarkTool,
  starBookmarkTool,
  restoreBookmarkTool,
} from './bookmarkTools';
import type { IBookmark } from '../../../types/bookmark';

// Mock useBookmarkStore
const mockBookmarks: IBookmark[] = [];
const mockStore = {
  bookmarks: mockBookmarks,
  addBookmark: vi.fn(),
  updateBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  restoreBookmark: vi.fn(),
};

vi.mock('../../../sidebar/store/bookmarkStore', () => ({
  useBookmarkStore: {
    getState: () => mockStore,
  },
}));

// Mock chrome.tabs
vi.stubGlobal('chrome', {
  tabs: {
    create: vi.fn(),
  },
});

// 创建测试书签的辅助函数
const createTestBookmark = (overrides: Partial<IBookmark> = {}): IBookmark => ({
  id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  url: 'https://example.com',
  title: 'Test Bookmark',
  folderId: 'folder-/',
  folderPath: '/',
  userTags: [],
  aiTags: [],
  starred: false,
  pinned: false,
  createTime: Date.now(),
  updateTime: Date.now(),
  status: 'active',
  analytics: {
    visitCount: 0,
    importance: 50,
  },
  ...overrides,
});

describe('Bookmark Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.bookmarks = [];
  });

  describe('search_bookmarks', () => {
    it('应该能搜索标题', async () => {
      mockStore.bookmarks = [
        createTestBookmark({ title: 'React Tutorial' }),
        createTestBookmark({ title: 'Vue Guide' }),
      ];

      const result = await searchBookmarksTool.execute({ query: 'React' });

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.results[0].title).toBe('React Tutorial');
    });

    it('应该能搜索 URL', async () => {
      mockStore.bookmarks = [
        createTestBookmark({ url: 'https://reactjs.org' }),
        createTestBookmark({ url: 'https://vuejs.org' }),
      ];

      const result = await searchBookmarksTool.execute({ query: 'reactjs' });

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
    });

    it('应该能搜索 AI 标签', async () => {
      mockStore.bookmarks = [
        createTestBookmark({ aiTags: ['javascript', 'frontend'] }),
        createTestBookmark({ aiTags: ['python', 'backend'] }),
      ];

      const result = await searchBookmarksTool.execute({ query: 'javascript' });

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
    });

    it('应该能搜索用户标签', async () => {
      mockStore.bookmarks = [
        createTestBookmark({ userTags: ['learning', 'important'] }),
        createTestBookmark({ userTags: ['work'] }),
      ];

      const result = await searchBookmarksTool.execute({ query: 'learning' });

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
    });

    it('应该能搜索 AI 摘要', async () => {
      mockStore.bookmarks = [
        createTestBookmark({ aiSummary: 'A comprehensive guide to machine learning' }),
        createTestBookmark({ aiSummary: 'Web development basics' }),
      ];

      const result = await searchBookmarksTool.execute({ query: 'machine learning' });

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
    });

    it('应该能搜索 AI 分类', async () => {
      mockStore.bookmarks = [
        createTestBookmark({ aiCategory: 'Technology' }),
        createTestBookmark({ aiCategory: 'Entertainment' }),
      ];

      const result = await searchBookmarksTool.execute({ query: 'Technology' });

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
    });

    it('应该排除已删除的书签', async () => {
      mockStore.bookmarks = [
        createTestBookmark({ title: 'Active Bookmark', status: 'active' }),
        createTestBookmark({ title: 'Deleted Bookmark', status: 'deleted' }),
      ];

      const result = await searchBookmarksTool.execute({ query: 'Bookmark' });

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.results[0].title).toBe('Active Bookmark');
    });

    it('应该支持过滤器', async () => {
      mockStore.bookmarks = [
        createTestBookmark({ title: 'Starred React', starred: true }),
        createTestBookmark({ title: 'Normal React', starred: false }),
      ];

      const result = await searchBookmarksTool.execute({
        query: 'React',
        filters: { starred: true },
      });

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.results[0].title).toBe('Starred React');
    });
  });

  /**
   * Property 4: Search Field Coverage
   * Feature: agent-enhancement, Property 4: Search Field Coverage
   * Validates: Requirements 3.1
   * 
   * 对于任何搜索查询，search_bookmarks 工具应该搜索 title, URL, tags, summary, category 字段
   */
  describe('Property 4: Search Field Coverage', () => {
    // 可搜索的字段
    const searchableFields = [
      { field: 'title', value: 'UniqueTitle123' },
      { field: 'url', value: 'uniqueurl456.com' },
      { field: 'aiTags', value: 'uniquetag789' },
      { field: 'userTags', value: 'usertag101' },
      { field: 'aiSummary', value: 'uniquesummary202' },
      { field: 'aiCategory', value: 'UniqueCategory303' },
    ];

    it('对于任何可搜索字段中的唯一值，搜索应该能找到对应书签', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...searchableFields),
          async ({ field, value }) => {
            // 创建一个在指定字段包含唯一值的书签
            const bookmark = createTestBookmark({
              id: `test-${field}`,
              [field]: field.includes('Tags') ? [value] : value,
            });

            mockStore.bookmarks = [bookmark];

            const result = await searchBookmarksTool.execute({ query: value });

            // 验证能找到书签
            return result.success && result.data.count === 1;
          }
        ),
        { numRuns: 6 } // 每个字段测试一次
      );
    });

    it('搜索应该是大小写不敏感的', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          async (searchTerm) => {
            const bookmark = createTestBookmark({
              title: searchTerm.toLowerCase(),
            });

            mockStore.bookmarks = [bookmark];

            // 使用大写搜索
            const result = await searchBookmarksTool.execute({
              query: searchTerm.toUpperCase(),
            });

            return result.success && result.data.count === 1;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('delete_bookmark', () => {
    it('应该软删除书签', async () => {
      const bookmark = createTestBookmark({ id: 'test-id' });
      mockStore.bookmarks = [bookmark];

      const result = await deleteBookmarkTool.execute({ bookmarkId: 'test-id' });

      expect(result.success).toBe(true);
      expect(mockStore.deleteBookmark).toHaveBeenCalledWith('test-id');
    });

    it('应该对不存在的书签返回错误', async () => {
      mockStore.bookmarks = [];

      const result = await deleteBookmarkTool.execute({ bookmarkId: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  /**
   * Property 6: Soft Delete Behavior
   * Feature: agent-enhancement, Property 6: Soft Delete Behavior
   * Validates: Requirements 5.2
   * 
   * 对于任何删除操作，书签应该被移动到回收站（isDeleted=true）而不是永久删除
   */
  describe('Property 6: Soft Delete Behavior', () => {
    it('删除操作应该调用 deleteBookmark 而不是 permanentlyDeleteBookmark', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (bookmarkId) => {
            const bookmark = createTestBookmark({ id: bookmarkId });
            mockStore.bookmarks = [bookmark];
            mockStore.deleteBookmark.mockClear();

            await deleteBookmarkTool.execute({ bookmarkId });

            // 验证调用的是软删除方法
            return mockStore.deleteBookmark.mock.calls.length === 1 &&
                   mockStore.deleteBookmark.mock.calls[0][0] === bookmarkId;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('star_bookmark', () => {
    it('应该切换星标状态', async () => {
      const bookmark = createTestBookmark({ id: 'test-id', starred: false });
      mockStore.bookmarks = [bookmark];

      const result = await starBookmarkTool.execute({ bookmarkId: 'test-id' });

      expect(result.success).toBe(true);
      expect(result.data.starred).toBe(true);
      expect(mockStore.updateBookmark).toHaveBeenCalledWith('test-id', expect.objectContaining({
        starred: true,
      }));
    });
  });

  /**
   * Property 7: Star Toggle Idempotence
   * Feature: agent-enhancement, Property 7: Star Toggle Idempotence
   * Validates: Requirements 5.4
   * 
   * 对于任何书签，调用 star_bookmark 两次应该返回到原始星标状态
   */
  describe('Property 7: Star Toggle Idempotence', () => {
    it('切换星标两次应该返回原始状态', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (initialStarred) => {
            const bookmarkId = 'test-toggle';
            let currentStarred = initialStarred;

            // 模拟 updateBookmark 更新状态
            mockStore.updateBookmark.mockImplementation((_id, updates) => {
              if (updates.starred !== undefined) {
                currentStarred = updates.starred;
              }
            });

            // 创建书签
            mockStore.bookmarks = [createTestBookmark({
              id: bookmarkId,
              starred: initialStarred,
            })];

            // 第一次切换
            await starBookmarkTool.execute({ bookmarkId });
            // 更新 mock 书签状态
            mockStore.bookmarks[0].starred = currentStarred;

            // 第二次切换
            await starBookmarkTool.execute({ bookmarkId });

            // 验证回到原始状态
            return currentStarred === initialStarred;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('restore_bookmark', () => {
    it('应该恢复已删除的书签', async () => {
      const bookmark = createTestBookmark({ id: 'test-id', status: 'deleted' });
      mockStore.bookmarks = [bookmark];

      const result = await restoreBookmarkTool.execute({ bookmarkId: 'test-id' });

      expect(result.success).toBe(true);
      expect(mockStore.restoreBookmark).toHaveBeenCalledWith('test-id');
    });

    it('应该对未删除的书签返回错误', async () => {
      const bookmark = createTestBookmark({ id: 'test-id', status: 'active' });
      mockStore.bookmarks = [bookmark];

      const result = await restoreBookmarkTool.execute({ bookmarkId: 'test-id' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('不在回收站');
    });
  });
});
