/**
 * Agent 集成测试
 * 模拟 Chrome 环境，测试 Agent 处理各种复杂任务的能力
 * 
 * 测试场景：
 * 1. 基础书签操作（增删改查）
 * 2. 复杂搜索和过滤
 * 3. 批量操作和确认流程
 * 4. 文件夹管理
 * 5. AI 分析和整理建议
 * 6. 外部资源发现
 * 7. 错误处理和边界情况
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { IBookmark, IFolder, IUserSettings } from '../../../types/bookmark';

// ============================================================================
// Mock Chrome API
// ============================================================================

const mockBookmarks: IBookmark[] = [];
const mockFolders: IFolder[] = [];
const mockStorage: Record<string, any> = {
  bookmarks: [],
  folders: [],
  userSettings: {
    chromeSyncEnabled: false,
    autoAnalyze: true,
    theme: 'dark',
  } as IUserSettings,
};

// Mock chrome.storage.local
const mockChromeStorage = {
  get: vi.fn(async (keys: string | string[]) => {
    if (typeof keys === 'string') {
      return { [keys]: mockStorage[keys] };
    }
    const result: Record<string, any> = {};
    keys.forEach(key => {
      result[key] = mockStorage[key];
    });
    return result;
  }),
  set: vi.fn(async (items: Record<string, any>) => {
    Object.assign(mockStorage, items);
  }),
};

// Mock chrome.tabs
const mockChromeTabs = {
  create: vi.fn(async (options: { url: string }) => {
    console.log(`[Mock] Opening tab: ${options.url}`);
    return { id: Date.now(), url: options.url };
  }),
};

// Mock chrome.runtime
const mockChromeRuntime = {
  sendMessage: vi.fn(async () => {}),
};

// Mock chrome.bookmarks (for sync)
const mockChromeBookmarks = {
  getTree: vi.fn(async () => [{
    id: '0',
    title: '',
    children: [
      { id: '1', title: 'Bookmarks bar', children: [] },
      { id: '2', title: 'Other bookmarks', children: [] },
    ],
  }]),
  create: vi.fn(async (options: any) => ({
    id: `chrome-${Date.now()}`,
    ...options,
  })),
  update: vi.fn(async () => ({})),
  remove: vi.fn(async () => {}),
  move: vi.fn(async () => ({})),
  getChildren: vi.fn(async () => []),
  get: vi.fn(async (id: string) => [{ id, title: 'Test', parentId: '2' }]),
};

// Setup global chrome mock
(global as any).chrome = {
  storage: { local: mockChromeStorage },
  tabs: mockChromeTabs,
  runtime: mockChromeRuntime,
  bookmarks: mockChromeBookmarks,
};

// ============================================================================
// Test Data Factory
// ============================================================================

function createTestBookmark(overrides: Partial<IBookmark> = {}): IBookmark {
  const id = `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Test Bookmark ${id.slice(-4)}`,
    folderPath: '/',
    folderId: 'folder-/',
    userTags: [],
    aiTags: [],
    starred: false,
    pinned: false,
    createTime: Date.now(),
    updateTime: Date.now(),
    status: 'active',
    analytics: { visitCount: 0, importance: 50 },
    ...overrides,
  };
}

function createTestFolder(name: string, parentPath = '/'): IFolder {
  const path = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
  return {
    id: `folder-${path}`,
    title: name,
    path,
    parentId: parentPath === '/' ? undefined : `folder-${parentPath}`,
    bookmarkCount: 0,
    subfolderCount: 0,
    createTime: Date.now(),
    updateTime: Date.now(),
    order: 0,
  };
}

// ============================================================================
// Test Helpers
// ============================================================================

// 导入 store 用于直接设置状态
import { useBookmarkStore } from '../../../sidebar/store/bookmarkStore';

function createTestData() {
  // 创建测试书签
  const bookmarks: IBookmark[] = [
    // 前端开发相关
    createTestBookmark({
      title: 'React 官方文档',
      url: 'https://react.dev',
      folderPath: '/Frontend',
      folderId: 'folder-/Frontend',
      aiTags: ['react', 'frontend', 'javascript'],
      aiSummary: 'React 官方文档，包含教程和 API 参考',
      starred: true,
      analytics: { visitCount: 50, lastVisit: Date.now() - 1000 * 60 * 60, importance: 90 },
    }),
    createTestBookmark({
      title: 'Vue.js 指南',
      url: 'https://vuejs.org/guide',
      folderPath: '/Frontend',
      folderId: 'folder-/Frontend',
      aiTags: ['vue', 'frontend', 'javascript'],
      aiSummary: 'Vue.js 官方指南',
      analytics: { visitCount: 30, lastVisit: Date.now() - 1000 * 60 * 60 * 24 * 3, importance: 80 },
    }),
    createTestBookmark({
      title: 'TypeScript 手册',
      url: 'https://www.typescriptlang.org/docs',
      folderPath: '/Frontend',
      folderId: 'folder-/Frontend',
      aiTags: ['typescript', 'frontend', 'javascript'],
      aiSummary: 'TypeScript 官方文档',
      analytics: { visitCount: 20, lastVisit: Date.now() - 1000 * 60 * 60 * 24 * 10, importance: 75 },
    }),
    
    // 后端开发相关
    createTestBookmark({
      title: 'Node.js 文档',
      url: 'https://nodejs.org/docs',
      folderPath: '/Backend',
      folderId: 'folder-/Backend',
      aiTags: ['nodejs', 'backend', 'javascript'],
      aiSummary: 'Node.js 官方文档',
      analytics: { visitCount: 15, lastVisit: Date.now() - 1000 * 60 * 60 * 24 * 30, importance: 70 },
    }),
    createTestBookmark({
      title: 'Python 教程',
      url: 'https://docs.python.org/3/tutorial',
      folderPath: '/Backend',
      folderId: 'folder-/Backend',
      aiTags: ['python', 'backend', 'programming'],
      aiSummary: 'Python 官方教程',
      analytics: { visitCount: 5, lastVisit: Date.now() - 1000 * 60 * 60 * 24 * 60, importance: 60 },
    }),
    
    // 未分类书签
    createTestBookmark({
      title: 'GitHub',
      url: 'https://github.com',
      folderPath: '/',
      folderId: 'folder-/',
      aiTags: ['github', 'git', 'development'],
      aiSummary: 'GitHub 代码托管平台',
      starred: true,
      analytics: { visitCount: 100, lastVisit: Date.now() - 1000 * 60 * 30, importance: 95 },
    }),
    
    // 从未访问的书签
    createTestBookmark({
      title: '未访问的教程',
      url: 'https://example.com/unvisited',
      folderPath: '/',
      folderId: 'folder-/',
      aiTags: [],
      analytics: { visitCount: 0, importance: 30 },
    }),
    
    // 重复书签
    createTestBookmark({
      title: 'React 文档 (重复)',
      url: 'https://react.dev',
      folderPath: '/',
      folderId: 'folder-/',
      aiTags: ['react'],
    }),
    
    // 已删除的书签
    createTestBookmark({
      title: '已删除的书签',
      url: 'https://example.com/deleted',
      folderPath: '/',
      folderId: 'folder-/',
      status: 'deleted',
    }),
    
    // 长尾书签（超过 90 天未访问）
    createTestBookmark({
      title: '很久没看的文章',
      url: 'https://example.com/old-article',
      folderPath: '/Archive',
      folderId: 'folder-/Archive',
      aiTags: ['article', 'old'],
      analytics: { visitCount: 2, lastVisit: Date.now() - 1000 * 60 * 60 * 24 * 100, importance: 20 },
    }),
  ];

  // 创建测试文件夹
  const folders: IFolder[] = [
    createTestFolder('Frontend'),
    createTestFolder('Backend'),
    createTestFolder('Archive'),
  ];

  return { bookmarks, folders };
}

async function setupTestData() {
  const { bookmarks, folders } = createTestData();
  
  // 更新 mock storage
  mockStorage.bookmarks = bookmarks;
  mockStorage.folders = folders;

  // 直接设置 Zustand store 的状态
  useBookmarkStore.setState({
    bookmarks,
    folders,
  });

  return { bookmarks, folders };
}

// ============================================================================
// Import modules after mocks are set up
// ============================================================================

// 动态导入，确保 mock 已设置
let contextTool: any;
let bookmarkTool: any;
let organizeTool: any;
let folderTool: any;
let searchTool: any;
let discoverTool: any;



// ============================================================================
// Test Suites
// ============================================================================

describe('Agent Integration Tests', () => {
  let testData: { bookmarks: IBookmark[]; folders: IFolder[] };

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // 创建测试数据
    testData = createTestData();
    
    // 更新 mock storage
    mockStorage.bookmarks = [...testData.bookmarks];
    mockStorage.folders = [...testData.folders];
    
    // 动态导入工具（在 mock 设置后）
    const coreToolsModule = await import('../tools/coreTools');
    contextTool = coreToolsModule.contextTool;
    bookmarkTool = coreToolsModule.bookmarkTool;
    organizeTool = coreToolsModule.organizeTool;
    folderTool = coreToolsModule.folderTool;
    searchTool = coreToolsModule.searchTool;
    discoverTool = coreToolsModule.discoverTool;
    
    // 直接设置 Zustand store 的状态（在导入工具后）
    // 使用深拷贝确保每个测试有独立的数据
    useBookmarkStore.setState({
      bookmarks: JSON.parse(JSON.stringify(testData.bookmarks)),
      folders: JSON.parse(JSON.stringify(testData.folders)),
    });
  });

  afterEach(() => {
    // 不要使用 vi.resetModules()，这会导致 store 实例不一致
    // 只清空 store 状态
    useBookmarkStore.setState({
      bookmarks: [],
      folders: [],
    });
  });

  // ==========================================================================
  // 1. Context 工具测试
  // ==========================================================================
  describe('Context Tool', () => {
    it('should get overview of bookmark library', async () => {
      const result = await contextTool.execute({ action: 'overview' });
      
      expect(result.success).toBe(true);
      expect(result.data.totalBookmarks).toBeGreaterThan(0);
      expect(result.data.overview).toContain('书签库概览');
      expect(result.data.decayStats).toBeDefined();
    });

    it('should list all folders', async () => {
      const result = await contextTool.execute({ action: 'folders' });
      
      expect(result.success).toBe(true);
      expect(result.data.folders).toBeDefined();
      expect(Array.isArray(result.data.folders)).toBe(true);
    });

    it('should get statistics', async () => {
      const result = await contextTool.execute({ action: 'stats' });
      
      expect(result.success).toBe(true);
      expect(result.data.total).toBeGreaterThan(0);
      expect(result.data.decayStats).toBeDefined();
      expect(result.data.topTags).toBeDefined();
    });

    it('should filter by starred', async () => {
      const result = await contextTool.execute({ 
        action: 'filter', 
        filterType: 'starred' 
      });
      
      expect(result.success).toBe(true);
      expect(result.data.filterName).toBe('星标书签');
      // 应该只返回星标书签
      result.data.results.forEach((r: any) => {
        expect(r.starred).toBe(true);
      });
    });

    it('should filter by longtail (cold/frozen)', async () => {
      const result = await contextTool.execute({ 
        action: 'filter', 
        filterType: 'longtail' 
      });
      
      expect(result.success).toBe(true);
      expect(result.data.filterName).toBe('长尾书签');
    });

    it('should filter trash', async () => {
      const result = await contextTool.execute({ 
        action: 'filter', 
        filterType: 'trash' 
      });
      
      expect(result.success).toBe(true);
      expect(result.data.filterName).toBe('回收站');
    });
  });

  // ==========================================================================
  // 2. Search 工具测试
  // ==========================================================================
  describe('Search Tool', () => {
    it('should search by keyword', async () => {
      const result = await searchTool.execute({ query: 'React' });
      
      expect(result.success).toBe(true);
      expect(result.data.count).toBeGreaterThan(0);
      expect(result.data.results.some((r: any) => 
        r.title.toLowerCase().includes('react')
      )).toBe(true);
    });

    it('should search with wildcard and filters', async () => {
      const result = await searchTool.execute({ 
        query: '*',
        filters: { starred: true }
      });
      
      expect(result.success).toBe(true);
      result.data.results.forEach((r: any) => {
        expect(r.starred).toBe(true);
      });
    });

    it('should search unvisited bookmarks', async () => {
      const result = await searchTool.execute({ 
        query: '*',
        filters: { unvisited: true }
      });
      
      expect(result.success).toBe(true);
      result.data.results.forEach((r: any) => {
        expect(r.visitCount).toBe(0);
      });
    });

    it('should search by decay status', async () => {
      const result = await searchTool.execute({ 
        query: '*',
        filters: { decayStatus: 'frozen' }
      });
      
      expect(result.success).toBe(true);
      result.data.results.forEach((r: any) => {
        expect(r.decayStatus).toBe('frozen');
      });
    });

    it('should search by folder', async () => {
      const result = await searchTool.execute({ 
        query: '*',
        filters: { folder: '/Frontend' }
      });
      
      expect(result.success).toBe(true);
      result.data.results.forEach((r: any) => {
        expect(r.folder).toContain('Frontend');
      });
    });

    it('should sort by frecency', async () => {
      const result = await searchTool.execute({ 
        query: '*',
        sortBy: 'frecency'
      });
      
      expect(result.success).toBe(true);
      // 验证按 frecency 降序排列
      for (let i = 1; i < result.data.results.length; i++) {
        expect(result.data.results[i - 1].frecency).toBeGreaterThanOrEqual(
          result.data.results[i].frecency
        );
      }
    });

    it('should handle empty search results', async () => {
      const result = await searchTool.execute({ 
        query: 'nonexistent-keyword-xyz123' 
      });
      
      expect(result.success).toBe(true);
      expect(result.data.count).toBe(0);
    });
  });

  // ==========================================================================
  // 3. Bookmark 工具测试
  // ==========================================================================
  describe('Bookmark Tool', () => {
    it('should add a new bookmark', async () => {
      const result = await bookmarkTool.execute({
        action: 'add',
        url: 'https://new-bookmark.com',
        title: 'New Bookmark',
        tags: ['test', 'new'],
      });
      
      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.title).toBe('New Bookmark');
    });

    it('should reject duplicate URL', async () => {
      const result = await bookmarkTool.execute({
        action: 'add',
        url: 'https://react.dev', // 已存在
        title: 'Duplicate',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('已存在');
    });

    it('should edit bookmark', async () => {
      // 先获取一个书签 ID
      const searchResult = await searchTool.execute({ query: 'React' });
      const bookmarkId = searchResult.data.results[0].id;
      
      const result = await bookmarkTool.execute({
        action: 'edit',
        bookmarkId,
        updates: {
          title: 'Updated Title',
          userTags: ['updated', 'test'],
        },
      });
      
      expect(result.success).toBe(true);
    });

    it('should toggle star', async () => {
      const searchResult = await searchTool.execute({ query: 'Vue' });
      const bookmarkId = searchResult.data.results[0].id;
      const wasStarred = searchResult.data.results[0].starred;
      
      const result = await bookmarkTool.execute({
        action: 'star',
        bookmarkId,
      });
      
      expect(result.success).toBe(true);
      expect(result.data.starred).toBe(!wasStarred);
    });

    it('should delete bookmark to trash', async () => {
      const searchResult = await searchTool.execute({ query: 'Vue' });
      const bookmarkId = searchResult.data.results[0].id;
      
      const result = await bookmarkTool.execute({
        action: 'delete',
        bookmarkId,
      });
      
      expect(result.success).toBe(true);
      expect(result.data.message).toContain('已删除');
    });

    it('should restore bookmark from trash', async () => {
      // 获取回收站中的书签
      const trashResult = await contextTool.execute({ 
        action: 'filter', 
        filterType: 'trash' 
      });
      
      if (trashResult.data.results.length > 0) {
        const bookmarkId = trashResult.data.results[0].id;
        
        const result = await bookmarkTool.execute({
          action: 'restore',
          bookmarkId,
        });
        
        expect(result.success).toBe(true);
      }
    });

    it('should move bookmark to folder', async () => {
      const searchResult = await searchTool.execute({ query: 'GitHub' });
      const bookmarkId = searchResult.data.results[0].id;
      
      const result = await bookmarkTool.execute({
        action: 'move',
        bookmarkId,
        targetFolderId: 'folder-/Frontend',
      });
      
      expect(result.success).toBe(true);
      expect(result.data.newPath).toBe('/Frontend');
    });

    it('should open bookmark in new tab', async () => {
      const searchResult = await searchTool.execute({ query: 'React' });
      const bookmarkId = searchResult.data.results[0].id;
      
      const result = await bookmarkTool.execute({
        action: 'open',
        bookmarkId,
      });
      
      expect(result.success).toBe(true);
      expect(mockChromeTabs.create).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 4. Batch Operations 测试
  // ==========================================================================
  describe('Batch Operations', () => {
    it('should require confirmation for batch move > 5', async () => {
      // 获取多个书签 ID
      const searchResult = await searchTool.execute({ query: '*', limit: 10 });
      const bookmarkIds = searchResult.data.results.slice(0, 6).map((r: any) => r.id);
      
      const result = await bookmarkTool.execute({
        action: 'batchMove',
        bookmarkIds,
        targetFolderId: 'folder-/Archive',
      });
      
      expect(result.success).toBe(true);
      expect(result.data.requiresConfirmation).toBe(true);
      expect(result.data.confirmationId).toBeDefined();
    });

    it('should execute batch move without confirmation for <= 5', async () => {
      const searchResult = await searchTool.execute({ query: '*', limit: 5 });
      const bookmarkIds = searchResult.data.results.slice(0, 3).map((r: any) => r.id);
      
      const result = await bookmarkTool.execute({
        action: 'batchMove',
        bookmarkIds,
        targetFolderId: 'folder-/Archive',
      });
      
      expect(result.success).toBe(true);
      expect(result.data.requiresConfirmation).toBeUndefined();
      expect(result.data.movedCount).toBe(3);
    });

    it('should require confirmation for batch delete > 3', async () => {
      const searchResult = await searchTool.execute({ query: '*', limit: 10 });
      const bookmarkIds = searchResult.data.results.slice(0, 5).map((r: any) => r.id);
      
      const result = await bookmarkTool.execute({
        action: 'batchDelete',
        bookmarkIds,
      });
      
      expect(result.success).toBe(true);
      expect(result.data.requiresConfirmation).toBe(true);
    });
  });

  // ==========================================================================
  // 5. Folder 工具测试
  // ==========================================================================
  describe('Folder Tool', () => {
    it('should create a new folder', async () => {
      const result = await folderTool.execute({
        action: 'create',
        name: 'NewFolder',
        parentPath: '/',
      });
      
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('NewFolder');
      expect(result.data.path).toBe('/NewFolder');
    });

    it('should create nested folder', async () => {
      const result = await folderTool.execute({
        action: 'create',
        name: 'SubFolder',
        parentPath: '/Frontend',
      });
      
      expect(result.success).toBe(true);
      expect(result.data.path).toBe('/Frontend/SubFolder');
    });

    it('should reject duplicate folder', async () => {
      const result = await folderTool.execute({
        action: 'create',
        name: 'Frontend', // 已存在
        parentPath: '/',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('已存在');
    });

    it('should rename folder', async () => {
      const result = await folderTool.execute({
        action: 'rename',
        folderId: 'folder-/Archive',
        newName: 'OldStuff',
      });
      
      expect(result.success).toBe(true);
      expect(result.data.newName).toBe('OldStuff');
    });
  });

  // ==========================================================================
  // 6. Organize 工具测试
  // ==========================================================================
  describe('Organize Tool', () => {
    it('should analyze bookmark library', async () => {
      const result = await organizeTool.execute({
        action: 'analyze',
        analyzeOptions: {
          findDuplicates: true,
          findUnvisited: true,
          findScattered: true,
        },
      });
      
      expect(result.success).toBe(true);
      expect(result.data.report).toContain('分析报告');
      expect(result.data.duplicates).toBeDefined();
      expect(result.data.unvisited).toBeDefined();
    });

    it('should find duplicate bookmarks', async () => {
      const result = await organizeTool.execute({
        action: 'analyze',
        analyzeOptions: { findDuplicates: true },
      });
      
      expect(result.success).toBe(true);
      // 我们的测试数据中有重复的 react.dev
      expect(result.data.duplicates.length).toBeGreaterThan(0);
    });

    it('should get suggest overview', async () => {
      const result = await organizeTool.execute({
        action: 'suggest',
      });
      
      expect(result.success).toBe(true);
      expect(result.data.overview).toContain('书签库概览');
      expect(result.data.bookmarks).toBeDefined();
      expect(Array.isArray(result.data.bookmarks)).toBe(true);
    });

    it('should update metadata', async () => {
      const searchResult = await searchTool.execute({ query: 'GitHub' });
      const bookmarkId = searchResult.data.results[0].id;
      
      const result = await organizeTool.execute({
        action: 'metadata',
        bookmarkId,
        metadata: {
          aiTags: ['github', 'code', 'repository'],
          aiSummary: 'GitHub is a code hosting platform',
        },
      });
      
      expect(result.success).toBe(true);
      expect(result.data.updatedFields).toContain('aiTags');
      expect(result.data.updatedFields).toContain('aiSummary');
    });
  });

  // ==========================================================================
  // 7. 复杂场景测试
  // ==========================================================================
  describe('Complex Scenarios', () => {
    it('Scenario: Find and organize scattered bookmarks', async () => {
      // 1. 先分析书签库
      const analyzeResult = await organizeTool.execute({
        action: 'analyze',
        analyzeOptions: { findScattered: true },
      });
      expect(analyzeResult.success).toBe(true);
      
      // 2. 获取建议
      const suggestResult = await organizeTool.execute({
        action: 'suggest',
      });
      expect(suggestResult.success).toBe(true);
      
      // 3. 搜索特定标签的书签
      const searchResult = await searchTool.execute({
        query: '*',
        filters: { tag: 'javascript' },
      });
      expect(searchResult.success).toBe(true);
    });

    it('Scenario: Clean up unused bookmarks', async () => {
      // 1. 找出从未访问的书签
      const unvisitedResult = await searchTool.execute({
        query: '*',
        filters: { unvisited: true },
      });
      expect(unvisitedResult.success).toBe(true);
      
      // 2. 找出长尾书签
      const longtailResult = await contextTool.execute({
        action: 'filter',
        filterType: 'longtail',
      });
      expect(longtailResult.success).toBe(true);
      
      // 3. 获取统计信息
      const statsResult = await contextTool.execute({
        action: 'stats',
      });
      expect(statsResult.success).toBe(true);
      expect(statsResult.data.decayStats).toBeDefined();
    });

    it('Scenario: Reorganize bookmarks by topic', async () => {
      // 1. 创建新文件夹
      const createResult = await folderTool.execute({
        action: 'create',
        name: 'JavaScript',
        parentPath: '/',
      });
      expect(createResult.success).toBe(true);
      
      // 2. 搜索 JavaScript 相关书签
      const searchResult = await searchTool.execute({
        query: 'javascript',
      });
      expect(searchResult.success).toBe(true);
      
      // 3. 移动书签到新文件夹
      if (searchResult.data.results.length > 0) {
        const moveResult = await bookmarkTool.execute({
          action: 'move',
          bookmarkId: searchResult.data.results[0].id,
          targetFolderId: 'folder-/JavaScript',
        });
        expect(moveResult.success).toBe(true);
      }
    });

    it('Scenario: Full workflow - add, organize, search', async () => {
      // 1. 添加新书签
      const addResult = await bookmarkTool.execute({
        action: 'add',
        url: 'https://nextjs.org',
        title: 'Next.js Documentation',
        tags: ['nextjs', 'react', 'framework'],
      });
      expect(addResult.success).toBe(true);
      const newBookmarkId = addResult.data.id;
      
      // 2. 更新元数据
      const metadataResult = await organizeTool.execute({
        action: 'metadata',
        bookmarkId: newBookmarkId,
        metadata: {
          aiTags: ['nextjs', 'react', 'ssr', 'framework'],
          aiSummary: 'Next.js is a React framework for production',
        },
      });
      expect(metadataResult.success).toBe(true);
      
      // 3. 移动到合适的文件夹
      const moveResult = await bookmarkTool.execute({
        action: 'move',
        bookmarkId: newBookmarkId,
        targetFolderId: 'folder-/Frontend',
      });
      expect(moveResult.success).toBe(true);
      
      // 4. 搜索验证
      const searchResult = await searchTool.execute({
        query: 'nextjs',
      });
      expect(searchResult.success).toBe(true);
      expect(searchResult.data.count).toBeGreaterThan(0);
      
      // 5. 加星标
      const starResult = await bookmarkTool.execute({
        action: 'star',
        bookmarkId: newBookmarkId,
      });
      expect(starResult.success).toBe(true);
      expect(starResult.data.starred).toBe(true);
    });
  });

  // ==========================================================================
  // 8. 错误处理测试
  // ==========================================================================
  describe('Error Handling', () => {
    it('should handle missing required parameters', async () => {
      const result = await bookmarkTool.execute({
        action: 'add',
        // missing url
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('URL');
    });

    it('should handle non-existent bookmark', async () => {
      const result = await bookmarkTool.execute({
        action: 'edit',
        bookmarkId: 'non-existent-id',
        updates: { title: 'New Title' },
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('should handle non-existent folder', async () => {
      const result = await folderTool.execute({
        action: 'rename',
        folderId: 'folder-/NonExistent',
        newName: 'NewName',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('should handle invalid action', async () => {
      const result = await bookmarkTool.execute({
        action: 'invalid-action',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('未知操作');
    });

    it('should handle empty search query', async () => {
      const result = await searchTool.execute({
        query: '',
      });
      
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// 性能测试
// ============================================================================
describe('Performance Tests', () => {
  it('should handle large bookmark library', async () => {
    // 创建大量测试书签
    const largeBookmarks: IBookmark[] = [];
    for (let i = 0; i < 500; i++) {
      largeBookmarks.push(createTestBookmark({
        title: `Bookmark ${i}`,
        url: `https://example.com/bookmark-${i}`,
        aiTags: [`tag${i % 10}`, `category${i % 5}`],
      }));
    }
    mockStorage.bookmarks = largeBookmarks;
    
    // 直接设置 Zustand store 的状态
    useBookmarkStore.setState({
      bookmarks: largeBookmarks,
    });
    
    const startTime = Date.now();
    
    // 测试搜索性能
    const searchResult = await searchTool.execute({ query: 'Bookmark' });
    
    const searchTime = Date.now() - startTime;
    expect(searchTime).toBeLessThan(1000); // 应该在 1 秒内完成
    expect(searchResult.success).toBe(true);
    
    // 测试概览性能
    const overviewStart = Date.now();
    const overviewResult = await contextTool.execute({ action: 'overview' });
    const overviewTime = Date.now() - overviewStart;
    
    expect(overviewTime).toBeLessThan(2000); // 应该在 2 秒内完成
    expect(overviewResult.success).toBe(true);
  });
});
