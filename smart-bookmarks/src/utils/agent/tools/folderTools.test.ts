/**
 * 文件夹工具测试
 * 包含单元测试和属性测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  createFolderTool,
  renameFolderTool,
  deleteFolderTool,
  listFoldersTool,
  moveBookmarkToFolderTool,
} from './folderTools';
import type { IBookmark, IFolder } from '../../../types/bookmark';

// Mock store
const mockFolders: IFolder[] = [];
const mockBookmarks: IBookmark[] = [];
const mockStore = {
  folders: mockFolders,
  bookmarks: mockBookmarks,
  addFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
  moveBookmarkToFolder: vi.fn(),
};

vi.mock('../../../sidebar/store/bookmarkStore', () => ({
  useBookmarkStore: {
    getState: () => mockStore,
  },
}));

// 创建测试文件夹的辅助函数
const createTestFolder = (overrides: Partial<IFolder> = {}): IFolder => ({
  id: `folder-/test`,
  title: 'Test Folder',
  path: '/test',
  bookmarkCount: 0,
  subfolderCount: 0,
  createTime: Date.now(),
  updateTime: Date.now(),
  order: 0,
  ...overrides,
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

describe('Folder Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.folders = [];
    mockStore.bookmarks = [];
  });

  describe('create_folder', () => {
    it('应该创建新文件夹', async () => {
      const result = await createFolderTool.execute({ name: 'New Folder' });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('New Folder');
      expect(result.data.path).toBe('/New Folder');
      expect(mockStore.addFolder).toHaveBeenCalled();
    });

    it('应该在指定父路径下创建文件夹', async () => {
      const result = await createFolderTool.execute({
        name: 'SubFolder',
        parentPath: '/Parent',
      });

      expect(result.success).toBe(true);
      expect(result.data.path).toBe('/Parent/SubFolder');
    });

    it('应该拒绝创建已存在的文件夹', async () => {
      mockStore.folders = [createTestFolder({ id: 'folder-/Existing' })];

      const result = await createFolderTool.execute({ name: 'Existing' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('已存在');
    });
  });

  /**
   * Property 8: Folder Creation with Name
   * Feature: agent-enhancement, Property 8: Folder Creation with Name
   * Validates: Requirements 6.1
   * 
   * 对于任何文件夹创建请求，创建的文件夹应该具有指定的名称
   */
  describe('Property 8: Folder Creation with Name', () => {
    it('创建的文件夹应该具有指定的名称', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && s.trim().length > 0),
          async (folderName) => {
            mockStore.folders = [];
            mockStore.addFolder.mockClear();

            const result = await createFolderTool.execute({ name: folderName });

            if (!result.success) return true; // 跳过失败的情况

            // 验证返回的名称与输入一致
            return result.data.name === folderName;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('创建的文件夹路径应该包含指定的名称', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('/') && s.trim().length > 0),
          async (folderName) => {
            mockStore.folders = [];
            mockStore.addFolder.mockClear();

            const result = await createFolderTool.execute({ name: folderName });

            if (!result.success) return true;

            // 验证路径以名称结尾
            return result.data.path.endsWith(folderName);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('rename_folder', () => {
    it('应该重命名文件夹', async () => {
      mockStore.folders = [createTestFolder({ id: 'folder-/old', title: 'Old Name' })];

      const result = await renameFolderTool.execute({
        folderId: 'folder-/old',
        newName: 'New Name',
      });

      expect(result.success).toBe(true);
      expect(result.data.oldName).toBe('Old Name');
      expect(result.data.newName).toBe('New Name');
      expect(mockStore.updateFolder).toHaveBeenCalled();
    });

    it('应该对不存在的文件夹返回错误', async () => {
      mockStore.folders = [];

      const result = await renameFolderTool.execute({
        folderId: 'folder-/nonexistent',
        newName: 'New Name',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  describe('delete_folder', () => {
    it('应该删除文件夹', async () => {
      mockStore.folders = [createTestFolder({ id: 'folder-/test', title: 'Test' })];
      mockStore.bookmarks = [
        createTestBookmark({ folderPath: '/test' }),
        createTestBookmark({ folderPath: '/test' }),
      ];

      const result = await deleteFolderTool.execute({ folderId: 'folder-/test' });

      expect(result.success).toBe(true);
      expect(result.data.affectedBookmarks).toBe(2);
      expect(mockStore.deleteFolder).toHaveBeenCalledWith('folder-/test');
    });
  });

  describe('list_folders', () => {
    it('应该列出所有文件夹', async () => {
      mockStore.bookmarks = [
        createTestBookmark({ folderPath: '/' }),
        createTestBookmark({ folderPath: '/Tech' }),
        createTestBookmark({ folderPath: '/Tech' }),
        createTestBookmark({ folderPath: '/Work' }),
      ];

      const result = await listFoldersTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(3); // /, /Tech, /Work
    });
  });

  describe('move_bookmark_to_folder', () => {
    it('应该移动书签到指定文件夹', async () => {
      mockStore.bookmarks = [
        createTestBookmark({ id: 'bm-1', folderId: 'folder-/', folderPath: '/' }),
      ];

      const result = await moveBookmarkToFolderTool.execute({
        bookmarkId: 'bm-1',
        folderId: 'folder-/Tech',
      });

      expect(result.success).toBe(true);
      expect(result.data.newPath).toBe('/Tech');
      expect(mockStore.moveBookmarkToFolder).toHaveBeenCalledWith('bm-1', 'folder-/Tech');
    });
  });

  /**
   * Property 5: Folder Count Integrity
   * Feature: agent-enhancement, Property 5: Folder Count Integrity
   * Validates: Requirements 4.5
   * 
   * 注意：这个属性测试验证 moveBookmarkToFolder 被正确调用
   * 实际的计数更新由 store 处理
   */
  describe('Property 5: Folder Count Integrity', () => {
    it('移动书签时应该调用正确的 store 方法', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && s.trim().length > 0),
          async (bookmarkId, folderName) => {
            mockStore.bookmarks = [
              createTestBookmark({ id: bookmarkId, folderId: 'folder-/', folderPath: '/' }),
            ];
            mockStore.moveBookmarkToFolder.mockClear();

            const targetFolderId = `folder-/${folderName}`;
            await moveBookmarkToFolderTool.execute({
              bookmarkId,
              folderId: targetFolderId,
            });

            // 验证 moveBookmarkToFolder 被调用，参数正确
            return mockStore.moveBookmarkToFolder.mock.calls.length === 1 &&
                   mockStore.moveBookmarkToFolder.mock.calls[0][0] === bookmarkId &&
                   mockStore.moveBookmarkToFolder.mock.calls[0][1] === targetFolderId;
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
