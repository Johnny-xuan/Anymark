/**
 * 整理工具测试
 * 测试 organize_bookmarks, collect_bookmarks, suggest_categories 工具
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  organizeBookmarksTool,
  collectBookmarksTool,
  suggestCategoriesTool,
  organizeTools,
} from './organizeTools';
import type { IBookmark, IFolder } from '../../../types/bookmark';

// Mock bookmarkStore
const mockBookmarks: IBookmark[] = [];
const mockFolders: IFolder[] = [];

vi.mock('../../../sidebar/store/bookmarkStore', () => ({
  useBookmarkStore: {
    getState: () => ({
      bookmarks: mockBookmarks,
      folders: mockFolders,
      addFolder: vi.fn((folder: IFolder) => {
        mockFolders.push(folder);
      }),
      moveBookmarkToFolder: vi.fn((bookmarkId: string, folderId: string) => {
        const bookmark = mockBookmarks.find(b => b.id === bookmarkId);
        if (bookmark) {
          bookmark.folderId = folderId;
          bookmark.folderPath = folderId.replace(/^folder-/, '');
        }
      }),
    }),
  },
}));

// Helper to create test bookmarks
function createTestBookmark(overrides: Partial<IBookmark> = {}): IBookmark {
  const id = `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Test Bookmark ${id}`,
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
  };
}

describe('Organize Tools', () => {
  beforeEach(() => {
    // Reset mock data
    mockBookmarks.length = 0;
    mockFolders.length = 0;
  });

  describe('organizeBookmarksTool', () => {
    it('should be properly defined', () => {
      expect(organizeBookmarksTool.name).toBe('organize_bookmarks');
      expect(organizeBookmarksTool.description).toBeTruthy();
      expect(organizeBookmarksTool.parameters).toBeDefined();
    });

    it('should return error when no bookmarks exist', async () => {
      const result = await organizeBookmarksTool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('没有可整理的书签');
    });

    it('should organize bookmarks by AI category', async () => {
      // Add bookmarks with AI categories
      for (let i = 0; i < 5; i++) {
        mockBookmarks.push(createTestBookmark({
          aiCategory: 'Frontend',
          title: `Frontend Article ${i}`,
        }));
      }
      for (let i = 0; i < 4; i++) {
        mockBookmarks.push(createTestBookmark({
          aiCategory: 'Backend',
          title: `Backend Article ${i}`,
        }));
      }

      const result = await organizeBookmarksTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.createdFolders).toBeGreaterThanOrEqual(0);
      expect(result.data.categories).toBeDefined();
    });

    it('should respect minBookmarksPerCategory parameter', async () => {
      // Add 2 bookmarks per category (below default threshold of 3)
      mockBookmarks.push(createTestBookmark({ aiCategory: 'SmallCategory1' }));
      mockBookmarks.push(createTestBookmark({ aiCategory: 'SmallCategory1' }));
      mockBookmarks.push(createTestBookmark({ aiCategory: 'SmallCategory2' }));
      mockBookmarks.push(createTestBookmark({ aiCategory: 'SmallCategory2' }));

      const result = await organizeBookmarksTool.execute({ minBookmarksPerCategory: 3 });

      expect(result.success).toBe(true);
      expect(result.data.organizedBookmarks).toBe(0);
    });

    it('should skip deleted bookmarks', async () => {
      mockBookmarks.push(createTestBookmark({
        aiCategory: 'TestCategory',
        status: 'deleted',
      }));
      mockBookmarks.push(createTestBookmark({
        aiCategory: 'TestCategory',
        status: 'deleted',
      }));
      mockBookmarks.push(createTestBookmark({
        aiCategory: 'TestCategory',
        status: 'deleted',
      }));

      const result = await organizeBookmarksTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('没有可整理的书签');
    });
  });

  describe('collectBookmarksTool', () => {
    it('should be properly defined', () => {
      expect(collectBookmarksTool.name).toBe('collect_bookmarks');
      expect(collectBookmarksTool.description).toBeTruthy();
      expect(collectBookmarksTool.parameters).toBeDefined();
      expect(collectBookmarksTool.parameters.required).toContain('keywords');
    });

    it('should return error when no keywords provided', async () => {
      const result = await collectBookmarksTool.execute({ keywords: [] });
      expect(result.success).toBe(false);
      expect(result.error).toContain('关键词');
    });

    it('should collect bookmarks matching keywords', async () => {
      mockBookmarks.push(createTestBookmark({
        title: 'React Tutorial',
        aiTags: ['react', 'frontend'],
      }));
      mockBookmarks.push(createTestBookmark({
        title: 'Vue Guide',
        aiTags: ['vue', 'frontend'],
      }));
      mockBookmarks.push(createTestBookmark({
        title: 'Python Basics',
        aiTags: ['python', 'backend'],
      }));

      const result = await collectBookmarksTool.execute({
        keywords: ['frontend'],
        folderName: 'Frontend Resources',
      });

      expect(result.success).toBe(true);
      expect(result.data.matchedCount).toBe(2);
      expect(result.data.folderName).toBe('Frontend Resources');
    });

    it('should support "all" match mode', async () => {
      mockBookmarks.push(createTestBookmark({
        title: 'React TypeScript Tutorial',
        aiTags: ['react', 'typescript'],
      }));
      mockBookmarks.push(createTestBookmark({
        title: 'React JavaScript Guide',
        aiTags: ['react', 'javascript'],
      }));

      const result = await collectBookmarksTool.execute({
        keywords: ['react', 'typescript'],
        matchMode: 'all',
      });

      expect(result.success).toBe(true);
      expect(result.data.matchedCount).toBe(1);
    });

    it('should auto-generate folder name when not provided', async () => {
      mockBookmarks.push(createTestBookmark({
        title: 'Machine Learning Course',
        aiCategory: 'AI/ML',
      }));
      mockBookmarks.push(createTestBookmark({
        title: 'Deep Learning Tutorial',
        aiCategory: 'AI/ML',
      }));

      const result = await collectBookmarksTool.execute({
        keywords: ['learning'],
      });

      expect(result.success).toBe(true);
      expect(result.data.folderName).toBeTruthy();
    });

    it('should return success with 0 count when no matches found', async () => {
      mockBookmarks.push(createTestBookmark({
        title: 'Unrelated Content',
      }));

      const result = await collectBookmarksTool.execute({
        keywords: ['nonexistent'],
      });

      expect(result.success).toBe(true);
      expect(result.data.collectedCount).toBe(0);
    });
  });

  describe('suggestCategoriesTool', () => {
    it('should be properly defined', () => {
      expect(suggestCategoriesTool.name).toBe('suggest_categories');
      expect(suggestCategoriesTool.description).toBeTruthy();
      expect(suggestCategoriesTool.parameters).toBeDefined();
    });

    it('should return error when no bookmarks to analyze', async () => {
      const result = await suggestCategoriesTool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('没有可分析的书签');
    });

    it('should suggest categories based on AI categories', async () => {
      for (let i = 0; i < 5; i++) {
        mockBookmarks.push(createTestBookmark({
          aiCategory: 'Development',
          title: `Dev Article ${i}`,
        }));
      }
      for (let i = 0; i < 3; i++) {
        mockBookmarks.push(createTestBookmark({
          aiCategory: 'Design',
          title: `Design Article ${i}`,
        }));
      }

      const result = await suggestCategoriesTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data.suggestions.length).toBeGreaterThan(0);
      expect(result.data.suggestions[0].category).toBe('Development');
    });

    it('should suggest categories based on tags', async () => {
      for (let i = 0; i < 4; i++) {
        mockBookmarks.push(createTestBookmark({
          aiTags: ['javascript', 'web'],
          title: `JS Article ${i}`,
        }));
      }

      const result = await suggestCategoriesTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data.suggestions.some(s => s.category === 'javascript')).toBe(true);
    });

    it('should analyze only specified bookmarks when bookmarkIds provided', async () => {
      const targetBookmark = createTestBookmark({
        aiCategory: 'TargetCategory',
        title: 'Target Bookmark',
      });
      mockBookmarks.push(targetBookmark);
      mockBookmarks.push(createTestBookmark({
        aiCategory: 'OtherCategory',
        title: 'Other Bookmark',
      }));

      const result = await suggestCategoriesTool.execute({
        bookmarkIds: [targetBookmark.id],
      });

      expect(result.success).toBe(true);
      expect(result.data.totalAnalyzed).toBe(1);
    });

    it('should respect maxSuggestions parameter', async () => {
      // Create many categories
      for (let i = 0; i < 20; i++) {
        for (let j = 0; j < 3; j++) {
          mockBookmarks.push(createTestBookmark({
            aiCategory: `Category${i}`,
          }));
        }
      }

      const result = await suggestCategoriesTool.execute({
        maxSuggestions: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data.suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('organizeTools array', () => {
    it('should export all organize tools', () => {
      expect(organizeTools).toHaveLength(3);
      expect(organizeTools.map(t => t.name)).toContain('organize_bookmarks');
      expect(organizeTools.map(t => t.name)).toContain('collect_bookmarks');
      expect(organizeTools.map(t => t.name)).toContain('suggest_categories');
    });
  });
});

// Property-based tests
describe('Organize Tools - Property Tests', () => {
  beforeEach(() => {
    mockBookmarks.length = 0;
    mockFolders.length = 0;
  });

  /**
   * Property: Organize operation should be idempotent
   * Running organize twice should not change the result
   */
  it('Property: organize_bookmarks should be idempotent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            category: fc.constantFrom('Frontend', 'Backend', 'DevOps', 'Design'),
          }),
          { minLength: 10, maxLength: 20 }
        ),
        async (bookmarkConfigs) => {
          // Reset
          mockBookmarks.length = 0;
          mockFolders.length = 0;

          // Create bookmarks
          bookmarkConfigs.forEach(config => {
            mockBookmarks.push(createTestBookmark({
              aiCategory: config.category,
            }));
          });

          // First organize
          const result1 = await organizeBookmarksTool.execute({});

          // Record state after first organize
          const foldersAfterFirst = mockFolders.length;
          const bookmarkStatesAfterFirst = mockBookmarks.map(b => ({
            id: b.id,
            folderId: b.folderId,
          }));

          // Second organize
          const result2 = await organizeBookmarksTool.execute({});

          // Should not create more folders
          expect(mockFolders.length).toBe(foldersAfterFirst);

          // Bookmark states should be the same
          mockBookmarks.forEach((b, i) => {
            expect(b.folderId).toBe(bookmarkStatesAfterFirst[i].folderId);
          });

          // Second organize should move 0 bookmarks (already organized)
          expect(result2.data?.organizedBookmarks || 0).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Collect should only affect matching bookmarks
   * Non-matching bookmarks should remain unchanged
   */
  it('Property: collect_bookmarks should only affect matching bookmarks', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use specific keywords that won't match our non-matching bookmark
        fc.array(
          fc.constantFrom('react', 'vue', 'angular', 'typescript', 'javascript', 'python', 'rust'),
          { minLength: 1, maxLength: 3 }
        ),
        async (keywords) => {
          // Reset
          mockBookmarks.length = 0;
          mockFolders.length = 0;

          // Create matching and non-matching bookmarks
          const matchingBookmark = createTestBookmark({
            title: `Article about ${keywords[0]} framework`,
            aiTags: keywords,
          });
          // Use content that definitely won't match any of our keywords
          const nonMatchingBookmark = createTestBookmark({
            title: 'Cooking recipes for dinner',
            aiTags: ['cooking', 'food', 'recipes'],
            aiCategory: 'Lifestyle',
          });

          mockBookmarks.push(matchingBookmark);
          mockBookmarks.push(nonMatchingBookmark);

          const originalNonMatchingFolder = nonMatchingBookmark.folderId;

          await collectBookmarksTool.execute({ keywords });

          // Non-matching bookmark should not be moved
          expect(nonMatchingBookmark.folderId).toBe(originalNonMatchingFolder);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Suggestions should have valid confidence scores
   * All confidence scores should be between 0 and 1
   */
  it('Property: suggest_categories confidence scores should be valid', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            category: fc.string({ minLength: 1, maxLength: 20 }),
            tagCount: fc.integer({ min: 0, max: 5 }),
          }),
          { minLength: 5, maxLength: 30 }
        ),
        async (bookmarkConfigs) => {
          // Reset
          mockBookmarks.length = 0;
          mockFolders.length = 0;

          // Create bookmarks
          bookmarkConfigs.forEach(config => {
            const tags = Array.from({ length: config.tagCount }, (_, i) => `tag${i}`);
            mockBookmarks.push(createTestBookmark({
              aiCategory: config.category,
              aiTags: tags,
            }));
          });

          const result = await suggestCategoriesTool.execute({});

          if (result.success && result.data?.suggestions) {
            result.data.suggestions.forEach(suggestion => {
              expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
              expect(suggestion.confidence).toBeLessThanOrEqual(1);
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Deleted bookmarks should never be included in operations
   */
  it('Property: deleted bookmarks should be excluded from all operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (deletedCount) => {
          // Reset
          mockBookmarks.length = 0;
          mockFolders.length = 0;

          // Create deleted bookmarks
          for (let i = 0; i < deletedCount; i++) {
            mockBookmarks.push(createTestBookmark({
              status: 'deleted',
              aiCategory: 'ShouldNotAppear',
              aiTags: ['deleted-tag'],
            }));
          }

          // Test organize
          const organizeResult = await organizeBookmarksTool.execute({});
          expect(organizeResult.success).toBe(false);

          // Test collect
          const collectResult = await collectBookmarksTool.execute({
            keywords: ['deleted-tag'],
          });
          expect(collectResult.data?.matchedCount || 0).toBe(0);

          // Test suggest
          const suggestResult = await suggestCategoriesTool.execute({});
          expect(suggestResult.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });
});
