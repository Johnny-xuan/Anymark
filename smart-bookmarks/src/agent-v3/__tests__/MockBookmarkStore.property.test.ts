/**
 * MockBookmarkStore 属性测试
 * 
 * 使用 fast-check 进行属性测试，验证 MockBookmarkStore 的正确性属性
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { MockBookmarkStore } from '../mock/MockBookmarkStore';
import { ErrorMode } from '../mock/types';
import { BashExecutor } from '../BashExecutor';
import { setupMockEnvironment, teardownMockEnvironment } from '../mock';
import type { AgentContext } from '../types';

// ============ 辅助生成器 ============

// 生成有效的书签数据
const bookmarkDataArb = fc.record({
  url: fc.webUrl(),
  title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
});

// 生成有效的文件夹名称（排除特殊字符）
const folderNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0 && !s.includes('/') && !s.includes('"') && !s.includes("'") && /^[a-zA-Z0-9\u4e00-\u9fa5\s_-]+$/.test(s));

// 生成有效的父文件夹 ID（顶级文件夹）
const parentIdArb = fc.constantFrom('1', '2', '3');

// ============ Property 1: CRUD Operations Preserve Data Integrity ============

describe('Property 1: CRUD Operations Preserve Data Integrity', () => {
  /**
   * **Validates: Requirements 1.3, 1.4**
   */
  
  it('添加书签后应该能通过 ID 检索到', async () => {
    await fc.assert(
      fc.asyncProperty(bookmarkDataArb, parentIdArb, async (data, parentId) => {
        const store = new MockBookmarkStore();
        store.clear();
        
        const id = await store.addBookmark(data.url, data.title, parentId);
        expect(id).not.toBeNull();
        
        const retrieved = store.getBookmarkById(id!);
        expect(retrieved).toBeDefined();
        expect(retrieved?.url).toBe(data.url);
        expect(retrieved?.title).toBe(data.title);
        expect(retrieved?.parentId).toBe(parentId);
      }),
      { numRuns: 50 }
    );
  });

  it('更新书签后应该反映变更', async () => {
    await fc.assert(
      fc.asyncProperty(
        bookmarkDataArb,
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        async (data, newTitle) => {
          const store = new MockBookmarkStore();
          store.clear();
          
          const id = await store.addBookmark(data.url, data.title, '1');
          await store.updateBookmark(id!, { title: newTitle });
          
          const retrieved = store.getBookmarkById(id!);
          expect(retrieved?.title).toBe(newTitle);
          expect(retrieved?.url).toBe(data.url); // URL 不变
        }
      ),
      { numRuns: 50 }
    );
  });

  it('删除书签后应该无法检索', async () => {
    await fc.assert(
      fc.asyncProperty(bookmarkDataArb, async (data) => {
        const store = new MockBookmarkStore();
        store.clear();
        
        const id = await store.addBookmark(data.url, data.title, '1');
        expect(store.getBookmarkById(id!)).toBeDefined();
        
        await store.deleteBookmark(id!);
        expect(store.getBookmarkById(id!)).toBeUndefined();
      }),
      { numRuns: 50 }
    );
  });

  it('移动书签后 parentId 应该更新', async () => {
    await fc.assert(
      fc.asyncProperty(
        bookmarkDataArb,
        fc.constantFrom('1', '2'),
        fc.constantFrom('2', '3'),
        async (data, fromFolder, toFolder) => {
          fc.pre(fromFolder !== toFolder);
          
          const store = new MockBookmarkStore();
          store.clear();
          
          const id = await store.addBookmark(data.url, data.title, fromFolder);
          await store.moveBookmark(id!, toFolder);
          
          const retrieved = store.getBookmarkById(id!);
          expect(retrieved?.parentId).toBe(toFolder);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ============ Property 2 & 3: Bookmark Data Structure & Unique ID ============

describe('Property 2 & 3: Bookmark Data Structure Completeness & Unique ID', () => {
  /**
   * **Validates: Requirements 2.1-2.6**
   */
  
  it('所有书签应包含必需字段', () => {
    const store = new MockBookmarkStore();
    
    for (const bookmark of store.bookmarks) {
      // 基础字段
      expect(bookmark.chromeId).toBeDefined();
      expect(typeof bookmark.chromeId).toBe('string');
      expect(bookmark.url).toBeDefined();
      expect(bookmark.title).toBeDefined();
      expect(bookmark.parentId).toBeDefined();
      expect(bookmark.dateAdded).toBeDefined();
      
      // AI 字段
      expect(Array.isArray(bookmark.aiTags)).toBe(true);
      expect(Array.isArray(bookmark.aiTechStack)).toBe(true);
      
      // 用户字段
      expect(Array.isArray(bookmark.userTags)).toBe(true);
      expect(typeof bookmark.starred).toBe('boolean');
      expect(typeof bookmark.pinned).toBe('boolean');
      
      // 统计字段
      expect(bookmark.analytics).toBeDefined();
      expect(typeof bookmark.analytics.visitCount).toBe('number');
      expect(typeof bookmark.analytics.importance).toBe('number');
      
      // 状态
      expect(['active', 'archived', 'deleted']).toContain(bookmark.status);
    }
  });

  it('所有生成的 chromeId 应该唯一', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 20 }),
        async (count) => {
          const store = new MockBookmarkStore();
          store.clear();
          
          const ids: string[] = [];
          for (let i = 0; i < count; i++) {
            const id = await store.addBookmark(`https://test${i}.com`, `Test ${i}`, '1');
            if (id) ids.push(id);
          }
          
          // 所有 ID 应该唯一
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============ Property 4: Folder Structure Integrity ============

describe('Property 4: Folder Structure Integrity', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.5**
   */
  
  it('所有文件夹应包含必需字段', () => {
    const store = new MockBookmarkStore();
    
    for (const folder of store.folders) {
      expect(folder.chromeId).toBeDefined();
      expect(folder.title).toBeDefined();
      expect(folder.parentId).toBeDefined();
      expect(folder.path).toBeDefined();
      expect(folder.dateAdded).toBeDefined();
      expect(typeof folder.bookmarkCount).toBe('number');
      expect(typeof folder.subfolderCount).toBe('number');
    }
  });

  it('bookmarkCount 应该等于实际子书签数量', () => {
    const store = new MockBookmarkStore();
    
    for (const folder of store.folders) {
      const actualCount = store.bookmarks.filter(b => b.parentId === folder.chromeId).length;
      expect(folder.bookmarkCount).toBe(actualCount);
    }
  });

  it('subfolderCount 应该等于实际子文件夹数量', () => {
    const store = new MockBookmarkStore();
    
    for (const folder of store.folders) {
      const actualCount = store.folders.filter(f => f.parentId === folder.chromeId).length;
      expect(folder.subfolderCount).toBe(actualCount);
    }
  });
});

// ============ Property 7: Reset Round-Trip ============

describe('Property 7: Reset Round-Trip', () => {
  /**
   * **Validates: Requirements 6.1, 6.4, 1.7**
   */
  
  it('reset 后应该恢复到初始状态', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (operationCount) => {
          const store = new MockBookmarkStore();
          const initialBookmarkCount = store.bookmarks.length;
          const initialFolderCount = store.folders.length;
          
          // 执行一些操作
          for (let i = 0; i < operationCount; i++) {
            await store.addBookmark(`https://test${i}.com`, `Test ${i}`, '1');
          }
          
          expect(store.bookmarks.length).toBe(initialBookmarkCount + operationCount);
          
          // Reset
          store.reset();
          
          expect(store.bookmarks.length).toBe(initialBookmarkCount);
          expect(store.folders.length).toBe(initialFolderCount);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============ Property 8: Snapshot/Restore Round-Trip ============

describe('Property 8: Snapshot/Restore Round-Trip', () => {
  /**
   * **Validates: Requirements 6.5**
   */
  
  it('snapshot/restore 应该保持状态一致', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (addCount) => {
          const store = new MockBookmarkStore();
          
          // 添加一些书签
          for (let i = 0; i < addCount; i++) {
            await store.addBookmark(`https://snap${i}.com`, `Snap ${i}`, '1');
          }
          
          // 创建快照
          const snapshot = store.snapshot();
          const bookmarkCountBefore = store.bookmarks.length;
          const folderCountBefore = store.folders.length;
          
          // 修改状态
          await store.addBookmark('https://after.com', 'After Snapshot', '1');
          await store.createFolder('AfterFolder', '1');
          
          expect(store.bookmarks.length).toBe(bookmarkCountBefore + 1);
          
          // 恢复快照
          store.restore(snapshot);
          
          expect(store.bookmarks.length).toBe(bookmarkCountBefore);
          expect(store.folders.length).toBe(folderCountBefore);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============ Property 10: Event Emission ============

describe('Property 10: Event Emission', () => {
  /**
   * **Validates: Requirements 7.5**
   */
  
  it('状态变更操作应该发射对应事件', async () => {
    await fc.assert(
      fc.asyncProperty(bookmarkDataArb, async (data) => {
        const store = new MockBookmarkStore();
        store.clear();
        
        const events: string[] = [];
        store.on('bookmark:added', () => events.push('added'));
        store.on('bookmark:updated', () => events.push('updated'));
        store.on('bookmark:deleted', () => events.push('deleted'));
        store.on('bookmark:moved', () => events.push('moved'));
        
        const id = await store.addBookmark(data.url, data.title, '1');
        expect(events).toContain('added');
        
        await store.updateBookmark(id!, { title: 'Updated' });
        expect(events).toContain('updated');
        
        await store.moveBookmark(id!, '2');
        expect(events).toContain('moved');
        
        await store.deleteBookmark(id!);
        expect(events).toContain('deleted');
      }),
      { numRuns: 20 }
    );
  });
});

// ============ Property 11: Error Mode Simulation ============

describe('Property 11: Error Mode Simulation', () => {
  /**
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.5**
   */
  
  it('错误模式启用时操作应该抛出错误', async () => {
    const errorModes = [
      ErrorMode.NOT_FOUND,
      ErrorMode.PERMISSION_DENIED,
      ErrorMode.OPERATION_FAILED,
      ErrorMode.NETWORK_ERROR,
    ];
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...errorModes),
        bookmarkDataArb,
        async (errorMode, data) => {
          const store = new MockBookmarkStore();
          store.setErrorMode(errorMode);
          
          await expect(store.addBookmark(data.url, data.title, '1')).rejects.toThrow();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('错误模式清除后操作应该正常', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...Object.values(ErrorMode)),
        bookmarkDataArb,
        async (errorMode, data) => {
          const store = new MockBookmarkStore();
          store.clear();
          
          store.setErrorMode(errorMode);
          store.setErrorMode(null); // 清除错误模式
          
          const id = await store.addBookmark(data.url, data.title, '1');
          expect(id).not.toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============ Property 12: Toggle Starred Round-Trip ============

describe('Property 12: Toggle Starred Round-Trip', () => {
  /**
   * **Validates: Requirements 1.5**
   */
  
  it('toggleStarred 两次应该恢复原始状态', async () => {
    await fc.assert(
      fc.asyncProperty(bookmarkDataArb, async (data) => {
        const store = new MockBookmarkStore();
        store.clear();
        
        const id = await store.addBookmark(data.url, data.title, '1');
        const originalStarred = store.getBookmarkById(id!)?.starred;
        
        await store.toggleStarred(id!);
        expect(store.getBookmarkById(id!)?.starred).toBe(!originalStarred);
        
        await store.toggleStarred(id!);
        expect(store.getBookmarkById(id!)?.starred).toBe(originalStarred);
      }),
      { numRuns: 30 }
    );
  });
});

// ============ Property 6: BashExecutor Command Execution ============

describe('Property 6: BashExecutor Command Execution', () => {
  /**
   * **Validates: Requirements 4.1-4.14**
   */
  
  let mockStore: MockBookmarkStore;
  let executor: BashExecutor;
  let context: AgentContext;

  beforeEach(() => {
    const env = setupMockEnvironment();
    mockStore = env.mockStore;
    executor = new BashExecutor(mockStore);
    context = env.context;
  });

  it('ls 命令应该返回当前目录内容', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('/', '书签栏', '其他书签'),
        async (path) => {
          // Reset context
          context.cwd = { folderId: null, path: '/' };
          
          if (path !== '/') {
            await executor.execute(`cd ${path}`, context);
          }
          
          const result = await executor.execute('ls', context);
          expect(result.success).toBe(true);
          expect(result.data?.items).toBeDefined();
        }
      ),
      { numRuns: 10 }
    );
  });

  it('mkdir 后 ls 应该能看到新文件夹', async () => {
    await fc.assert(
      fc.asyncProperty(folderNameArb, async (folderName) => {
        // Reset
        mockStore.reset();
        context.cwd = { folderId: null, path: '/' };
        
        await executor.execute('cd 书签栏', context);
        const mkdirResult = await executor.execute(`mkdir "${folderName}"`, context);
        
        if (mkdirResult.success) {
          const lsResult = await executor.execute('ls', context);
          expect(lsResult.output).toContain(folderName);
        }
      }),
      { numRuns: 20 }
    );
  });

  it('find 命令应该返回匹配结果', async () => {
    const result = await executor.execute('find React', context);
    expect(result.success).toBe(true);
    expect(result.data?.items?.length).toBeGreaterThan(0);
  });

  it('wc 命令应该返回正确的统计', async () => {
    const result = await executor.execute('wc', context);
    expect(result.success).toBe(true);
    expect(result.data?.bookmarks).toBe(mockStore.bookmarks.length);
    expect(result.data?.folders).toBe(mockStore.folders.length);
  });
});

// ============ Fixture 数据验证 ============

describe('Property: Fixture Data Validation', () => {
  /**
   * **Validates: Requirements 5.1, 5.2**
   */
  
  it('DEFAULT_FIXTURE 应该包含足够的测试数据', () => {
    const store = new MockBookmarkStore();
    
    // 至少 50 个书签
    expect(store.bookmarks.length).toBeGreaterThanOrEqual(50);
    
    // 至少 10 个文件夹（不含顶级）
    const nonTopLevelFolders = store.folders.filter(f => !['1', '2', '3'].includes(f.chromeId));
    expect(nonTopLevelFolders.length).toBeGreaterThanOrEqual(10);
    
    // 应该有星标书签
    const starredBookmarks = store.bookmarks.filter(b => b.starred);
    expect(starredBookmarks.length).toBeGreaterThan(0);
    
    // 应该有带 AI 摘要的书签
    const withSummary = store.bookmarks.filter(b => b.aiSummary);
    expect(withSummary.length).toBeGreaterThan(0);
    
    // 应该有带标签的书签
    const withTags = store.bookmarks.filter(b => b.aiTags && b.aiTags.length > 0);
    expect(withTags.length).toBeGreaterThan(0);
  });
});
