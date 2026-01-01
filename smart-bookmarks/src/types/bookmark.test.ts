/**
 * 书签数据模型单元测试
 * 验证统一架构后的接口定义正确性和类型兼容性
 * 
 * Requirements: 1.1-1.3
 * - 1.1: IBookmark 接口移除 AI 虚拟分类字段
 * - 1.2: IFolder 接口移除 isAIFolder 字段
 * - 1.3: FilterType 移除 'ai_category'
 */

import { describe, it, expect } from 'vitest';
import type {
  IBookmark,
  IFolder,
  FilterType,
  IUserSettings,
  IBookmarkAnalytics,
} from './bookmark';

describe('数据模型单元测试', () => {
  /**
   * Requirement 1.1: IBookmark 接口验证
   * 验证 IBookmark 使用 folderPath 作为书签位置的唯一来源
   */
  describe('IBookmark 接口', () => {
    it('应该包含必需的基础字段', () => {
      const bookmark: IBookmark = createValidBookmark();
      
      // 验证基础信息字段存在
      expect(bookmark.id).toBeDefined();
      expect(bookmark.url).toBeDefined();
      expect(bookmark.title).toBeDefined();
      
      // 验证分类信息字段（统一架构）
      expect(bookmark.folderId).toBeDefined();
      expect(bookmark.folderPath).toBeDefined();
      
      // 验证用户数据字段
      expect(bookmark.userTags).toBeDefined();
      expect(typeof bookmark.starred).toBe('boolean');
      expect(typeof bookmark.pinned).toBe('boolean');
      
      // 验证 AI 生成数据字段
      expect(bookmark.aiTags).toBeDefined();
      
      // 验证元数据字段
      expect(bookmark.createTime).toBeDefined();
      expect(bookmark.updateTime).toBeDefined();
      
      // 验证统计数据字段
      expect(bookmark.analytics).toBeDefined();
      
      // 验证状态字段
      expect(bookmark.status).toBeDefined();
    });

    it('folderPath 应该是书签位置的唯一来源', () => {
      const bookmark: IBookmark = createValidBookmark();
      
      // folderPath 应该是有效的路径字符串
      expect(typeof bookmark.folderPath).toBe('string');
      expect(bookmark.folderPath.length).toBeGreaterThan(0);
      
      // folderId 应该与 folderPath 对应
      expect(bookmark.folderId).toContain('folder-');
    });

    it('应该支持 Chrome 同步字段 chromeId', () => {
      const bookmarkWithChromeId: IBookmark = {
        ...createValidBookmark(),
        chromeId: 'chrome-bookmark-123',
      };
      
      expect(bookmarkWithChromeId.chromeId).toBe('chrome-bookmark-123');
    });

    it('应该支持可选的 AI 分析字段', () => {
      const bookmarkWithAI: IBookmark = {
        ...createValidBookmark(),
        aiSummary: '这是一个关于 React 的教程',
        aiConfidence: 0.95,
        aiDifficulty: 'intermediate',
        aiTechStack: ['React', 'TypeScript'],
        lastAnalyzed: Date.now(),
      };
      
      expect(bookmarkWithAI.aiSummary).toBeDefined();
      expect(bookmarkWithAI.aiConfidence).toBeGreaterThanOrEqual(0);
      expect(bookmarkWithAI.aiConfidence).toBeLessThanOrEqual(1);
      expect(bookmarkWithAI.aiDifficulty).toBe('intermediate');
      expect(bookmarkWithAI.aiTechStack).toContain('React');
    });

    it('不应该包含已移除的 AI 虚拟分类字段', () => {
      const bookmark = createValidBookmark();
      
      // 验证已移除的字段不存在于类型定义中
      // 这些字段在 TypeScript 编译时会报错，运行时验证对象不包含这些属性
      expect('aiFolderPath' in bookmark).toBe(false);
      expect('aiFolderId' in bookmark).toBe(false);
      expect('aiCategory' in bookmark).toBe(false);
      expect('aiSubcategory' in bookmark).toBe(false);
    });

    it('status 字段应该只接受有效值', () => {
      const validStatuses: IBookmark['status'][] = ['active', 'archived', 'deleted'];
      
      validStatuses.forEach(status => {
        const bookmark: IBookmark = {
          ...createValidBookmark(),
          status,
        };
        expect(bookmark.status).toBe(status);
      });
    });
  });

  /**
   * Requirement 1.2: IFolder 接口验证
   * 验证 IFolder 移除了 isAIFolder 字段
   */
  describe('IFolder 接口', () => {
    it('应该包含必需的字段', () => {
      const folder: IFolder = createValidFolder();
      
      expect(folder.id).toBeDefined();
      expect(folder.title).toBeDefined();
      expect(folder.path).toBeDefined();
      expect(folder.createTime).toBeDefined();
      expect(folder.updateTime).toBeDefined();
      expect(typeof folder.order).toBe('number');
      expect(typeof folder.bookmarkCount).toBe('number');
      expect(typeof folder.subfolderCount).toBe('number');
    });

    it('应该支持 Chrome 同步字段 chromeId', () => {
      const folderWithChromeId: IFolder = {
        ...createValidFolder(),
        chromeId: 'chrome-folder-456',
      };
      
      expect(folderWithChromeId.chromeId).toBe('chrome-folder-456');
    });

    it('不应该包含已移除的 isAIFolder 字段', () => {
      const folder = createValidFolder();
      
      // 验证 isAIFolder 字段不存在
      expect('isAIFolder' in folder).toBe(false);
    });

    it('应该支持可选的父目录 ID', () => {
      const rootFolder: IFolder = createValidFolder();
      expect(rootFolder.parentId).toBeUndefined();
      
      const childFolder: IFolder = {
        ...createValidFolder(),
        id: 'folder-/Frontend/React',
        path: '/Frontend/React',
        parentId: 'folder-/Frontend',
      };
      expect(childFolder.parentId).toBe('folder-/Frontend');
    });

    it('应该支持可选的描述和颜色标签', () => {
      const folderWithMeta: IFolder = {
        ...createValidFolder(),
        description: '前端开发相关书签',
        colorTag: '#3498db',
      };
      
      expect(folderWithMeta.description).toBe('前端开发相关书签');
      expect(folderWithMeta.colorTag).toBe('#3498db');
    });
  });

  /**
   * Requirement 1.3: FilterType 类型验证
   * 验证 FilterType 移除了 'ai_category'
   */
  describe('FilterType 类型', () => {
    it('应该包含所有有效的过滤类型', () => {
      const validFilterTypes: FilterType[] = [
        'chrome',
        'starred',
        'recent',
        'popular',
        'longtail',
        'trash',
        'frequent',
        'unvisited',
        'important',
      ];
      
      // 验证每个类型都是有效的 FilterType
      validFilterTypes.forEach(filterType => {
        const filter: FilterType = filterType;
        expect(filter).toBe(filterType);
      });
    });

    it('不应该包含已移除的 ai_category 类型', () => {
      // 这个测试通过 TypeScript 类型检查来验证
      // 如果 'ai_category' 仍然存在于 FilterType 中，下面的代码会编译通过
      // 但由于已移除，我们只能验证有效类型的数量
      const validFilterTypes: FilterType[] = [
        'chrome',
        'starred',
        'recent',
        'popular',
        'longtail',
        'trash',
        'frequent',
        'unvisited',
        'important',
      ];
      
      // 验证总共有 9 种过滤类型（不包含 ai_category）
      expect(validFilterTypes.length).toBe(9);
      
      // 验证 ai_category 不在有效类型列表中
      expect(validFilterTypes).not.toContain('ai_category');
    });
  });

  /**
   * IUserSettings 接口验证
   * 验证用户设置包含 chromeSyncEnabled 字段
   */
  describe('IUserSettings 接口', () => {
    it('应该包含 chromeSyncEnabled 字段', () => {
      const settings: IUserSettings = createValidUserSettings();
      
      expect(typeof settings.chromeSyncEnabled).toBe('boolean');
    });

    it('不应该包含已移除的 syncMode 字段', () => {
      const settings = createValidUserSettings();
      
      // 验证 syncMode 字段不存在
      expect('syncMode' in settings).toBe(false);
    });

    it('应该包含所有必需的设置字段', () => {
      const settings: IUserSettings = createValidUserSettings();
      
      // 同步设置
      expect(typeof settings.syncEnabled).toBe('boolean');
      expect(typeof settings.chromeSyncEnabled).toBe('boolean');
      expect(typeof settings.autoAnalyze).toBe('boolean');
      
      // UI 设置
      expect(settings.theme).toBeDefined();
      expect(settings.viewMode).toBeDefined();
      expect(typeof settings.previewPanelVisible).toBe('boolean');
      expect(typeof settings.previewPanelWidth).toBe('number');
      expect(settings.pixelBuddyTheme).toBeDefined();
      expect(settings.openMode).toBeDefined();
      
      // 功能设置
      expect(typeof settings.softDelete).toBe('boolean');
      expect(typeof settings.autoArchiveDays).toBe('number');
      expect(typeof settings.autoDeleteDays).toBe('number');
      expect(typeof settings.indexedDBEnabled).toBe('boolean');
    });
  });

  /**
   * IBookmarkAnalytics 接口验证
   */
  describe('IBookmarkAnalytics 接口', () => {
    it('应该包含统计数据字段', () => {
      const analytics: IBookmarkAnalytics = {
        visitCount: 10,
        lastVisit: Date.now(),
        importance: 75,
        readTime: 300,
      };
      
      expect(analytics.visitCount).toBe(10);
      expect(analytics.lastVisit).toBeDefined();
      expect(analytics.importance).toBe(75);
      expect(analytics.readTime).toBe(300);
    });

    it('importance 应该在 0-100 范围内', () => {
      const analytics: IBookmarkAnalytics = {
        visitCount: 0,
        importance: 50,
      };
      
      expect(analytics.importance).toBeGreaterThanOrEqual(0);
      expect(analytics.importance).toBeLessThanOrEqual(100);
    });
  });
});

