/**
 * BashExecutor 通配符功能属性测试
 * 
 * Feature: wildcard-pattern-matching
 * 测试向后兼容性和通配符功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { BashExecutor } from '../BashExecutor';
import { MockBookmarkStore } from '../mock/MockBookmarkStore';
import type { AgentContext } from '../types';

describe('BashExecutor Wildcard - Property-Based Tests', () => {
  let executor: BashExecutor;
  let store: MockBookmarkStore;
  let context: AgentContext;

  beforeEach(() => {
    store = new MockBookmarkStore();
    executor = new BashExecutor(store);
    context = {
      cwd: { folderId: null, path: '/' },
      sessionId: 'test-session',
    };
  });

  describe('Property 4: 无通配符时的向后兼容性', () => {
    it('Feature: wildcard-pattern-matching, Property 4: findBookmarks 无通配符时应返回单个匹配或空数组', () => {
      // 添加测试数据
      store.createFolder('开发', '1');
      const devFolderId = store.folders[store.folders.length - 1].chromeId;
      store.addBookmark('https://react.dev', 'React官方文档', devFolderId);
      store.addBookmark('https://vue.dev', 'Vue官方文档', devFolderId);

      fc.assert(
        fc.property(
          fc.constantFrom('React官方文档', 'Vue官方文档', 'Angular', '不存在的书签'),
          (pattern) => {
            // @ts-ignore - 访问私有方法用于测试
            const results = executor['findBookmarks'](pattern, context);
            
            // 无通配符时，应该返回 0 或 1 个结果
            expect(results.length).toBeLessThanOrEqual(1);
            
            // 如果找到结果，标题应该匹配（精确或模糊）
            if (results.length === 1) {
              const title = results[0].title.toLowerCase();
              const patternLower = pattern.toLowerCase();
              expect(title === patternLower || title.includes(patternLower)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 4: findFolders 无通配符时应返回单个匹配或空数组', () => {
      // 添加测试数据
      store.createFolder('开发', '1');
      store.createFolder('学习', '1');
      store.createFolder('工具', '1');

      fc.assert(
        fc.property(
          fc.constantFrom('开发', '学习', '工具', '不存在的文件夹'),
          (pattern) => {
            // @ts-ignore - 访问私有方法用于测试
            const results = executor['findFolders'](pattern, context);
            
            // 无通配符时，应该返回 0 或 1 个结果
            expect(results.length).toBeLessThanOrEqual(1);
            
            // 如果找到结果，标题应该匹配（精确或模糊）
            if (results.length === 1) {
              const title = results[0].title.toLowerCase();
              const patternLower = pattern.toLowerCase();
              expect(title === patternLower || title.includes(patternLower)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 4: 无通配符时行为应与原 findBookmark 一致', () => {
      // 添加测试数据
      store.createFolder('开发', '1');
      const devFolderId = store.folders[store.folders.length - 1].chromeId;
      store.addBookmark('https://react.dev', 'React官方文档', devFolderId);
      store.addBookmark('https://vue.dev', 'Vue官方文档', devFolderId);
      store.addBookmark('https://angular.dev', 'Angular指南', devFolderId);

      fc.assert(
        fc.property(
          fc.constantFrom('React', 'Vue', 'Angular', 'JavaScript'),
          (pattern) => {
            // @ts-ignore - 访问私有方法用于测试
            const singleResult = executor['findBookmark'](pattern, context);
            // @ts-ignore - 访问私有方法用于测试
            const multiResults = executor['findBookmarks'](pattern, context);
            
            // 如果 findBookmark 找到结果，findBookmarks 应该返回包含该结果的数组
            if (singleResult) {
              expect(multiResults.length).toBe(1);
              expect(multiResults[0].chromeId).toBe(singleResult.chromeId);
            } else {
              // 如果 findBookmark 没找到，findBookmarks 也应该返回空数组
              expect(multiResults.length).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 4: 无通配符时行为应与原 findFolder 一致', () => {
      // 添加测试数据
      store.createFolder('开发工具', '1');
      store.createFolder('学习资料', '1');
      store.createFolder('工作文档', '1');

      fc.assert(
        fc.property(
          fc.constantFrom('开发', '学习', '工作', '测试'),
          (pattern) => {
            // @ts-ignore - 访问私有方法用于测试
            const singleResult = executor['findFolder'](pattern, context);
            // @ts-ignore - 访问私有方法用于测试
            const multiResults = executor['findFolders'](pattern, context);
            
            // 如果 findFolder 找到结果，findFolders 应该返回包含该结果的数组
            if (singleResult) {
              expect(multiResults.length).toBe(1);
              expect(multiResults[0].chromeId).toBe(singleResult.chromeId);
            } else {
              // 如果 findFolder 没找到，findFolders 也应该返回空数组
              expect(multiResults.length).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('通配符匹配功能', () => {
    it('应支持 * 通配符匹配多个书签', () => {
      // 添加测试数据
      store.createFolder('开发', '1');
      const devFolderId = store.folders[store.folders.length - 1].chromeId;
      store.addBookmark('https://react.dev', 'React官方文档', devFolderId);
      store.addBookmark('https://reactrouter.com', 'React Router', devFolderId);
      store.addBookmark('https://vue.dev', 'Vue官方文档', devFolderId);

      // @ts-ignore - 访问私有方法用于测试
      const results = executor['findBookmarks']('React*', context);
      
      // 应该至少找到我们添加的 2 个 React 相关书签
      expect(results.length).toBeGreaterThanOrEqual(2);
      // 所有结果都应该以 React 开头（大小写不敏感）
      expect(results.every(r => r.title.toLowerCase().startsWith('react'))).toBe(true);
    });

    it('应支持 ? 通配符匹配单个字符', () => {
      // 添加测试数据
      store.createFolder('版本', '1');
      const versionFolderId = store.folders[store.folders.length - 1].chromeId;
      store.addBookmark('https://v1.example.com', 'v1.0', versionFolderId);
      store.addBookmark('https://v2.example.com', 'v2.0', versionFolderId);
      store.addBookmark('https://v10.example.com', 'v10.0', versionFolderId);

      // @ts-ignore - 访问私有方法用于测试
      const results = executor['findBookmarks']('v?.0', context);
      
      expect(results.length).toBe(2);
      expect(results.map(r => r.title)).toEqual(expect.arrayContaining(['v1.0', 'v2.0']));
    });

    it('应支持 [abc] 字符类匹配', () => {
      // 添加测试数据
      store.createFolder('测试', '1');
      const testFolderId = store.folders[store.folders.length - 1].chromeId;
      store.addBookmark('https://a.example.com', 'a-test', testFolderId);
      store.addBookmark('https://b.example.com', 'b-test', testFolderId);
      store.addBookmark('https://c.example.com', 'c-test', testFolderId);
      store.addBookmark('https://d.example.com', 'd-test', testFolderId);

      // @ts-ignore - 访问私有方法用于测试
      const results = executor['findBookmarks']('[abc]-test', context);
      
      expect(results.length).toBe(3);
      expect(results.map(r => r.title)).toEqual(expect.arrayContaining(['a-test', 'b-test', 'c-test']));
    });
  });
});


describe('Property 6: ls 命令通配符过滤', () => {
  let executor: BashExecutor;
  let store: MockBookmarkStore;
  let context: AgentContext;

  beforeEach(() => {
    store = new MockBookmarkStore();
    executor = new BashExecutor(store);
    context = {
      cwd: { folderId: null, path: '/' },
      sessionId: 'test-session',
    };
  });

  it('Feature: wildcard-pattern-matching, Property 6: ls 应过滤匹配通配符的书签', async () => {
    // 添加测试数据
    store.createFolder('开发', '1');
    const devFolderId = store.folders[store.folders.length - 1].chromeId;
    context.cwd.folderId = devFolderId;
    context.cwd.path = '/开发';
    
    store.addBookmark('https://react.dev', 'React官方文档', devFolderId);
    store.addBookmark('https://reactrouter.com', 'React Router', devFolderId);
    store.addBookmark('https://vue.dev', 'Vue官方文档', devFolderId);
    store.addBookmark('https://angular.dev', 'Angular指南', devFolderId);

    // 使用通配符过滤
    const result = await executor.execute('ls React*', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.items.length).toBe(2);
    expect(result.data?.pattern).toBe('React*');
    expect(result.data?.items.every((item: any) => 
      item.name.toLowerCase().startsWith('react')
    )).toBe(true);
  });

  it('Feature: wildcard-pattern-matching, Property 6: ls 应过滤匹配通配符的文件夹', async () => {
    // 添加测试数据 - 在书签栏下创建文件夹
    const bookmarksBarId = '1';
    store.createFolder('project-a', bookmarksBarId);
    store.createFolder('project-b', bookmarksBarId);
    store.createFolder('project-c', bookmarksBarId);
    store.createFolder('other-folder', bookmarksBarId);
    
    // 切换到书签栏
    context.cwd.folderId = bookmarksBarId;
    context.cwd.path = '/书签栏';

    // 使用通配符过滤
    const result = await executor.execute('ls project-*', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.items.length).toBe(3);
    expect(result.data?.pattern).toBe('project-*');
    expect(result.data?.items.every((item: any) => 
      item.name.toLowerCase().startsWith('project-')
    )).toBe(true);
  });

  it('Feature: wildcard-pattern-matching, Property 6: ls 应同时过滤书签和文件夹', async () => {
    // 添加测试数据
    store.createFolder('test-folder', '1');
    const testFolderId = store.folders[store.folders.length - 1].chromeId;
    context.cwd.folderId = testFolderId;
    context.cwd.path = '/test-folder';
    
    store.createFolder('sub-a', testFolderId);
    store.createFolder('sub-b', testFolderId);
    store.addBookmark('https://sub1.com', 'sub-bookmark-1', testFolderId);
    store.addBookmark('https://sub2.com', 'sub-bookmark-2', testFolderId);
    store.addBookmark('https://other.com', 'other-item', testFolderId);

    // 使用通配符过滤
    const result = await executor.execute('ls sub-*', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.items.length).toBe(4); // 2 folders + 2 bookmarks
    expect(result.data?.pattern).toBe('sub-*');
    expect(result.data?.items.every((item: any) => 
      item.name.toLowerCase().startsWith('sub-')
    )).toBe(true);
  });

  it('Feature: wildcard-pattern-matching, Property 6: ls 无匹配时应返回空结果', async () => {
    store.createFolder('测试', '1');
    const testFolderId = store.folders[store.folders.length - 1].chromeId;
    context.cwd.folderId = testFolderId;
    
    const result = await executor.execute('ls nonexistent-*', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.items.length).toBe(0);
    expect(result.output).toContain('no matches');
  });

  it('Feature: wildcard-pattern-matching, Property 6: ls 无通配符时应保持原有行为', async () => {
    store.createFolder('开发', '1');
    const devFolderId = store.folders[store.folders.length - 1].chromeId;
    context.cwd.folderId = devFolderId;
    
    store.addBookmark('https://test.com', 'test-item', devFolderId);
    store.addBookmark('https://other.com', 'other-item', devFolderId);

    // 不使用通配符
    const result = await executor.execute('ls', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.items.length).toBe(2);
    expect(result.data?.pattern).toBeUndefined();
  });

  it('Feature: wildcard-pattern-matching, Property 6: ls -l 应支持通配符过滤', async () => {
    store.createFolder('开发', '1');
    const devFolderId = store.folders[store.folders.length - 1].chromeId;
    context.cwd.folderId = devFolderId;
    
    store.addBookmark('https://react.dev', 'React官方文档', devFolderId);
    store.addBookmark('https://vue.dev', 'Vue官方文档', devFolderId);

    // 长格式 + 通配符
    const result = await executor.execute('ls -l React*', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.items.length).toBe(1);
    expect(result.output).toContain('React官方文档');
    expect(result.output).toContain('https://react.dev');
  });
});

describe('Property 7: mv 命令批量移动', () => {
  let executor: BashExecutor;
  let store: MockBookmarkStore;
  let context: AgentContext;

  beforeEach(() => {
    store = new MockBookmarkStore();
    executor = new BashExecutor(store);
    context = {
      cwd: { folderId: null, path: '/' },
      sessionId: 'test-session',
    };
  });

  it('Feature: wildcard-pattern-matching, Property 7: mv 应批量移动匹配通配符的书签', async () => {
    // 添加测试数据
    store.createFolder('源文件夹', '1');
    const sourceFolderId = store.folders[store.folders.length - 1].chromeId;
    store.createFolder('目标文件夹', '1');
    const destFolderId = store.folders[store.folders.length - 1].chromeId;
    
    store.addBookmark('https://test1.com', 'test-a', sourceFolderId);
    store.addBookmark('https://test2.com', 'test-b', sourceFolderId);
    store.addBookmark('https://test3.com', 'test-c', sourceFolderId);
    store.addBookmark('https://other.com', 'other-item', sourceFolderId);

    // 使用通配符批量移动
    const result = await executor.execute('mv test-* 目标文件夹', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.movedCount).toBe(3);
    
    // 验证书签已移动到目标文件夹
    const movedBookmarks = store.bookmarks.filter(b => b.parentId === destFolderId);
    expect(movedBookmarks.length).toBe(3);
    expect(movedBookmarks.every(b => b.title.startsWith('test-'))).toBe(true);
    
    // 验证 other-item 仍在源文件夹
    const remainingBookmarks = store.bookmarks.filter(b => b.parentId === sourceFolderId);
    expect(remainingBookmarks.length).toBe(1);
    expect(remainingBookmarks[0].title).toBe('other-item');
  });

  it('Feature: wildcard-pattern-matching, Property 7: mv 应批量移动匹配通配符的文件夹', async () => {
    // 添加测试数据 - 在书签栏下创建文件夹
    const bookmarksBarId = '1';
    store.createFolder('project-a', bookmarksBarId);
    store.createFolder('project-b', bookmarksBarId);
    store.createFolder('project-c', bookmarksBarId);
    store.createFolder('archive', bookmarksBarId);
    const archiveFolderId = store.folders[store.folders.length - 1].chromeId;
    
    // 切换到书签栏
    context.cwd.folderId = bookmarksBarId;
    context.cwd.path = '/书签栏';

    // 使用通配符批量移动
    const result = await executor.execute('mv project-* archive', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.movedCount).toBe(3);
    
    // 验证文件夹已移动到 archive
    const movedFolders = store.folders.filter(f => f.parentId === archiveFolderId);
    expect(movedFolders.length).toBe(3);
    expect(movedFolders.every(f => f.title.startsWith('project-'))).toBe(true);
  });

  it('Feature: wildcard-pattern-matching, Property 7: mv 目标文件夹不存在时应返回错误', async () => {
    store.createFolder('测试', '1');
    const testFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://test.com', 'test-item', testFolderId);

    const result = await executor.execute('mv test-* nonexistent', context);
    
    expect(result.success).toBe(false);
    expect(result.output).toContain('destination folder not found');
  });

  it('Feature: wildcard-pattern-matching, Property 7: mv 无匹配时应返回错误', async () => {
    store.createFolder('目标', '1');
    
    const result = await executor.execute('mv nonexistent-* 目标', context);
    
    expect(result.success).toBe(false);
    expect(result.output).toContain('no matches found');
  });

  it('Feature: wildcard-pattern-matching, Property 7: mv 无通配符时应保持原有行为', async () => {
    // 添加测试数据
    store.createFolder('源', '1');
    const sourceFolderId = store.folders[store.folders.length - 1].chromeId;
    store.createFolder('目标', '1');
    const destFolderId = store.folders[store.folders.length - 1].chromeId;
    
    store.addBookmark('https://single.com', 'single-item', sourceFolderId);

    // 不使用通配符移动
    const result = await executor.execute('mv single-item 目标', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.action).toBe('move');
    expect(result.data?.type).toBe('file');
    
    // 验证书签已移动
    const bookmark = store.bookmarks.find(b => b.title === 'single-item');
    expect(bookmark?.parentId).toBe(destFolderId);
  });

  it('Feature: wildcard-pattern-matching, Property 7: mv 应同时移动匹配的书签和文件夹', async () => {
    // 添加测试数据 - 在书签栏下创建
    const bookmarksBarId = '1';
    store.createFolder('temp-folder', bookmarksBarId);
    const tempFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://temp.com', 'temp-bookmark', bookmarksBarId);
    store.createFolder('archive', bookmarksBarId);
    const archiveFolderId = store.folders[store.folders.length - 1].chromeId;
    
    // 切换到书签栏
    context.cwd.folderId = bookmarksBarId;
    context.cwd.path = '/书签栏';

    // 使用通配符批量移动
    const result = await executor.execute('mv temp-* archive', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.movedCount).toBe(2);
    
    // 验证书签和文件夹都已移动
    const movedBookmark = store.bookmarks.find(b => b.title === 'temp-bookmark');
    const movedFolder = store.folders.find(f => f.title === 'temp-folder');
    expect(movedBookmark?.parentId).toBe(archiveFolderId);
    expect(movedFolder?.parentId).toBe(archiveFolderId);
  });

  it('Feature: wildcard-pattern-matching, Property 7: mv 应跳过移动文件夹到自己', async () => {
    // 添加测试数据
    store.createFolder('self-folder', '1');
    const selfFolderId = store.folders[store.folders.length - 1].chromeId;
    store.createFolder('self-other', '1');

    // 尝试移动到自己（self-folder 匹配 self-*）
    const result = await executor.execute('mv self-* self-folder', context);
    
    expect(result.success).toBe(true);
    // 应该移动 self-other，跳过 self-folder
    expect(result.output).toContain('skipped');
    expect(result.output).toContain('moved folder: self-other');
  });
});

describe('Property 8: find 命令通配符搜索', () => {
  let executor: BashExecutor;
  let store: MockBookmarkStore;
  let context: AgentContext;

  beforeEach(() => {
    store = new MockBookmarkStore();
    executor = new BashExecutor(store);
    context = {
      cwd: { folderId: null, path: '/' },
      sessionId: 'test-session',
    };
  });

  it('Feature: wildcard-pattern-matching, Property 8: find 应支持通配符搜索书签', async () => {
    // 添加测试数据
    store.createFolder('开发', '1');
    const devFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://react.dev', 'React官方文档', devFolderId);
    store.addBookmark('https://reactrouter.com', 'React Router', devFolderId);
    store.addBookmark('https://vue.dev', 'Vue官方文档', devFolderId);

    const result = await executor.execute('find React*', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.items.length).toBeGreaterThanOrEqual(2);
    expect(result.data?.isWildcard).toBe(true);
    expect(result.data?.items.every((item: any) => 
      item.name.toLowerCase().startsWith('react')
    )).toBe(true);
  });

  it('Feature: wildcard-pattern-matching, Property 8: find 应支持通配符搜索文件夹', async () => {
    store.createFolder('project-a', '1');
    store.createFolder('project-b', '1');
    store.createFolder('project-c', '1');
    store.createFolder('other-folder', '1');

    const result = await executor.execute('find project-*', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.items.length).toBeGreaterThanOrEqual(3);
    expect(result.data?.isWildcard).toBe(true);
    expect(result.data?.items.every((item: any) => 
      item.name.toLowerCase().startsWith('project-')
    )).toBe(true);
  });

  it('Feature: wildcard-pattern-matching, Property 8: find 应与 -type 选项正确组合', async () => {
    store.createFolder('test-folder', '1');
    const testFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://test.com', 'test-bookmark', testFolderId);

    // 只搜索文件夹
    const folderResult = await executor.execute('find test-* -type d', context);
    expect(folderResult.success).toBe(true);
    expect(folderResult.data?.items.every((item: any) => item.type === 'directory')).toBe(true);

    // 只搜索书签
    const fileResult = await executor.execute('find test-* -type f', context);
    expect(fileResult.success).toBe(true);
    expect(fileResult.data?.items.every((item: any) => item.type === 'file')).toBe(true);
  });

  it('Feature: wildcard-pattern-matching, Property 8: find 无通配符时应保持原有行为', async () => {
    store.createFolder('开发', '1');
    const devFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://react.dev', 'React官方文档', devFolderId);
    store.addBookmark('https://vue.dev', 'Vue官方文档', devFolderId);

    // 普通关键词搜索
    const result = await executor.execute('find React', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.isWildcard).toBe(false);
    expect(result.data?.items.length).toBeGreaterThanOrEqual(1);
  });

  it('Feature: wildcard-pattern-matching, Property 8: find 应支持 ? 通配符', async () => {
    store.createFolder('版本', '1');
    const versionFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://v1.example.com', 'v1.0', versionFolderId);
    store.addBookmark('https://v2.example.com', 'v2.0', versionFolderId);
    store.addBookmark('https://v10.example.com', 'v10.0', versionFolderId);

    const result = await executor.execute('find v?.0', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.items.length).toBe(2);
    expect(result.data?.items.map((item: any) => item.name)).toEqual(
      expect.arrayContaining(['v1.0', 'v2.0'])
    );
  });

  it('Feature: wildcard-pattern-matching, Property 8: find 应支持 [abc] 字符类', async () => {
    store.createFolder('测试', '1');
    const testFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://a.example.com', 'a-test', testFolderId);
    store.addBookmark('https://b.example.com', 'b-test', testFolderId);
    store.addBookmark('https://c.example.com', 'c-test', testFolderId);
    store.addBookmark('https://d.example.com', 'd-test', testFolderId);

    const result = await executor.execute('find [abc]-test', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.items.length).toBe(3);
    expect(result.data?.items.map((item: any) => item.name)).toEqual(
      expect.arrayContaining(['a-test', 'b-test', 'c-test'])
    );
  });
});

describe('Property 9: cp 命令批量复制', () => {
  let executor: BashExecutor;
  let store: MockBookmarkStore;
  let context: AgentContext;

  beforeEach(() => {
    store = new MockBookmarkStore();
    executor = new BashExecutor(store);
    context = {
      cwd: { folderId: null, path: '/' },
      sessionId: 'test-session',
    };
  });

  it('Feature: wildcard-pattern-matching, Property 9: cp 应批量复制匹配通配符的书签', async () => {
    // 添加测试数据
    store.createFolder('源文件夹', '1');
    const sourceFolderId = store.folders[store.folders.length - 1].chromeId;
    store.createFolder('目标文件夹', '1');
    const destFolderId = store.folders[store.folders.length - 1].chromeId;
    
    store.addBookmark('https://test1.com', 'test-a', sourceFolderId);
    store.addBookmark('https://test2.com', 'test-b', sourceFolderId);
    store.addBookmark('https://test3.com', 'test-c', sourceFolderId);
    store.addBookmark('https://other.com', 'other-item', sourceFolderId);

    const initialCount = store.bookmarks.length;

    // 使用通配符批量复制
    const result = await executor.execute('cp test-* 目标文件夹', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.copiedCount).toBe(3);
    
    // 验证书签已复制到目标文件夹
    const copiedBookmarks = store.bookmarks.filter(b => b.parentId === destFolderId);
    expect(copiedBookmarks.length).toBe(3);
    expect(copiedBookmarks.every(b => b.title.startsWith('test-'))).toBe(true);
    
    // 验证原书签仍在源文件夹（复制不是移动）
    const sourceBookmarks = store.bookmarks.filter(b => b.parentId === sourceFolderId);
    expect(sourceBookmarks.length).toBe(4);
    
    // 总数应该增加
    expect(store.bookmarks.length).toBe(initialCount + 3);
  });

  it('Feature: wildcard-pattern-matching, Property 9: cp 目标文件夹不存在时应返回错误', async () => {
    store.createFolder('测试', '1');
    const testFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://test.com', 'test-item', testFolderId);

    const result = await executor.execute('cp test-* nonexistent', context);
    
    expect(result.success).toBe(false);
    expect(result.output).toContain('destination folder not found');
  });

  it('Feature: wildcard-pattern-matching, Property 9: cp 无匹配时应返回错误', async () => {
    store.createFolder('目标', '1');
    
    const result = await executor.execute('cp nonexistent-* 目标', context);
    
    expect(result.success).toBe(false);
    expect(result.output).toContain('no matches found');
  });

  it('Feature: wildcard-pattern-matching, Property 9: cp 无通配符时应保持原有行为', async () => {
    // 添加测试数据
    store.createFolder('源', '1');
    const sourceFolderId = store.folders[store.folders.length - 1].chromeId;
    store.createFolder('目标', '1');
    const destFolderId = store.folders[store.folders.length - 1].chromeId;
    
    store.addBookmark('https://single.com', 'single-item', sourceFolderId);

    const initialCount = store.bookmarks.length;

    // 不使用通配符复制
    const result = await executor.execute('cp single-item 目标', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.newId).toBeDefined();
    
    // 验证书签已复制
    const copiedBookmark = store.bookmarks.find(b => 
      b.title === 'single-item' && b.parentId === destFolderId
    );
    expect(copiedBookmark).toBeDefined();
    
    // 原书签仍存在
    const originalBookmark = store.bookmarks.find(b => 
      b.title === 'single-item' && b.parentId === sourceFolderId
    );
    expect(originalBookmark).toBeDefined();
    
    // 总数增加 1
    expect(store.bookmarks.length).toBe(initialCount + 1);
  });

  it('Feature: wildcard-pattern-matching, Property 9: cp 应支持 ? 和 [abc] 通配符', async () => {
    store.createFolder('源', '1');
    const sourceFolderId = store.folders[store.folders.length - 1].chromeId;
    store.createFolder('目标', '1');
    const destFolderId = store.folders[store.folders.length - 1].chromeId;
    
    store.addBookmark('https://a.com', 'a-test', sourceFolderId);
    store.addBookmark('https://b.com', 'b-test', sourceFolderId);
    store.addBookmark('https://c.com', 'c-test', sourceFolderId);
    store.addBookmark('https://d.com', 'd-test', sourceFolderId);

    // 使用字符类通配符
    const result = await executor.execute('cp [abc]-test 目标', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.copiedCount).toBe(3);
    
    const copiedBookmarks = store.bookmarks.filter(b => b.parentId === destFolderId);
    expect(copiedBookmarks.length).toBe(3);
    expect(copiedBookmarks.map(b => b.title)).toEqual(
      expect.arrayContaining(['a-test', 'b-test', 'c-test'])
    );
  });
});

describe('Property 5: rm 命令批量删除', () => {
  let executor: BashExecutor;
  let store: MockBookmarkStore;
  let context: AgentContext;

  beforeEach(() => {
    store = new MockBookmarkStore();
    executor = new BashExecutor(store);
    context = {
      cwd: { folderId: null, path: '/' },
      sessionId: 'test-session',
    };
  });

  it('Feature: wildcard-pattern-matching, Property 5: rm 应删除所有匹配通配符的书签', async () => {
    // 添加测试数据
    store.createFolder('测试', '1');
    const testFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://test1.com', 'test-a', testFolderId);
    store.addBookmark('https://test2.com', 'test-b', testFolderId);
    store.addBookmark('https://test3.com', 'test-c', testFolderId);
    store.addBookmark('https://other.com', 'other-item', testFolderId);

    const initialCount = store.bookmarks.length;
    
    // 使用通配符删除
    const result = await executor.execute('rm test-*', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.deletedCount).toBe(3);
    expect(store.bookmarks.length).toBe(initialCount - 3);
    
    // 验证 other-item 仍然存在
    expect(store.bookmarks.some(b => b.title === 'other-item')).toBe(true);
  });

  it('Feature: wildcard-pattern-matching, Property 5: rm 应删除所有匹配通配符的文件夹', async () => {
    // 添加测试数据
    store.createFolder('project-a', '1');
    store.createFolder('project-b', '1');
    store.createFolder('project-c', '1');
    store.createFolder('other-folder', '1');

    const initialCount = store.folders.length;
    
    // 使用通配符删除
    const result = await executor.execute('rm project-*', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.deletedCount).toBe(3);
    expect(store.folders.length).toBe(initialCount - 3);
    
    // 验证 other-folder 仍然存在
    expect(store.folders.some(f => f.title === 'other-folder')).toBe(true);
  });

  it('Feature: wildcard-pattern-matching, Property 5: rm 无匹配时应返回错误', async () => {
    const result = await executor.execute('rm nonexistent-*', context);
    
    expect(result.success).toBe(false);
    expect(result.output).toContain('no matches found');
  });

  it('Feature: wildcard-pattern-matching, Property 5: rm 无通配符时应保持原有行为', async () => {
    // 添加测试数据
    store.createFolder('测试', '1');
    const testFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://single.com', 'single-item', testFolderId);

    const initialCount = store.bookmarks.length;
    
    // 不使用通配符删除
    const result = await executor.execute('rm single-item', context);
    
    expect(result.success).toBe(true);
    expect(store.bookmarks.length).toBe(initialCount - 1);
  });

  it('Feature: wildcard-pattern-matching, Property 5: rm 应同时删除匹配的书签和文件夹', async () => {
    // 添加测试数据
    store.createFolder('temp-folder', '1');
    const tempFolderId = store.folders[store.folders.length - 1].chromeId;
    store.addBookmark('https://temp.com', 'temp-bookmark', tempFolderId);

    const initialBookmarkCount = store.bookmarks.length;
    const initialFolderCount = store.folders.length;
    
    // 使用通配符删除
    const result = await executor.execute('rm temp-*', context);
    
    expect(result.success).toBe(true);
    expect(result.data?.deletedCount).toBe(2);
    expect(store.bookmarks.length).toBe(initialBookmarkCount - 1);
    expect(store.folders.length).toBe(initialFolderCount - 1);
  });
});
