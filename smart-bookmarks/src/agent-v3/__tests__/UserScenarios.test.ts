/**
 * 用户真实场景测试
 * 
 * 模拟用户实际会执行的书签管理任务，测试 BashExecutor 的鲁棒性和效率
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BashExecutor } from '../BashExecutor';
import { MockBookmarkStore, setupMockEnvironment } from '../mock';
import type { AgentContext } from '../types';

describe('用户真实场景测试', () => {
  let store: MockBookmarkStore;
  let executor: BashExecutor;
  let ctx: AgentContext;

  beforeEach(() => {
    const env = setupMockEnvironment();
    store = env.mockStore;
    executor = new BashExecutor(store);
    ctx = env.context;
  });

  // ============ 场景 1: 整理混乱的书签 ============
  describe('场景1: 整理混乱的书签', () => {
    it('用户要求：把所有 React 相关的书签移动到一个新文件夹', async () => {
      // 1. 创建目标文件夹
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir React收藏', ctx);
      
      // 2. 搜索所有 React 相关书签
      const findResult = await executor.execute('find React -type f', ctx);
      expect(findResult.success).toBe(true);
      const reactBookmarks = findResult.data?.items || [];
      expect(reactBookmarks.length).toBeGreaterThan(0);
      
      // 3. 移动每个书签到新文件夹
      let movedCount = 0;
      for (const bm of reactBookmarks.slice(0, 5)) { // 限制数量提高效率
        const mvResult = await executor.execute(`mv "${bm.name}" React收藏`, ctx);
        if (mvResult.success) movedCount++;
      }
      
      // 4. 验证结果
      await executor.execute('cd React收藏', ctx);
      const lsResult = await executor.execute('ls', ctx);
      expect(lsResult.data?.items?.length).toBeGreaterThan(0);
      expect(movedCount).toBeGreaterThan(0);
    });

    it('用户要求：删除所有重复的书签（同名书签）', async () => {
      // 先添加一些重复书签
      await store.addBookmark('https://duplicate1.com', 'Duplicate Test', '1');
      await store.addBookmark('https://duplicate2.com', 'Duplicate Test', '1');
      await store.addBookmark('https://duplicate3.com', 'Duplicate Test', '1');
      
      // 搜索重复书签
      const findResult = await executor.execute('find "Duplicate Test" -type f', ctx);
      const duplicates = findResult.data?.items || [];
      expect(duplicates.length).toBe(3);
      
      // 保留第一个，删除其他
      for (let i = 1; i < duplicates.length; i++) {
        await executor.execute(`rm "${duplicates[i].name}"`, ctx);
      }
      
      // 验证只剩一个
      const verifyResult = await executor.execute('find "Duplicate Test" -type f', ctx);
      expect(verifyResult.data?.items?.length).toBe(1);
    });
  });

  // ============ 场景 2: 按技术栈分类 ============
  describe('场景2: 按技术栈分类书签', () => {
    it('用户要求：创建前端框架分类结构并整理', async () => {
      await executor.execute('cd 书签栏', ctx);
      
      // 创建分类结构
      await executor.execute('mkdir 前端框架', ctx);
      await executor.execute('cd 前端框架', ctx);
      await executor.execute('mkdir React', ctx);
      await executor.execute('mkdir Vue', ctx);
      await executor.execute('mkdir Angular', ctx);
      await executor.execute('cd ..', ctx);
      
      // 验证结构
      await executor.execute('cd 前端框架', ctx);
      const lsResult = await executor.execute('ls', ctx);
      expect(lsResult.output).toContain('React');
      expect(lsResult.output).toContain('Vue');
      expect(lsResult.output).toContain('Angular');
      
      // 查看树形结构
      const treeResult = await executor.execute('tree 2', ctx);
      expect(treeResult.success).toBe(true);
    });

    it('用户要求：找出所有 TypeScript 相关资源', async () => {
      const result = await executor.execute('find typescript', ctx);
      expect(result.success).toBe(true);
      
      // 应该能找到带 typescript 标签的书签
      const items = result.data?.items || [];
      expect(items.length).toBeGreaterThan(0);
    });
  });

  // ============ 场景 3: 星标管理 ============
  describe('场景3: 星标书签管理', () => {
    it('用户要求：列出所有星标书签', async () => {
      const result = await executor.execute('find -starred', ctx);
      expect(result.success).toBe(true);
      
      const starred = result.data?.items || [];
      expect(starred.length).toBeGreaterThan(0);
      expect(starred.every(item => item.starred === true)).toBe(true);
    });

    it('用户要求：给所有 GitHub 书签加星标', async () => {
      // 找到所有 GitHub 书签
      const findResult = await executor.execute('find github -type f', ctx);
      const githubBookmarks = findResult.data?.items || [];
      
      // 给每个加星标
      for (const bm of githubBookmarks.slice(0, 3)) {
        if (!bm.starred) {
          await executor.execute(`star "${bm.name}"`, ctx);
        }
      }
      
      // 验证
      const verifyResult = await executor.execute('find -starred', ctx);
      expect(verifyResult.data?.items?.length).toBeGreaterThan(0);
    });

    it('用户要求：取消所有星标', async () => {
      // 获取所有星标书签
      const starredResult = await executor.execute('find -starred', ctx);
      const starred = starredResult.data?.items || [];
      
      // 取消星标
      for (const bm of starred.slice(0, 5)) {
        await executor.execute(`star "${bm.name}"`, ctx);
      }
      
      // 部分应该被取消了
      const afterResult = await executor.execute('find -starred', ctx);
      expect(afterResult.data?.items?.length).toBeLessThan(starred.length);
    });
  });

  // ============ 场景 4: 批量操作 ============
  describe('场景4: 批量操作', () => {
    it('用户要求：统计各文件夹的书签数量', async () => {
      // 根目录统计
      const rootWc = await executor.execute('wc', ctx);
      expect(rootWc.success).toBe(true);
      expect(rootWc.data?.bookmarks).toBeGreaterThan(0);
      
      // 书签栏统计
      await executor.execute('cd 书签栏', ctx);
      const barWc = await executor.execute('wc', ctx);
      expect(barWc.success).toBe(true);
      
      // Development 文件夹统计
      await executor.execute('cd Development', ctx);
      const devWc = await executor.execute('wc', ctx);
      expect(devWc.success).toBe(true);
    });

    it('用户要求：复制重要书签到备份文件夹', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir 重要备份', ctx);
      
      // 找星标书签并复制
      const starredResult = await executor.execute('find -starred', ctx);
      const starred = starredResult.data?.items || [];
      
      let copiedCount = 0;
      for (const bm of starred.slice(0, 3)) {
        const cpResult = await executor.execute(`cp "${bm.name}" 重要备份`, ctx);
        if (cpResult.success) copiedCount++;
      }
      
      // 验证备份文件夹有内容
      await executor.execute('cd 重要备份', ctx);
      const lsResult = await executor.execute('ls', ctx);
      expect(lsResult.data?.items?.length).toBe(copiedCount);
    });

    it('用户要求：清理空文件夹', async () => {
      // 创建一些空文件夹
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir 空文件夹1', ctx);
      await executor.execute('mkdir 空文件夹2', ctx);
      
      // 验证是空的
      await executor.execute('cd 空文件夹1', ctx);
      const lsResult = await executor.execute('ls', ctx);
      expect(lsResult.output).toBe('(empty)');
      
      // 删除空文件夹
      await executor.execute('cd ..', ctx);
      await executor.execute('rm 空文件夹1', ctx);
      await executor.execute('rm 空文件夹2', ctx);
      
      // 验证删除成功
      const findResult = await executor.execute('find 空文件夹1 -type d', ctx);
      expect(findResult.output).toBe('no results');
    });
  });

  // ============ 场景 5: 搜索和导航 ============
  describe('场景5: 高级搜索和导航', () => {
    it('用户要求：找到所有文档类书签', async () => {
      const result = await executor.execute('find documentation', ctx);
      expect(result.success).toBe(true);
    });

    it('用户要求：查看某个书签的详细信息', async () => {
      const statResult = await executor.execute('stat "React Documentation"', ctx);
      expect(statResult.success).toBe(true);
      expect(statResult.output).toContain('type:\tfile');
      expect(statResult.output).toContain('url:');
      expect(statResult.output).toContain('starred:');
    });

    it('用户要求：查看书签内容和摘要', async () => {
      const catResult = await executor.execute('cat "React Documentation"', ctx);
      expect(catResult.success).toBe(true);
      expect(catResult.output).toContain('https://');
    });

    it('用户要求：在深层目录中导航', async () => {
      // 导航到深层目录
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('cd Development', ctx);
      await executor.execute('cd Frontend', ctx);
      await executor.execute('cd React', ctx);
      
      // 验证路径
      const pwdResult = await executor.execute('pwd', ctx);
      expect(pwdResult.output).toContain('React');
      
      // 返回根目录
      await executor.execute('cd /', ctx);
      const rootPwd = await executor.execute('pwd', ctx);
      expect(rootPwd.output).toBe('/');
    });
  });

  // ============ 场景 6: 重命名和整理 ============
  describe('场景6: 重命名和整理', () => {
    it('用户要求：重命名书签使其更易识别', async () => {
      // 先添加一个测试书签
      await store.addBookmark('https://example.com/long-url', 'Some Long Title That Is Hard To Read', '1');
      
      // 重命名
      const mvResult = await executor.execute('mv "Some Long Title" "简短标题"', ctx);
      expect(mvResult.success).toBe(true);
      expect(mvResult.output).toContain('renamed');
      
      // 验证
      const findResult = await executor.execute('find 简短标题', ctx);
      expect(findResult.data?.items?.length).toBe(1);
    });

    it('用户要求：重命名文件夹', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir 旧名称', ctx);
      
      const mvResult = await executor.execute('mv 旧名称 新名称', ctx);
      expect(mvResult.success).toBe(true);
      expect(mvResult.output).toContain('renamed folder');
      
      // 验证
      const lsResult = await executor.execute('ls', ctx);
      expect(lsResult.output).toContain('新名称');
      expect(lsResult.output).not.toContain('旧名称');
    });
  });

  // ============ 场景 7: 错误处理 ============
  describe('场景7: 错误处理和边界情况', () => {
    it('用户尝试删除不存在的书签', async () => {
      const result = await executor.execute('rm "不存在的书签12345"', ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });

    it('用户尝试进入不存在的文件夹', async () => {
      const result = await executor.execute('cd "不存在的文件夹"', ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain('error');
    });

    it('用户尝试移动书签到不存在的文件夹', async () => {
      const result = await executor.execute('mv "React Documentation" "不存在的目标"', ctx);
      // 如果目标不是文件夹，会被当作重命名
      expect(result.success).toBe(true);
      expect(result.output).toContain('renamed');
    });

    it('用户执行未知命令', async () => {
      const result = await executor.execute('unknowncommand arg1 arg2', ctx);
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(127);
    });

    it('用户执行空命令', async () => {
      const result = await executor.execute('', ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBe('');
    });
  });

  // ============ 场景 8: 复杂工作流 ============
  describe('场景8: 复杂工作流', () => {
    it('用户要求：整理书签并生成报告', async () => {
      // 1. 统计总数
      const totalWc = await executor.execute('wc', ctx);
      const totalBookmarks = totalWc.data?.bookmarks;
      const totalFolders = totalWc.data?.folders;
      
      // 2. 统计星标
      const starredResult = await executor.execute('find -starred', ctx);
      const starredCount = starredResult.data?.items?.length || 0;
      
      // 3. 查看目录结构
      const treeResult = await executor.execute('tree 2', ctx);
      
      // 4. 验证报告数据
      expect(totalBookmarks).toBeGreaterThan(0);
      expect(totalFolders).toBeGreaterThan(0);
      expect(starredCount).toBeGreaterThan(0);
      expect(treeResult.success).toBe(true);
    });

    it('用户要求：创建项目书签集合', async () => {
      await executor.execute('cd 书签栏', ctx);
      
      // 创建项目结构
      await executor.execute('mkdir MyProject', ctx);
      await executor.execute('cd MyProject', ctx);
      await executor.execute('mkdir 文档', ctx);
      await executor.execute('mkdir 工具', ctx);
      await executor.execute('mkdir 参考', ctx);
      
      // 复制相关书签
      const docsResult = await executor.execute('find documentation -type f -limit 2', ctx);
      for (const doc of (docsResult.data?.items || []).slice(0, 2)) {
        await executor.execute(`cp "${doc.name}" 文档`, ctx);
      }
      
      // 验证结构
      const treeResult = await executor.execute('tree', ctx);
      expect(treeResult.output).toContain('文档');
      expect(treeResult.output).toContain('工具');
      expect(treeResult.output).toContain('参考');
    });
  });
});


// ============ 性能和效率测试 ============
describe('性能和效率测试', () => {
  let store: MockBookmarkStore;
  let executor: BashExecutor;
  let ctx: AgentContext;

  beforeEach(() => {
    const env = setupMockEnvironment();
    store = env.mockStore;
    executor = new BashExecutor(store);
    ctx = env.context;
  });

  it('批量搜索效率：连续执行 20 次搜索', async () => {
    const keywords = ['react', 'vue', 'typescript', 'javascript', 'node', 
                      'python', 'docker', 'aws', 'github', 'documentation',
                      'tutorial', 'api', 'frontend', 'backend', 'database',
                      'security', 'testing', 'design', 'tool', 'framework'];
    
    const startTime = Date.now();
    let successCount = 0;
    
    for (const keyword of keywords) {
      const result = await executor.execute(`find ${keyword}`, ctx);
      if (result.success) successCount++;
    }
    
    const duration = Date.now() - startTime;
    
    expect(successCount).toBe(20);
    expect(duration).toBeLessThan(1000); // 应该在 1 秒内完成
  });

  it('批量创建效率：创建 10 个文件夹', async () => {
    await executor.execute('cd 书签栏', ctx);
    
    const startTime = Date.now();
    let successCount = 0;
    
    for (let i = 0; i < 10; i++) {
      const result = await executor.execute(`mkdir TestFolder${i}`, ctx);
      if (result.success) successCount++;
    }
    
    const duration = Date.now() - startTime;
    
    expect(successCount).toBe(10);
    expect(duration).toBeLessThan(500);
  });

  it('批量移动效率：移动 10 个书签', async () => {
    await executor.execute('cd 书签栏', ctx);
    await executor.execute('mkdir MoveTarget', ctx);
    
    // 添加测试书签
    for (let i = 0; i < 10; i++) {
      await store.addBookmark(`https://test${i}.com`, `TestBookmark${i}`, '1');
    }
    
    const startTime = Date.now();
    let successCount = 0;
    
    for (let i = 0; i < 10; i++) {
      const result = await executor.execute(`mv TestBookmark${i} MoveTarget`, ctx);
      if (result.success) successCount++;
    }
    
    const duration = Date.now() - startTime;
    
    expect(successCount).toBe(10);
    expect(duration).toBeLessThan(500);
  });

  it('深层导航效率：连续 cd 操作', async () => {
    const startTime = Date.now();
    
    // 深入导航
    await executor.execute('cd 书签栏', ctx);
    await executor.execute('cd Development', ctx);
    await executor.execute('cd Frontend', ctx);
    await executor.execute('cd React', ctx);
    
    // 返回
    await executor.execute('cd ..', ctx);
    await executor.execute('cd ..', ctx);
    await executor.execute('cd ..', ctx);
    await executor.execute('cd /', ctx);
    
    const duration = Date.now() - startTime;
    
    expect(ctx.cwd.path).toBe('/');
    expect(duration).toBeLessThan(200);
  });

  it('复杂查询效率：组合条件搜索', async () => {
    const startTime = Date.now();
    
    // 各种搜索条件
    await executor.execute('find react -type f', ctx);
    await executor.execute('find -starred', ctx);
    await executor.execute('find vue -type f -limit 5', ctx);
    await executor.execute('find Development -type d', ctx);
    
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(300);
  });
});

// ============ 边界情况和鲁棒性测试 ============
describe('边界情况和鲁棒性测试', () => {
  let store: MockBookmarkStore;
  let executor: BashExecutor;
  let ctx: AgentContext;

  beforeEach(() => {
    const env = setupMockEnvironment();
    store = env.mockStore;
    executor = new BashExecutor(store);
    ctx = env.context;
  });

  it('处理特殊字符的书签名称', async () => {
    // 添加带特殊字符的书签
    await store.addBookmark('https://test.com', 'Test & Demo', '1');
    await store.addBookmark('https://test2.com', 'Test (2023)', '1');
    
    // 搜索应该能找到
    const result1 = await executor.execute('find "Test & Demo"', ctx);
    expect(result1.success).toBe(true);
    
    const result2 = await executor.execute('find "Test (2023)"', ctx);
    expect(result2.success).toBe(true);
  });

  it('处理中文书签名称', async () => {
    await store.addBookmark('https://test.com', '中文书签测试', '1');
    
    const findResult = await executor.execute('find 中文书签', ctx);
    expect(findResult.success).toBe(true);
    expect(findResult.data?.items?.length).toBeGreaterThan(0);
  });

  it('处理很长的书签标题', async () => {
    const longTitle = 'A'.repeat(200);
    await store.addBookmark('https://test.com', longTitle, '1');
    
    const findResult = await executor.execute(`find ${longTitle.slice(0, 50)}`, ctx);
    expect(findResult.success).toBe(true);
  });

  it('处理空搜索结果', async () => {
    const result = await executor.execute('find xyznonexistent123456789', ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('no results');
    expect(result.data?.items?.length).toBe(0);
  });

  it('连续执行相同命令', async () => {
    // 连续执行 ls
    for (let i = 0; i < 5; i++) {
      const result = await executor.execute('ls', ctx);
      expect(result.success).toBe(true);
    }
    
    // 连续执行 pwd
    for (let i = 0; i < 5; i++) {
      const result = await executor.execute('pwd', ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBe('/');
    }
  });

  it('在空文件夹中执行操作', async () => {
    await executor.execute('cd 书签栏', ctx);
    await executor.execute('mkdir EmptyTest', ctx);
    await executor.execute('cd EmptyTest', ctx);
    
    // ls 应该显示 empty
    const lsResult = await executor.execute('ls', ctx);
    expect(lsResult.output).toBe('(empty)');
    
    // wc 应该显示 0
    const wcResult = await executor.execute('wc', ctx);
    expect(wcResult.data?.bookmarks).toBe(0);
    expect(wcResult.data?.folders).toBe(0);
    
    // find 应该没有结果
    const findResult = await executor.execute('find anything', ctx);
    expect(findResult.output).toBe('no results');
  });

  it('处理路径中的 .. 操作', async () => {
    await executor.execute('cd 书签栏', ctx);
    await executor.execute('cd Development', ctx);
    
    // 多次 ..
    await executor.execute('cd ..', ctx);
    expect(ctx.cwd.path).toBe('/书签栏');
    
    await executor.execute('cd ..', ctx);
    expect(ctx.cwd.path).toBe('/');
    
    // 在根目录执行 .. 应该保持在根目录
    await executor.execute('cd ..', ctx);
    expect(ctx.cwd.path).toBe('/');
  });

  it('处理不带参数的命令', async () => {
    // 这些命令不带参数应该有合理的行为
    expect((await executor.execute('ls', ctx)).success).toBe(true);
    expect((await executor.execute('pwd', ctx)).success).toBe(true);
    expect((await executor.execute('tree', ctx)).success).toBe(true);
    expect((await executor.execute('wc', ctx)).success).toBe(true);
    expect((await executor.execute('help', ctx)).success).toBe(true);
    
    // 这些命令需要参数
    expect((await executor.execute('cd', ctx)).success).toBe(true); // cd 无参数回到根目录
    expect((await executor.execute('find', ctx)).success).toBe(false); // find 需要参数
    expect((await executor.execute('rm', ctx)).success).toBe(false);
    expect((await executor.execute('mkdir', ctx)).success).toBe(false);
  });
});

// ============ 状态一致性测试 ============
describe('状态一致性测试', () => {
  let store: MockBookmarkStore;
  let executor: BashExecutor;
  let ctx: AgentContext;

  beforeEach(() => {
    const env = setupMockEnvironment();
    store = env.mockStore;
    executor = new BashExecutor(store);
    ctx = env.context;
  });

  it('操作后书签计数应该正确', async () => {
    const initialWc = await executor.execute('wc', ctx);
    const initialCount = initialWc.data?.bookmarks || 0;
    
    // 添加书签
    await store.addBookmark('https://new1.com', 'New1', '1');
    await store.addBookmark('https://new2.com', 'New2', '1');
    
    const afterAddWc = await executor.execute('wc', ctx);
    expect(afterAddWc.data?.bookmarks).toBe(initialCount + 2);
    
    // 删除书签
    await executor.execute('rm New1', ctx);
    
    const afterDeleteWc = await executor.execute('wc', ctx);
    expect(afterDeleteWc.data?.bookmarks).toBe(initialCount + 1);
  });

  it('移动书签后文件夹计数应该更新', async () => {
    await executor.execute('cd 书签栏', ctx);
    await executor.execute('mkdir Source', ctx);
    await executor.execute('mkdir Target', ctx);
    
    // 在 Source 添加书签
    const sourceFolder = store.folders.find(f => f.title === 'Source')!;
    await store.addBookmark('https://test.com', 'TestBM', sourceFolder.chromeId);
    
    // 检查 Source 计数
    await executor.execute('cd Source', ctx);
    let wcResult = await executor.execute('wc', ctx);
    expect(wcResult.data?.bookmarks).toBe(1);
    
    // 回到书签栏，移动书签到 Target（findFolder 会全局搜索）
    await executor.execute('cd ..', ctx);
    // 先进入 Source 找到书签，再移动
    await executor.execute('cd Source', ctx);
    await executor.execute('mv TestBM Target', ctx);  // Target 会被全局找到
    
    // 检查 Source 计数（应该为 0）
    wcResult = await executor.execute('wc', ctx);
    expect(wcResult.data?.bookmarks).toBe(0);
    
    // 检查 Target 计数（应该为 1）
    await executor.execute('cd ..', ctx);
    await executor.execute('cd Target', ctx);
    wcResult = await executor.execute('wc', ctx);
    expect(wcResult.data?.bookmarks).toBe(1);
  });

  it('删除文件夹后其内容也应该被删除', async () => {
    await executor.execute('cd 书签栏', ctx);
    await executor.execute('mkdir ToDelete', ctx);
    
    // 在文件夹中添加内容
    const folderId = store.folders.find(f => f.title === 'ToDelete')!.chromeId;
    await store.addBookmark('https://test1.com', 'Child1', folderId);
    await store.addBookmark('https://test2.com', 'Child2', folderId);
    await store.createFolder('SubFolder', folderId);
    
    // 删除文件夹
    await executor.execute('rm ToDelete', ctx);
    
    // 验证内容也被删除
    const findChild = await executor.execute('find Child1', ctx);
    expect(findChild.output).toBe('no results');
    
    const findFolder = await executor.execute('find ToDelete -type d', ctx);
    expect(findFolder.output).toBe('no results');
  });

  it('reset 后状态应该恢复', async () => {
    // 在根目录统计全部书签
    const initialWc = await executor.execute('wc', ctx);
    const initialBookmarks = initialWc.data?.bookmarks;
    
    // 做一些修改（在根目录添加）
    await store.addBookmark('https://temp.com', 'Temp', '1');
    await store.createFolder('TempFolder', '1');
    
    // 验证修改（仍在根目录统计）
    const afterModifyWc = await executor.execute('wc', ctx);
    expect(afterModifyWc.data?.bookmarks).toBeGreaterThan(initialBookmarks!);
    
    // Reset
    store.reset();
    ctx.cwd = { folderId: null, path: '/' };
    
    // 验证恢复
    const afterResetWc = await executor.execute('wc', ctx);
    expect(afterResetWc.data?.bookmarks).toBe(initialBookmarks);
  });
});


// ============ 具体用户场景测试：真实开发者需求 ============
describe('具体用户场景：真实开发者需求', () => {
  let store: MockBookmarkStore;
  let executor: BashExecutor;
  let ctx: AgentContext;

  beforeEach(() => {
    const env = setupMockEnvironment();
    store = env.mockStore;
    executor = new BashExecutor(store);
    ctx = env.context;
  });

  // ============ 场景 A: 新项目启动 ============
  describe('场景A: 新项目启动 - 收集技术资源', () => {
    it('用户说："我要开始一个 React + TypeScript 项目，帮我整理相关书签"', async () => {
      // 1. 创建项目文件夹结构
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir "新项目-React-TS"', ctx);
      await executor.execute('cd "新项目-React-TS"', ctx);
      await executor.execute('mkdir 官方文档', ctx);
      await executor.execute('mkdir 教程', ctx);
      await executor.execute('mkdir 工具库', ctx);
      await executor.execute('mkdir 参考项目', ctx);
      
      // 2. 搜索 React 相关书签
      const reactDocs = await executor.execute('find react documentation -type f -limit 3', ctx);
      expect(reactDocs.success).toBe(true);
      
      // 3. 搜索 TypeScript 相关书签
      const tsDocs = await executor.execute('find typescript -type f -limit 3', ctx);
      expect(tsDocs.success).toBe(true);
      
      // 4. 复制到项目文件夹
      for (const doc of (reactDocs.data?.items || []).slice(0, 2)) {
        await executor.execute(`cp "${doc.name}" 官方文档`, ctx);
      }
      
      // 5. 验证项目结构
      const treeResult = await executor.execute('tree', ctx);
      expect(treeResult.output).toContain('官方文档');
      expect(treeResult.output).toContain('教程');
      expect(treeResult.output).toContain('工具库');
    });

    it('用户说："把所有 GitHub 上的 React 模板项目收集起来"', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir "React模板收藏"', ctx);
      
      // 搜索 GitHub 相关书签
      const githubResult = await executor.execute('find github -type f', ctx);
      const githubBookmarks = githubResult.data?.items || [];
      
      // 筛选 React 相关的
      let copiedCount = 0;
      for (const bm of githubBookmarks) {
        if (bm.name.toLowerCase().includes('react') || 
            (bm.url && bm.url.toLowerCase().includes('react'))) {
          const cpResult = await executor.execute(`cp "${bm.name}" "React模板收藏"`, ctx);
          if (cpResult.success) copiedCount++;
          if (copiedCount >= 5) break;
        }
      }
      
      // 验证
      await executor.execute('cd "React模板收藏"', ctx);
      const lsResult = await executor.execute('ls', ctx);
      expect(lsResult.success).toBe(true);
    });
  });

  // ============ 场景 B: 学习新技术 ============
  describe('场景B: 学习新技术 - 整理学习资源', () => {
    it('用户说："我在学 Docker，帮我把所有 Docker 相关的书签整理到一起"', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir "Docker学习"', ctx);
      await executor.execute('cd "Docker学习"', ctx);
      await executor.execute('mkdir 入门教程', ctx);
      await executor.execute('mkdir 进阶指南', ctx);
      await executor.execute('mkdir 最佳实践', ctx);
      
      // 搜索 Docker 相关
      const dockerResult = await executor.execute('find docker -type f', ctx);
      expect(dockerResult.success).toBe(true);
      
      // 给重要的加星标
      const dockerBookmarks = dockerResult.data?.items || [];
      for (const bm of dockerBookmarks.slice(0, 3)) {
        if (!bm.starred) {
          await executor.execute(`star "${bm.name}"`, ctx);
        }
      }
      
      // 验证星标
      const starredResult = await executor.execute('find docker -starred', ctx);
      expect(starredResult.success).toBe(true);
    });

    it('用户说："找出所有带 tutorial 标签的书签，我要系统学习"', async () => {
      const tutorialResult = await executor.execute('find tutorial -type f', ctx);
      expect(tutorialResult.success).toBe(true);
      
      const tutorials = tutorialResult.data?.items || [];
      expect(tutorials.length).toBeGreaterThan(0);
      
      // 查看每个教程的详细信息
      for (const tutorial of tutorials.slice(0, 3)) {
        const statResult = await executor.execute(`stat "${tutorial.name}"`, ctx);
        expect(statResult.success).toBe(true);
        expect(statResult.output).toContain('url:');
      }
    });
  });

  // ============ 场景 C: 日常整理 ============
  describe('场景C: 日常整理 - 清理和归档', () => {
    it('用户说："我的书签太乱了，帮我按技术栈分类"', async () => {
      await executor.execute('cd 书签栏', ctx);
      
      // 创建技术栈分类
      const categories = ['前端', '后端', 'DevOps', '数据库', '工具'];
      for (const cat of categories) {
        await executor.execute(`mkdir ${cat}`, ctx);
      }
      
      // 验证分类创建成功
      const lsResult = await executor.execute('ls', ctx);
      for (const cat of categories) {
        expect(lsResult.output).toContain(cat);
      }
      
      // 移动前端相关书签
      const frontendKeywords = ['react', 'vue', 'css', 'html', 'javascript'];
      for (const keyword of frontendKeywords) {
        const findResult = await executor.execute(`find ${keyword} -type f -limit 2`, ctx);
        for (const bm of (findResult.data?.items || []).slice(0, 1)) {
          await executor.execute(`mv "${bm.name}" 前端`, ctx);
        }
      }
      
      // 验证前端文件夹有内容
      await executor.execute('cd 前端', ctx);
      const frontendWc = await executor.execute('wc', ctx);
      expect(frontendWc.data?.bookmarks).toBeGreaterThan(0);
    });

    it('用户说："删除所有超过一年没访问的书签"（模拟）', async () => {
      // 添加一些"旧"书签
      await store.addBookmark('https://old1.com', 'Old Bookmark 1', '1');
      await store.addBookmark('https://old2.com', 'Old Bookmark 2', '1');
      await store.addBookmark('https://old3.com', 'Old Bookmark 3', '1');
      
      // 搜索这些书签
      const oldResult = await executor.execute('find "Old Bookmark" -type f', ctx);
      expect(oldResult.data?.items?.length).toBe(3);
      
      // 删除它们
      for (const bm of oldResult.data?.items || []) {
        await executor.execute(`rm "${bm.name}"`, ctx);
      }
      
      // 验证删除成功
      const verifyResult = await executor.execute('find "Old Bookmark" -type f', ctx);
      expect(verifyResult.output).toBe('no results');
    });

    it('用户说："把所有星标书签备份到一个文件夹"', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir "星标备份"', ctx);
      
      // 获取所有星标书签
      const starredResult = await executor.execute('find -starred', ctx);
      const starred = starredResult.data?.items || [];
      expect(starred.length).toBeGreaterThan(0);
      
      // 复制到备份文件夹
      let backupCount = 0;
      for (const bm of starred.slice(0, 10)) {
        const cpResult = await executor.execute(`cp "${bm.name}" "星标备份"`, ctx);
        if (cpResult.success) backupCount++;
      }
      
      // 验证备份
      await executor.execute('cd "星标备份"', ctx);
      const wcResult = await executor.execute('wc', ctx);
      expect(wcResult.data?.bookmarks).toBe(backupCount);
    });
  });

  // ============ 场景 D: 工作场景 ============
  describe('场景D: 工作场景 - 项目管理', () => {
    it('用户说："创建一个工作项目的书签集合，包含 Jira、Confluence、GitHub"', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir "工作项目-ABC"', ctx);
      await executor.execute('cd "工作项目-ABC"', ctx);
      
      // 创建子分类
      await executor.execute('mkdir 项目管理', ctx);
      await executor.execute('mkdir 代码仓库', ctx);
      await executor.execute('mkdir 文档', ctx);
      await executor.execute('mkdir API文档', ctx);
      
      // 添加项目相关书签
      await store.addBookmark('https://jira.company.com/ABC', 'ABC项目-Jira', 
        store.folders.find(f => f.title === '项目管理')!.chromeId);
      await store.addBookmark('https://github.com/company/abc', 'ABC项目-GitHub',
        store.folders.find(f => f.title === '代码仓库')!.chromeId);
      
      // 验证结构
      const treeResult = await executor.execute('tree', ctx);
      expect(treeResult.output).toContain('项目管理');
      expect(treeResult.output).toContain('代码仓库');
      expect(treeResult.output).toContain('文档');
    });

    it('用户说："找出所有 API 文档相关的书签"', async () => {
      const apiResult = await executor.execute('find api -type f', ctx);
      expect(apiResult.success).toBe(true);
      
      // 查看详细信息
      for (const api of (apiResult.data?.items || []).slice(0, 3)) {
        const catResult = await executor.execute(`cat "${api.name}"`, ctx);
        expect(catResult.success).toBe(true);
        expect(catResult.output).toContain('https://');
      }
    });
  });

  // ============ 场景 E: 搜索和发现 ============
  describe('场景E: 搜索和发现 - 找到需要的资源', () => {
    it('用户说："我记得收藏过一个关于 React Hooks 的文章，帮我找找"', async () => {
      // 先添加一个测试书签
      await store.addBookmark(
        'https://example.com/react-hooks-guide',
        'Complete Guide to React Hooks',
        '1'
      );
      
      // 搜索
      const hookResult = await executor.execute('find hooks -type f', ctx);
      expect(hookResult.success).toBe(true);
      
      // 应该能找到
      const found = hookResult.data?.items?.find(
        item => item.name.toLowerCase().includes('hooks')
      );
      expect(found).toBeDefined();
      
      // 查看详情
      if (found) {
        const statResult = await executor.execute(`stat "${found.name}"`, ctx);
        expect(statResult.output).toContain('url:');
      }
    });

    it('用户说："列出所有 AWS 相关的书签，我要复习云服务"', async () => {
      const awsResult = await executor.execute('find aws -type f', ctx);
      expect(awsResult.success).toBe(true);
      
      // 显示详细列表
      await executor.execute('cd 书签栏', ctx);
      const lsResult = await executor.execute('ls -l', ctx);
      expect(lsResult.success).toBe(true);
    });

    it('用户说："找出所有带 security 标签的书签，安全很重要"', async () => {
      const securityResult = await executor.execute('find security -type f', ctx);
      expect(securityResult.success).toBe(true);
      
      // 给安全相关的书签加星标
      for (const bm of (securityResult.data?.items || []).slice(0, 3)) {
        if (!bm.starred) {
          await executor.execute(`star "${bm.name}"`, ctx);
        }
      }
    });
  });

  // ============ 场景 F: 批量重命名 ============
  describe('场景F: 批量重命名 - 统一命名规范', () => {
    it('用户说："把所有书签名称中的 - 改成空格，更易读"', async () => {
      // 添加带连字符的书签
      await store.addBookmark('https://test1.com', 'React-Tutorial-2024', '1');
      await store.addBookmark('https://test2.com', 'Vue-Getting-Started', '1');
      
      // 搜索并重命名
      const findResult = await executor.execute('find Tutorial -type f', ctx);
      for (const bm of findResult.data?.items || []) {
        if (bm.name.includes('-')) {
          const newName = bm.name.replace(/-/g, ' ');
          await executor.execute(`mv "${bm.name}" "${newName}"`, ctx);
        }
      }
      
      // 验证重命名
      const verifyResult = await executor.execute('find "React Tutorial" -type f', ctx);
      expect(verifyResult.data?.items?.length).toBeGreaterThan(0);
    });

    it('用户说："给所有 Documentation 文件夹改名为 Docs"', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir MyDocumentation', ctx);
      
      // 重命名
      const mvResult = await executor.execute('mv MyDocumentation MyDocs', ctx);
      expect(mvResult.success).toBe(true);
      expect(mvResult.output).toContain('renamed');
      
      // 验证
      const lsResult = await executor.execute('ls', ctx);
      expect(lsResult.output).toContain('MyDocs');
      expect(lsResult.output).not.toContain('MyDocumentation');
    });
  });

  // ============ 场景 G: 统计和报告 ============
  describe('场景G: 统计和报告 - 了解书签状况', () => {
    it('用户说："告诉我书签的整体情况，有多少书签，多少文件夹"', async () => {
      // 根目录统计
      const rootWc = await executor.execute('wc', ctx);
      expect(rootWc.success).toBe(true);
      expect(rootWc.data?.bookmarks).toBeGreaterThan(0);
      expect(rootWc.data?.folders).toBeGreaterThan(0);
      
      // 查看目录结构
      const treeResult = await executor.execute('tree 2', ctx);
      expect(treeResult.success).toBe(true);
      
      // 统计星标
      const starredResult = await executor.execute('find -starred', ctx);
      expect(starredResult.success).toBe(true);
      
      // 输出报告
      const report = {
        totalBookmarks: rootWc.data?.bookmarks,
        totalFolders: rootWc.data?.folders,
        starredCount: starredResult.data?.items?.length || 0,
      };
      
      expect(report.totalBookmarks).toBeGreaterThan(0);
      expect(report.totalFolders).toBeGreaterThan(0);
    });

    it('用户说："哪个文件夹的书签最多？"', async () => {
      await executor.execute('cd 书签栏', ctx);
      const lsResult = await executor.execute('ls', ctx);
      const folders = lsResult.data?.items?.filter(item => item.type === 'directory') || [];
      
      let maxCount = 0;
      let maxFolder = '';
      
      for (const folder of folders.slice(0, 5)) {
        await executor.execute(`cd "${folder.name}"`, ctx);
        const wcResult = await executor.execute('wc', ctx);
        const count = wcResult.data?.bookmarks || 0;
        
        if (count > maxCount) {
          maxCount = count;
          maxFolder = folder.name;
        }
        
        await executor.execute('cd ..', ctx);
      }
      
      expect(maxFolder).toBeTruthy();
    });
  });

  // ============ 场景 H: 紧急情况 ============
  describe('场景H: 紧急情况 - 快速查找', () => {
    it('用户说："快！我需要找到那个 JWT 认证的文档"', async () => {
      // 添加测试书签
      await store.addBookmark('https://jwt.io/introduction', 'JWT Introduction', '1');
      
      // 快速搜索
      const jwtResult = await executor.execute('find jwt -type f', ctx);
      expect(jwtResult.success).toBe(true);
      
      // 立即查看内容
      if (jwtResult.data?.items?.length) {
        const catResult = await executor.execute(`cat "${jwtResult.data.items[0].name}"`, ctx);
        expect(catResult.success).toBe(true);
        expect(catResult.output).toContain('https://');
      }
    });

    it('用户说："找出所有我标记为重要的书签（星标）"', async () => {
      const starredResult = await executor.execute('find -starred', ctx);
      expect(starredResult.success).toBe(true);
      
      // 所有结果都应该是星标
      for (const item of starredResult.data?.items || []) {
        expect(item.starred).toBe(true);
      }
    });
  });
});

// ============ 复杂多步骤工作流测试 ============
describe('复杂多步骤工作流测试', () => {
  let store: MockBookmarkStore;
  let executor: BashExecutor;
  let ctx: AgentContext;

  beforeEach(() => {
    const env = setupMockEnvironment();
    store = env.mockStore;
    executor = new BashExecutor(store);
    ctx = env.context;
  });

  it('完整工作流：从零开始整理一个技术栈的所有资源', async () => {
    // Step 1: 创建主文件夹
    await executor.execute('cd 书签栏', ctx);
    await executor.execute('mkdir "全栈开发资源"', ctx);
    await executor.execute('cd "全栈开发资源"', ctx);
    
    // Step 2: 创建子分类
    const categories = ['前端框架', '后端框架', '数据库', '部署运维', '开发工具'];
    for (const cat of categories) {
      await executor.execute(`mkdir "${cat}"`, ctx);
    }
    
    // Step 3: 搜索并分类前端资源
    const frontendKeywords = ['react', 'vue', 'angular'];
    for (const keyword of frontendKeywords) {
      const result = await executor.execute(`find ${keyword} -type f -limit 2`, ctx);
      for (const bm of (result.data?.items || []).slice(0, 1)) {
        await executor.execute(`cp "${bm.name}" 前端框架`, ctx);
      }
    }
    
    // Step 4: 搜索并分类后端资源
    const backendKeywords = ['node', 'python', 'java'];
    for (const keyword of backendKeywords) {
      const result = await executor.execute(`find ${keyword} -type f -limit 2`, ctx);
      for (const bm of (result.data?.items || []).slice(0, 1)) {
        await executor.execute(`cp "${bm.name}" 后端框架`, ctx);
      }
    }
    
    // Step 5: 给重要资源加星标
    await executor.execute('cd 前端框架', ctx);
    const frontendLs = await executor.execute('ls', ctx);
    for (const item of (frontendLs.data?.items || []).slice(0, 2)) {
      if (item.type === 'file') {
        await executor.execute(`star "${item.name}"`, ctx);
      }
    }
    
    // Step 6: 生成最终报告
    await executor.execute('cd ..', ctx);
    const finalTree = await executor.execute('tree', ctx);
    expect(finalTree.success).toBe(true);
    
    const finalWc = await executor.execute('wc', ctx);
    expect(finalWc.data?.folders).toBe(5);
  });

  it('完整工作流：清理和归档旧书签', async () => {
    // Step 1: 创建归档文件夹
    await executor.execute('cd 书签栏', ctx);
    await executor.execute('mkdir "归档-2024"', ctx);
    
    // Step 2: 添加一些"旧"书签模拟
    for (let i = 0; i < 5; i++) {
      await store.addBookmark(`https://old${i}.com`, `旧书签${i}`, '1');
    }
    
    // Step 3: 搜索旧书签
    const oldResult = await executor.execute('find 旧书签 -type f', ctx);
    expect(oldResult.data?.items?.length).toBe(5);
    
    // Step 4: 移动到归档
    for (const bm of oldResult.data?.items || []) {
      await executor.execute(`mv "${bm.name}" "归档-2024"`, ctx);
    }
    
    // Step 5: 验证移动成功
    await executor.execute('cd "归档-2024"', ctx);
    const archiveWc = await executor.execute('wc', ctx);
    expect(archiveWc.data?.bookmarks).toBe(5);
    
    // Step 6: 验证原位置已清空
    await executor.execute('cd ..', ctx);
    const verifyResult = await executor.execute('find 旧书签 -type f', ctx);
    // 应该还能找到（在归档文件夹里）
    expect(verifyResult.data?.items?.length).toBe(5);
  });

  it('完整工作流：项目交接 - 导出项目相关书签', async () => {
    // Step 1: 创建项目文件夹
    await executor.execute('cd 书签栏', ctx);
    await executor.execute('mkdir "项目交接-XYZ"', ctx);
    await executor.execute('cd "项目交接-XYZ"', ctx);
    
    // Step 2: 创建分类
    await executor.execute('mkdir 核心文档', ctx);
    await executor.execute('mkdir 技术参考', ctx);
    await executor.execute('mkdir 工具链接', ctx);
    
    // Step 3: 收集相关书签
    const keywords = ['documentation', 'api', 'github'];
    for (const keyword of keywords) {
      const result = await executor.execute(`find ${keyword} -type f -limit 2`, ctx);
      for (const bm of (result.data?.items || []).slice(0, 1)) {
        await executor.execute(`cp "${bm.name}" 核心文档`, ctx);
      }
    }
    
    // Step 4: 标记重要书签
    await executor.execute('cd 核心文档', ctx);
    const docsLs = await executor.execute('ls', ctx);
    for (const item of docsLs.data?.items || []) {
      if (item.type === 'file') {
        await executor.execute(`star "${item.name}"`, ctx);
      }
    }
    
    // Step 5: 生成交接清单
    await executor.execute('cd ..', ctx);
    const handoverTree = await executor.execute('tree', ctx);
    expect(handoverTree.success).toBe(true);
    
    // Step 6: 统计
    const handoverWc = await executor.execute('wc', ctx);
    expect(handoverWc.data?.folders).toBe(3);
  });
});
