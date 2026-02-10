/**
 * BashExecutor Mock 测试
 * 
 * 使用 MockBookmarkStore 测试 BashExecutor 的所有命令
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BashExecutor } from '../BashExecutor';
import {
  MockBookmarkStore,
  setupMockEnvironment,
  teardownMockEnvironment,
} from '../mock';
import type { AgentContext } from '../types';

describe('BashExecutor with MockBookmarkStore', () => {
  let mockStore: MockBookmarkStore;
  let executor: BashExecutor;
  let context: AgentContext;

  beforeEach(() => {
    const env = setupMockEnvironment();
    mockStore = env.mockStore;
    executor = new BashExecutor(mockStore);
    context = env.context;
  });

  afterEach(() => {
    teardownMockEnvironment();
  });

  // ============ ls 命令测试 ============

  describe('ls command', () => {
    it('should list top-level folders at root', async () => {
      const result = await executor.execute('ls', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('书签栏/');
      expect(result.output).toContain('其他书签/');
      expect(result.output).toContain('移动设备书签/');
    });

    it('should list contents of a folder', async () => {
      // 先 cd 到书签栏
      await executor.execute('cd 书签栏', context);
      const result = await executor.execute('ls', context);
      
      expect(result.success).toBe(true);
      expect(result.data?.items).toBeDefined();
      expect(result.data?.items?.length).toBeGreaterThan(0);
    });

    it('should support long format with -l', async () => {
      await executor.execute('cd 书签栏', context);
      await executor.execute('cd Development', context);
      await executor.execute('cd Frontend', context);
      await executor.execute('cd React', context);
      
      const result = await executor.execute('ls -l', context);
      
      expect(result.success).toBe(true);
      // 长格式应该包含 URL
      expect(result.output).toContain('https://');
    });

    it('should return empty for empty folder', async () => {
      // 创建一个空文件夹
      await executor.execute('cd 书签栏', context);
      await executor.execute('mkdir EmptyFolder', context);
      await executor.execute('cd EmptyFolder', context);
      
      const result = await executor.execute('ls', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('(empty)');
    });
  });

  // ============ cd 命令测试 ============

  describe('cd command', () => {
    it('should change to root with cd /', async () => {
      await executor.execute('cd 书签栏', context);
      const result = await executor.execute('cd /', context);
      
      expect(result.success).toBe(true);
      expect(context.cwd.path).toBe('/');
      expect(context.cwd.folderId).toBeNull();
    });

    it('should change to a folder by name', async () => {
      const result = await executor.execute('cd 书签栏', context);
      
      expect(result.success).toBe(true);
      expect(context.cwd.path).toBe('/书签栏');
    });

    it('should support nested navigation', async () => {
      await executor.execute('cd 书签栏', context);
      await executor.execute('cd Development', context);
      const result = await executor.execute('cd Frontend', context);
      
      expect(result.success).toBe(true);
      expect(context.cwd.path).toContain('Frontend');
    });

    it('should support .. to go up', async () => {
      await executor.execute('cd 书签栏', context);
      await executor.execute('cd Development', context);
      const result = await executor.execute('cd ..', context);
      
      expect(result.success).toBe(true);
      expect(context.cwd.path).toBe('/书签栏');
    });

    it('should return error for non-existent folder', async () => {
      const result = await executor.execute('cd NonExistentFolder', context);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('error');
    });
  });

  // ============ pwd 命令测试 ============

  describe('pwd command', () => {
    it('should show root path initially', async () => {
      const result = await executor.execute('pwd', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('/');
    });

    it('should show current path after cd', async () => {
      await executor.execute('cd 书签栏', context);
      const result = await executor.execute('pwd', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('/书签栏');
    });
  });

  // ============ find 命令测试 ============

  describe('find command', () => {
    it('should find bookmarks by title', async () => {
      const result = await executor.execute('find React', context);
      
      expect(result.success).toBe(true);
      expect(result.data?.items?.length).toBeGreaterThan(0);
      expect(result.output).toContain('React');
    });

    it('should find bookmarks by tag', async () => {
      const result = await executor.execute('find typescript', context);
      
      expect(result.success).toBe(true);
      expect(result.data?.items?.length).toBeGreaterThan(0);
    });

    it('should support -type f for files only', async () => {
      const result = await executor.execute('find React -type f', context);
      
      expect(result.success).toBe(true);
      const items = result.data?.items || [];
      expect(items.every(item => item.type === 'file')).toBe(true);
    });

    it('should support -type d for directories only', async () => {
      const result = await executor.execute('find Development -type d', context);
      
      expect(result.success).toBe(true);
      const items = result.data?.items || [];
      expect(items.every(item => item.type === 'directory')).toBe(true);
    });

    it('should support -starred filter', async () => {
      const result = await executor.execute('find -starred', context);
      
      expect(result.success).toBe(true);
      const items = result.data?.items || [];
      expect(items.every(item => item.starred === true)).toBe(true);
    });

    it('should return no results for non-matching query', async () => {
      const result = await executor.execute('find xyznonexistent123', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('no results');
    });
  });

  // ============ mkdir 命令测试 ============

  describe('mkdir command', () => {
    it('should create a new folder', async () => {
      await executor.execute('cd 书签栏', context);
      const result = await executor.execute('mkdir NewTestFolder', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('created folder');
      expect(result.data?.id).toBeDefined();
    });

    it('should create folder in current directory', async () => {
      await executor.execute('cd 书签栏', context);
      await executor.execute('mkdir TestParent', context);
      await executor.execute('cd TestParent', context);
      const result = await executor.execute('mkdir TestChild', context);
      
      expect(result.success).toBe(true);
      
      // 验证文件夹被创建在正确位置
      const lsResult = await executor.execute('ls', context);
      expect(lsResult.output).toContain('TestChild');
    });
  });

  // ============ mv 命令测试 ============

  describe('mv command', () => {
    it('should move bookmark to another folder', async () => {
      // 创建目标文件夹
      await executor.execute('cd 书签栏', context);
      await executor.execute('mkdir MoveTarget', context);
      
      // 移动书签
      const result = await executor.execute('mv "React Documentation" MoveTarget', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('moved');
    });

    it('should rename bookmark when dest is not a folder', async () => {
      await executor.execute('cd 书签栏', context);
      await executor.execute('cd Development', context);
      await executor.execute('cd Frontend', context);
      await executor.execute('cd React', context);
      
      const result = await executor.execute('mv "React Documentation" "React Docs Renamed"', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('renamed');
    });

    it('should move folder to another folder', async () => {
      await executor.execute('cd 书签栏', context);
      await executor.execute('mkdir SourceFolder', context);
      await executor.execute('mkdir TargetFolder', context);
      
      const result = await executor.execute('mv SourceFolder TargetFolder', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('moved folder');
    });

    it('should return error for non-existent source', async () => {
      const result = await executor.execute('mv NonExistent SomeFolder', context);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });
  });

  // ============ rm 命令测试 ============

  describe('rm command', () => {
    it('should delete a bookmark', async () => {
      // 先创建一个书签
      await executor.execute('cd 书签栏', context);
      await mockStore.addBookmark('https://test.com', 'TestBookmark', '1');
      
      const result = await executor.execute('rm TestBookmark', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('deleted');
    });

    it('should delete a folder', async () => {
      await executor.execute('cd 书签栏', context);
      await executor.execute('mkdir FolderToDelete', context);
      
      const result = await executor.execute('rm FolderToDelete', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('deleted folder');
    });

    it('should return error for non-existent item', async () => {
      const result = await executor.execute('rm NonExistentItem', context);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });
  });

  // ============ cp 命令测试 ============

  describe('cp command', () => {
    it('should copy bookmark to another folder', async () => {
      await executor.execute('cd 书签栏', context);
      await executor.execute('mkdir CopyTarget', context);
      
      const result = await executor.execute('cp "React Documentation" CopyTarget', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('copied');
    });

    it('should return error for non-existent bookmark', async () => {
      await executor.execute('cd 书签栏', context);
      await executor.execute('mkdir CopyTarget', context);
      
      const result = await executor.execute('cp NonExistent CopyTarget', context);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });

    it('should return error for non-existent destination', async () => {
      const result = await executor.execute('cp "React Documentation" NonExistentFolder', context);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });
  });

  // ============ cat 命令测试 ============

  describe('cat command', () => {
    it('should show bookmark content', async () => {
      const result = await executor.execute('cat "React Documentation"', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('https://react.dev');
    });

    it('should show AI summary if available', async () => {
      const result = await executor.execute('cat "React Documentation"', context);
      
      expect(result.success).toBe(true);
      // React Documentation 有 AI 摘要
      expect(result.output).toContain('#');
    });

    it('should return error for non-existent bookmark', async () => {
      const result = await executor.execute('cat NonExistent', context);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });
  });

  // ============ stat 命令测试 ============

  describe('stat command', () => {
    it('should show detailed bookmark info', async () => {
      const result = await executor.execute('stat "React Documentation"', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('type:\tfile');
      expect(result.output).toContain('url:');
      expect(result.output).toContain('starred:');
    });

    it('should show detailed folder info', async () => {
      const result = await executor.execute('stat Development', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('type:\tdirectory');
      expect(result.output).toContain('subdirs:');
      expect(result.output).toContain('files:');
    });

    it('should return error for non-existent item', async () => {
      const result = await executor.execute('stat NonExistent', context);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });
  });

  // ============ tree 命令测试 ============

  describe('tree command', () => {
    it('should show directory tree', async () => {
      const result = await executor.execute('tree', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('/');
      expect(result.output).toContain('书签栏');
    });

    it('should respect depth parameter', async () => {
      const result1 = await executor.execute('tree 1', context);
      const result2 = await executor.execute('tree 3', context);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // 深度 3 应该比深度 1 有更多内容
      expect(result2.output.length).toBeGreaterThan(result1.output.length);
    });
  });

  // ============ wc 命令测试 ============

  describe('wc command', () => {
    it('should count bookmarks and folders at root', async () => {
      const result = await executor.execute('wc', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('bookmarks');
      expect(result.output).toContain('folders');
      expect(result.data?.bookmarks).toBeGreaterThan(0);
      expect(result.data?.folders).toBeGreaterThan(0);
    });

    it('should count items in specific folder', async () => {
      await executor.execute('cd 书签栏', context);
      await executor.execute('cd Development', context);
      await executor.execute('cd Frontend', context);
      await executor.execute('cd React', context);
      
      const result = await executor.execute('wc', context);
      
      expect(result.success).toBe(true);
      expect(result.data?.bookmarks).toBeGreaterThan(0);
    });
  });

  // ============ star 命令测试 ============

  describe('star command', () => {
    it('should toggle star status', async () => {
      // 找一个未星标的书签
      const result1 = await executor.execute('star "Vue.js Guide"', context);
      
      expect(result1.success).toBe(true);
      expect(result1.output).toContain('starred');
      
      // 再次切换
      const result2 = await executor.execute('star "Vue.js Guide"', context);
      
      expect(result2.success).toBe(true);
      expect(result2.output).toContain('unstarred');
    });

    it('should return error for non-existent bookmark', async () => {
      const result = await executor.execute('star NonExistent', context);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });
  });

  // ============ help 命令测试 ============

  describe('help command', () => {
    it('should show help text', async () => {
      const result = await executor.execute('help', context);
      
      expect(result.success).toBe(true);
      // 帮助文本可能是中文或英文
      expect(result.output).toMatch(/Commands:|可用命令/);
      expect(result.output).toContain('ls');
      expect(result.output).toContain('cd');
      expect(result.output).toContain('find');
    });
  });

  // ============ 错误处理测试 ============

  describe('error handling', () => {
    it('should return error for unknown command', async () => {
      const result = await executor.execute('unknowncommand', context);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(127);
      expect(result.output).toContain('command not found');
    });

    it('should handle empty command', async () => {
      const result = await executor.execute('', context);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('');
    });
  });
});

// ============ MockBookmarkStore 单元测试 ============

describe('MockBookmarkStore', () => {
  let store: MockBookmarkStore;

  beforeEach(() => {
    store = new MockBookmarkStore();
  });

  describe('initialization', () => {
    it('should have top-level folders', () => {
      expect(store.folders.length).toBeGreaterThanOrEqual(3);
      expect(store.folders.some(f => f.chromeId === '1')).toBe(true);
      expect(store.folders.some(f => f.chromeId === '2')).toBe(true);
      expect(store.folders.some(f => f.chromeId === '3')).toBe(true);
    });

    it('should load default fixture', () => {
      expect(store.bookmarks.length).toBeGreaterThan(0);
      expect(store.folders.length).toBeGreaterThan(3);
    });
  });

  describe('bookmark CRUD', () => {
    it('should add bookmark', async () => {
      const id = await store.addBookmark('https://test.com', 'Test', '1');
      
      expect(id).not.toBeNull();
      expect(store.getBookmarkById(id!)).toBeDefined();
    });

    it('should update bookmark', async () => {
      const id = await store.addBookmark('https://test.com', 'Test', '1');
      await store.updateBookmark(id!, { title: 'Updated' });
      
      expect(store.getBookmarkById(id!)?.title).toBe('Updated');
    });

    it('should delete bookmark', async () => {
      const id = await store.addBookmark('https://test.com', 'Test', '1');
      await store.deleteBookmark(id!);
      
      expect(store.getBookmarkById(id!)).toBeUndefined();
    });

    it('should move bookmark', async () => {
      const id = await store.addBookmark('https://test.com', 'Test', '1');
      await store.moveBookmark(id!, '2');
      
      expect(store.getBookmarkById(id!)?.parentId).toBe('2');
    });
  });

  describe('folder CRUD', () => {
    it('should create folder', async () => {
      const id = await store.createFolder('TestFolder', '1');
      
      expect(id).not.toBeNull();
      expect(store.getFolderById(id!)).toBeDefined();
    });

    it('should rename folder', async () => {
      const id = await store.createFolder('TestFolder', '1');
      await store.renameFolder(id!, 'RenamedFolder');
      
      expect(store.getFolderById(id!)?.title).toBe('RenamedFolder');
    });

    it('should delete folder', async () => {
      const id = await store.createFolder('TestFolder', '1');
      await store.deleteFolder(id!);
      
      expect(store.getFolderById(id!)).toBeUndefined();
    });

    it('should move folder', async () => {
      const id = await store.createFolder('TestFolder', '1');
      await store.moveFolder(id!, '2');
      
      expect(store.getFolderById(id!)?.parentId).toBe('2');
    });

    it('should not delete top-level folders', async () => {
      await expect(store.deleteFolder('1')).rejects.toThrow();
    });
  });

  describe('reset and clear', () => {
    it('should reset to initial state', async () => {
      const initialCount = store.bookmarks.length;
      
      await store.addBookmark('https://test.com', 'Test', '1');
      expect(store.bookmarks.length).toBe(initialCount + 1);
      
      store.reset();
      expect(store.bookmarks.length).toBe(initialCount);
    });

    it('should clear all data except top-level folders', () => {
      store.clear();
      
      expect(store.bookmarks.length).toBe(0);
      expect(store.folders.length).toBe(3); // Only top-level folders
    });
  });

  describe('snapshot and restore', () => {
    it('should create and restore snapshot', async () => {
      const snapshot = store.snapshot();
      const initialCount = store.bookmarks.length;
      
      await store.addBookmark('https://test.com', 'Test', '1');
      expect(store.bookmarks.length).toBe(initialCount + 1);
      
      store.restore(snapshot);
      expect(store.bookmarks.length).toBe(initialCount);
    });
  });

  describe('events', () => {
    it('should emit events on operations', async () => {
      const events: string[] = [];
      
      store.on('bookmark:added', () => events.push('added'));
      store.on('bookmark:deleted', () => events.push('deleted'));
      
      const id = await store.addBookmark('https://test.com', 'Test', '1');
      await store.deleteBookmark(id!);
      
      expect(events).toContain('added');
      expect(events).toContain('deleted');
    });
  });

  describe('error mode', () => {
    it('should throw errors when error mode is set', async () => {
      const { ErrorMode } = await import('../mock/types');
      store.setErrorMode(ErrorMode.NOT_FOUND);
      
      await expect(store.addBookmark('https://test.com', 'Test', '1')).rejects.toThrow();
    });

    it('should work normally when error mode is cleared', async () => {
      const { ErrorMode } = await import('../mock/types');
      store.setErrorMode(ErrorMode.NOT_FOUND);
      store.setErrorMode(null);
      
      const id = await store.addBookmark('https://test.com', 'Test', '1');
      expect(id).not.toBeNull();
    });
  });
});