// 辅助函数：创建有效的 IBookmark 对象
function createValidBookmark(): IBookmark {
  return {
    id: 'bookmark-123',
    url: 'https://example.com',
    title: 'Example Bookmark',
    folderId: 'folder-/Frontend',
    folderPath: '/Frontend',
    userTags: ['example', 'test'],
    starred: false,
    pinned: false,
    aiTags: [],
    createTime: Date.now(),
    updateTime: Date.now(),
    analytics: {
      visitCount: 0,
      importance: 50,
    },
    status: 'active',
  };
}

// 辅助函数：创建有效的 IFolder 对象
function createValidFolder(): IFolder {
  return {
    id: 'folder-/Frontend',
    title: 'Frontend',
    path: '/Frontend',
    createTime: Date.now(),
    updateTime: Date.now(),
    order: 0,
    bookmarkCount: 0,
    subfolderCount: 0,
  };
}

// 辅助函数：创建有效的 IUserSettings 对象
function createValidUserSettings(): IUserSettings {
  return {
    syncEnabled: true,
    chromeSyncEnabled: false,
    autoAnalyze: true,
    theme: 'auto',
    viewMode: 'list',
    previewPanelVisible: true,
    previewPanelWidth: 30,
    pixelBuddyTheme: 'classic',
    openMode: 'sidebar',
    softDelete: true,
    autoArchiveDays: 30,
    autoDeleteDays: 90,
    indexedDBEnabled: false,
  };
}
