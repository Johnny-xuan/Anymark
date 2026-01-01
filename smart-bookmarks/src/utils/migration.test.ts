/**
 * 数据迁移属性测试
 * 
 * Property 1: 数据迁移完整性
 * Feature: unified-chrome-bookmarks, Property 1: 数据迁移完整性
 * Validates: Requirements 1.8, 9.1-9.5
 * 
 * 验证 aiFolderPath 正确迁移到 folderPath，且废弃字段被清理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { _internal } from './migration';

const { extractFolderPaths, migrateBookmark } = _internal;

// 创建测试书签的辅助函数（带有旧的 AI 分类字段）
interface LegacyBookmark {
  id: string;
  url: string;
  title: string;
  folderId: string;
  folderPath: string;
  aiFolderPath?: string;
  aiFolderId?: string;
  aiCategory?: string;
  aiSubcategory?: string;
  userTags: string[];
  aiTags: string[];
  starred: boolean;
  pinned: boolean;
  createTime: number;
  updateTime: number;
  status: 'active' | 'archived' | 'deleted';
  analytics: {
    visitCount: number;
    importance: number;
  };
}

const createLegacyBookmark = (overrides: Partial<LegacyBookmark> = {}): LegacyBookmark => ({
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

// 生成有效的文件夹路径（以 / 开头，不以 / 结尾，只包含字母数字和中文）
const validFolderPathArb = fc.array(
  fc.stringMatching(/^[a-zA-Z0-9\u4e00-\u9fa5]+$/u, { minLength: 1, maxLength: 20 }),
  { minLength: 1, maxLength: 4 }
).map(parts => '/' + parts.join('/'));

describe('Migration Properties', () => {
  describe('extractFolderPaths', () => {
    it('应该提取所有层级的文件夹路径', () => {
      const paths = extractFolderPaths('/Frontend/React/Hooks');
      expect(paths).toEqual(['/Frontend', '/Frontend/React', '/Frontend/React/Hooks']);
    });

    it('应该处理单层路径', () => {
      const paths = extractFolderPaths('/Technology');
      expect(paths).toEqual(['/Technology']);
    });

    it('应该处理空路径', () => {
      const paths = extractFolderPaths('/');
      expect(paths).toEqual([]);
    });
  });

  /**
   * Property 1: 数据迁移完整性
   * Feature: unified-chrome-bookmarks, Property 1: 数据迁移完整性
   * Validates: Requirements 1.8, 9.1-9.5
   * 
   * 对于任何有 aiFolderPath 值的书签，迁移后：
   * 1. folderPath 应该等于原始 aiFolderPath 值
   * 2. folderId 应该等于 `folder-${aiFolderPath}`
   * 3. aiFolderPath 应该为 undefined
   * 4. aiFolderId 应该为 undefined
   * 5. aiCategory 应该为 undefined
   * 6. aiSubcategory 应该为 undefined
   */
  describe('Property 1: 数据迁移完整性', () => {
    it('对于任何有效的 aiFolderPath，迁移后 folderPath 应该等于原始 aiFolderPath', () => {
      fc.assert(
        fc.property(
          validFolderPathArb,
          (aiFolderPath) => {
            const bookmark = createLegacyBookmark({
              aiFolderPath,
              aiFolderId: `ai-folder-${aiFolderPath}`,
              aiCategory: 'Technology',
              aiSubcategory: 'Frontend',
              folderPath: '/', // 根目录，需要迁移
            });

            const migrated = migrateBookmark(bookmark);

            // 验证 folderPath 等于原始 aiFolderPath
            return migrated.folderPath === aiFolderPath;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何有效的 aiFolderPath，迁移后 folderId 应该正确设置', () => {
      fc.assert(
        fc.property(
          validFolderPathArb,
          (aiFolderPath) => {
            const bookmark = createLegacyBookmark({
              aiFolderPath,
              folderPath: '/',
            });

            const migrated = migrateBookmark(bookmark);

            // 验证 folderId 格式正确
            return migrated.folderId === `folder-${aiFolderPath}`;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何迁移的书签，aiFolderPath 应该为 undefined', () => {
      fc.assert(
        fc.property(
          validFolderPathArb,
          (aiFolderPath) => {
            const bookmark = createLegacyBookmark({
              aiFolderPath,
              folderPath: '/',
            });

            const migrated = migrateBookmark(bookmark);

            // 验证 aiFolderPath 被清理
            return migrated.aiFolderPath === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何迁移的书签，所有废弃的 AI 分类字段应该为 undefined', () => {
      fc.assert(
        fc.property(
          validFolderPathArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (aiFolderPath, aiFolderId, aiCategory, aiSubcategory) => {
            const bookmark = createLegacyBookmark({
              aiFolderPath,
              aiFolderId,
              aiCategory,
              aiSubcategory,
              folderPath: '/',
            });

            const migrated = migrateBookmark(bookmark);

            // 验证所有废弃字段被清理
            return (
              migrated.aiFolderPath === undefined &&
              migrated.aiFolderId === undefined &&
              migrated.aiCategory === undefined &&
              migrated.aiSubcategory === undefined
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('迁移应该保留其他书签属性不变', () => {
      fc.assert(
        fc.property(
          validFolderPathArb,
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.webUrl(),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
          fc.boolean(),
          (aiFolderPath, title, url, userTags, starred) => {
            const bookmark = createLegacyBookmark({
              aiFolderPath,
              folderPath: '/',
              title,
              url,
              userTags,
              starred,
            });

            const migrated = migrateBookmark(bookmark);

            // 验证其他属性保持不变
            return (
              migrated.title === title &&
              migrated.url === url &&
              JSON.stringify(migrated.userTags) === JSON.stringify(userTags) &&
              migrated.starred === starred
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('如果 folderPath 已有有效值（非根目录），不应该迁移', () => {
      fc.assert(
        fc.property(
          validFolderPathArb,
          validFolderPathArb,
          (aiFolderPath, existingFolderPath) => {
            const bookmark = createLegacyBookmark({
              aiFolderPath,
              folderPath: existingFolderPath, // 已有有效路径
            });

            const migrated = migrateBookmark(bookmark);

            // 验证 folderPath 保持不变（不被 aiFolderPath 覆盖）
            return migrated.folderPath === existingFolderPath;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('如果 aiFolderPath 为空或根目录，不应该迁移', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('/', '', '  ', undefined),
          (aiFolderPath) => {
            const bookmark = createLegacyBookmark({
              aiFolderPath: aiFolderPath as string | undefined,
              folderPath: '/',
            });

            const migrated = migrateBookmark(bookmark);

            // 验证 folderPath 保持为根目录
            return migrated.folderPath === '/';
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('extractFolderPaths Property Tests', () => {
    it('对于任何有效路径，提取的路径数量应该等于路径深度', () => {
      fc.assert(
        fc.property(
          validFolderPathArb,
          (folderPath) => {
            const paths = extractFolderPaths(folderPath);
            const depth = folderPath.split('/').filter(Boolean).length;
            
            return paths.length === depth;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何有效路径，最后一个提取的路径应该等于原始路径', () => {
      fc.assert(
        fc.property(
          validFolderPathArb,
          (folderPath) => {
            const paths = extractFolderPaths(folderPath);
            
            if (paths.length === 0) {
              // 空路径情况
              return folderPath === '/' || folderPath === '';
            }
            
            return paths[paths.length - 1] === folderPath;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何有效路径，提取的路径应该按层级递增排序', () => {
      fc.assert(
        fc.property(
          validFolderPathArb,
          (folderPath) => {
            const paths = extractFolderPaths(folderPath);
            
            // 验证每个路径都是下一个路径的前缀
            for (let i = 0; i < paths.length - 1; i++) {
              if (!paths[i + 1].startsWith(paths[i] + '/')) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
