/**
 * 高级用户场景测试
 * 
 * 测试更复杂的书签管理任务，包括：
 * - 多步骤工作流
 * - 条件操作
 * - 批量处理
 * - 数据分析
 * - 错误恢复
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BashExecutor } from '../BashExecutor';
import { MockBookmarkStore, setupMockEnvironment } from '../mock';
import type { AgentContext } from '../types';

describe('高级用户场景测试', () => {
  let store: MockBookmarkStore;
  let executor: BashExecutor;
  let ctx: AgentContext;

  beforeEach(() => {
    const env = setupMockEnvironment();
    store = env.mockStore;
    executor = new BashExecutor(store);
    ctx = env.context;
  });

  // ============ 场景 1: 智能分类整理 ============
  describe('场景1: 智能分类整理', () => {
    it('按域名自动分类书签', async () => {
      // 添加不同域名的书签
      await store.addBookmark('https://github.com/repo1', 'GitHub Repo 1', '1');
      await store.addBookmark('https://github.com/repo2', 'GitHub Repo 2', '1');
      await store.addBookmark('https://stackoverflow.com/q1', 'SO Question 1', '1');
      await store.addBookmark('https://stackoverflow.com/q2', 'SO Question 2', '1');
      await store.addBookmark('https://medium.com/article1', 'Medium Article 1', '1');
      
      await executor.execute('cd 书签栏', ctx);
      
      // 创建域名分类文件夹
      await executor.execute('mkdir GitHub', ctx);
      await executor.execute('mkdir StackOverflow', ctx);
      await executor.execute('mkdir Medium', ctx);
      
      // 按域名移动书签
      const githubResult = await executor.execute('find github.com -type f', ctx);
      for (const bm of githubResult.data?.items || []) {
        await executor.execute(`mv "${bm.name}" GitHub`, ctx);
      }
      
      const soResult = await executor.execute('find stackoverflow -type f', ctx);
      for (const bm of soResult.data?.items || []) {
        await executor.execute(`mv "${bm.name}" StackOverflow`, ctx);
      }
      
      // 验证分类结果
      await executor.execute('cd GitHub', ctx);
      const githubWc = await executor.execute('wc', ctx);
      expect(githubWc.data?.bookmarks).toBeGreaterThanOrEqual(2);
      
      await executor.execute('cd ../StackOverflow', ctx);
      const soWc = await executor.execute('wc', ctx);
      expect(soWc.data?.bookmarks).toBeGreaterThanOrEqual(2);
    });

    it('按标签自动分类书签', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir 按标签分类', ctx);
      await executor.execute('cd 按标签分类', ctx);
      
      // 创建标签文件夹
      const tags = ['frontend', 'backend', 'devops', 'tutorial', 'documentation'];
      for (const tag of tags) {
        await executor.execute(`mkdir ${tag}`, ctx);
      }
      
      // 按标签搜索并复制
      for (const tag of tags) {
        const findResult = await executor.execute(`find ${tag} -type f -limit 3`, ctx);
        for (const bm of (findResult.data?.items || []).slice(0, 2)) {
          await executor.execute(`cp "${bm.name}" ${tag}`, ctx);
        }
      }
      
      // 验证结构
      const treeResult = await executor.execute('tree 2', ctx);
      expect(treeResult.success).toBe(true);
      for (const tag of tags) {
        expect(treeResult.output).toContain(tag);
      }
    });
  });

  // ============ 场景 2: 书签健康检查 ============
  describe('场景2: 书签健康检查', () => {
    it('找出所有没有摘要的书签', async () => {
      // 添加一些没有摘要的书签
      await store.addBookmark('https://nosummary1.com', 'No Summary 1', '1');
      await store.addBookmark('https://nosummary2.com', 'No Summary 2', '1');
      
      // 搜索这些书签
      const findResult = await executor.execute('find "No Summary" -type f', ctx);
      expect(findResult.data?.items?.length).toBe(2);
      
      // 查看详情
      const statResult = await executor.execute('stat "No Summary 1"', ctx);
      expect(statResult.success).toBe(true);
    });

    it('统计各文件夹的书签分布', async () => {
      const stats: Record<string, number> = {};
      
      // 遍历主要文件夹
      await executor.execute('cd 书签栏', ctx);
      const lsResult = await executor.execute('ls', ctx);
      const folders = (lsResult.data?.items || []).filter(i => i.type === 'directory');
      
      for (const folder of folders.slice(0, 5)) {
        await executor.execute(`cd "${folder.name}"`, ctx);
        const wcResult = await executor.execute('wc', ctx);
        stats[folder.name] = wcResult.data?.bookmarks || 0;
        await executor.execute('cd ..', ctx);
      }
      
      // 验证统计数据
      expect(Object.keys(stats).length).toBeGreaterThan(0);
    });

    it('找出重复的书签（相同 URL）', async () => {
      // 添加重复 URL 的书签
      await store.addBookmark('https://duplicate-url.com', 'Duplicate A', '1');
      await store.addBookmark('https://duplicate-url.com', 'Duplicate B', '1');
      await store.addBookmark('https://duplicate-url.com', 'Duplicate C', '1');
      
      // 搜索这些书签
      const findResult = await executor.execute('find duplicate-url -type f', ctx);
      expect(findResult.data?.items?.length).toBe(3);
      
      // 保留第一个，删除其他
      const duplicates = findResult.data?.items || [];
      for (let i = 1; i < duplicates.length; i++) {
        await executor.execute(`rm "${duplicates[i].name}"`, ctx);
      }
      
      // 验证只剩一个
      const verifyResult = await executor.execute('find duplicate-url -type f', ctx);
      expect(verifyResult.data?.items?.length).toBe(1);
    });
  });

  // ============ 场景 3: 批量操作 ============
  describe('场景3: 高级批量操作', () => {
    it('批量给某类书签加星标', async () => {
      // 找所有 React 书签
      const reactResult = await executor.execute('find react -type f', ctx);
      const reactBookmarks = reactResult.data?.items || [];
      
      // 记录初始星标数
      const initialStarred = reactBookmarks.filter(b => b.starred).length;
      
      // 给所有未星标的加星标
      let starredCount = 0;
      for (const bm of reactBookmarks) {
        if (!bm.starred) {
          const starResult = await executor.execute(`star "${bm.name}"`, ctx);
          if (starResult.success) starredCount++;
        }
      }
      
      // 验证
      const afterResult = await executor.execute('find react -starred', ctx);
      expect(afterResult.data?.items?.length).toBeGreaterThanOrEqual(initialStarred + starredCount);
    });

    it('批量移动书签到归档文件夹', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir 归档', ctx);
      
      // 添加一些要归档的书签
      for (let i = 0; i < 5; i++) {
        await store.addBookmark(`https://archive${i}.com`, `Archive Item ${i}`, '1');
      }
      
      // 批量移动
      const findResult = await executor.execute('find "Archive Item" -type f', ctx);
      let movedCount = 0;
      for (const bm of findResult.data?.items || []) {
        const mvResult = await executor.execute(`mv "${bm.name}" 归档`, ctx);
        if (mvResult.success) movedCount++;
      }
      
      // 验证
      await executor.execute('cd 归档', ctx);
      const wcResult = await executor.execute('wc', ctx);
      expect(wcResult.data?.bookmarks).toBe(movedCount);
    });

    it('批量复制书签创建备份', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir 完整备份', ctx);
      
      // 获取所有星标书签
      const starredResult = await executor.execute('find -starred', ctx);
      const starred = starredResult.data?.items || [];
      
      // 批量复制
      let copiedCount = 0;
      for (const bm of starred.slice(0, 10)) {
        const cpResult = await executor.execute(`cp "${bm.name}" 完整备份`, ctx);
        if (cpResult.success) copiedCount++;
      }
      
      // 验证备份完整性
      await executor.execute('cd 完整备份', ctx);
      const wcResult = await executor.execute('wc', ctx);
      expect(wcResult.data?.bookmarks).toBe(copiedCount);
    });
  });

  // ============ 场景 4: 搜索和过滤 ============
  describe('场景4: 高级搜索和过滤', () => {
    it('组合条件搜索：星标 + 关键词', async () => {
      // 搜索星标的 React 书签
      const result = await executor.execute('find react -starred', ctx);
      expect(result.success).toBe(true);
      
      // 所有结果应该都是星标
      const items = result.data?.items || [];
      expect(items.every(i => i.starred === true)).toBe(true);
    });

    it('限制搜索结果数量', async () => {
      const result = await executor.execute('find react -type f -limit 3', ctx);
      expect(result.success).toBe(true);
      expect(result.data?.items?.length).toBeLessThanOrEqual(3);
    });

    it('搜索特定类型：只搜索文件夹', async () => {
      const result = await executor.execute('find Development -type d', ctx);
      expect(result.success).toBe(true);
      
      const items = result.data?.items || [];
      expect(items.every(i => i.type === 'directory')).toBe(true);
    });

    it('搜索特定类型：只搜索书签', async () => {
      const result = await executor.execute('find react -type f', ctx);
      expect(result.success).toBe(true);
      
      const items = result.data?.items || [];
      expect(items.every(i => i.type === 'file')).toBe(true);
    });

    it('模糊搜索：部分匹配', async () => {
      // 搜索 "doc" 应该匹配 "documentation"
      const result = await executor.execute('find doc -type f', ctx);
      expect(result.success).toBe(true);
      expect(result.data?.items?.length).toBeGreaterThan(0);
    });
  });

  // ============ 场景 5: 目录结构管理 ============
  describe('场景5: 目录结构管理', () => {
    it('创建多层嵌套目录结构', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir Level1', ctx);
      await executor.execute('cd Level1', ctx);
      await executor.execute('mkdir Level2', ctx);
      await executor.execute('cd Level2', ctx);
      await executor.execute('mkdir Level3', ctx);
      await executor.execute('cd Level3', ctx);
      await executor.execute('mkdir Level4', ctx);
      
      // 验证路径
      await executor.execute('cd Level4', ctx);
      const pwdResult = await executor.execute('pwd', ctx);
      expect(pwdResult.output).toContain('Level1');
      expect(pwdResult.output).toContain('Level2');
      expect(pwdResult.output).toContain('Level3');
      expect(pwdResult.output).toContain('Level4');
    });

    it('重组目录结构', async () => {
      await executor.execute('cd 书签栏', ctx);
      
      // 创建源文件夹
      await executor.execute('mkdir SourceFolder', ctx);
      
      // 在源文件夹添加书签
      await executor.execute('cd SourceFolder', ctx);
      const sourceFolder = store.folders.find(f => f.title === 'SourceFolder')!;
      await store.addBookmark('https://test.com', 'TestBM', sourceFolder.chromeId);
      
      const lsBefore = await executor.execute('ls', ctx);
      expect(lsBefore.output).toContain('TestBM');
      
      // 在同级创建目标文件夹
      await executor.execute('cd ..', ctx);
      await executor.execute('mkdir TargetFolder', ctx);
      
      // 回到源文件夹，移动书签
      await executor.execute('cd SourceFolder', ctx);
      const mvResult = await executor.execute('mv TestBM TargetFolder', ctx);
      expect(mvResult.success).toBe(true);
      
      // 验证源文件夹为空
      const lsAfter = await executor.execute('ls', ctx);
      expect(lsAfter.output).toBe('(empty)');
      
      // 验证目标文件夹有书签（通过 find 全局搜索）
      const findResult = await executor.execute('find TestBM -type f', ctx);
      expect(findResult.success).toBe(true);
      expect(findResult.data?.items?.length).toBe(1);
      expect(findResult.output).toContain('TargetFolder');
    });

    it('查看深层目录树', async () => {
      await executor.execute('cd 书签栏', ctx);
      
      // 查看不同深度的树
      const tree1 = await executor.execute('tree 1', ctx);
      expect(tree1.success).toBe(true);
      
      const tree2 = await executor.execute('tree 2', ctx);
      expect(tree2.success).toBe(true);
      
      const tree3 = await executor.execute('tree 3', ctx);
      expect(tree3.success).toBe(true);
      
      // 深度越大，输出应该越详细
      expect(tree3.output.length).toBeGreaterThanOrEqual(tree2.output.length);
    });
  });

  // ============ 场景 6: 数据导出和报告 ============
  describe('场景6: 数据导出和报告', () => {
    it('生成书签统计报告', async () => {
      // 收集统计数据
      const totalWc = await executor.execute('wc', ctx);
      const starredResult = await executor.execute('find -starred', ctx);
      
      // 按文件夹统计
      await executor.execute('cd 书签栏', ctx);
      const lsResult = await executor.execute('ls', ctx);
      const folders = (lsResult.data?.items || []).filter(i => i.type === 'directory');
      
      const folderStats: Record<string, number> = {};
      for (const folder of folders.slice(0, 5)) {
        await executor.execute(`cd "${folder.name}"`, ctx);
        const wcResult = await executor.execute('wc', ctx);
        folderStats[folder.name] = wcResult.data?.bookmarks || 0;
        await executor.execute('cd ..', ctx);
      }
      
      // 验证报告数据
      expect(totalWc.data?.bookmarks).toBeGreaterThan(0);
      expect(totalWc.data?.folders).toBeGreaterThan(0);
      expect(starredResult.data?.items?.length).toBeGreaterThan(0);
      expect(Object.keys(folderStats).length).toBeGreaterThan(0);
    });

    it('列出所有书签的详细信息', async () => {
      // 获取一些书签
      const findResult = await executor.execute('find react -type f -limit 5', ctx);
      const bookmarks = findResult.data?.items || [];
      
      // 获取每个书签的详细信息
      const details: any[] = [];
      for (const bm of bookmarks) {
        const statResult = await executor.execute(`stat "${bm.name}"`, ctx);
        if (statResult.success) {
          details.push({
            name: bm.name,
            stat: statResult.output,
          });
        }
      }
      
      expect(details.length).toBe(bookmarks.length);
    });
  });

  // ============ 场景 7: 错误恢复 ============
  describe('场景7: 错误恢复和容错', () => {
    it('操作失败后继续执行', async () => {
      // 尝试一些会失败的操作
      const fail1 = await executor.execute('rm "不存在的书签"', ctx);
      expect(fail1.success).toBe(false);
      
      // 继续执行正常操作
      const success1 = await executor.execute('ls', ctx);
      expect(success1.success).toBe(true);
      
      const fail2 = await executor.execute('cd "不存在的文件夹"', ctx);
      expect(fail2.success).toBe(false);
      
      // 路径应该没有改变
      const pwd = await executor.execute('pwd', ctx);
      expect(pwd.output).toBe('/');
    });

    it('批量操作中部分失败', async () => {
      await executor.execute('cd 书签栏', ctx);
      await executor.execute('mkdir TestTarget', ctx);
      
      // 添加一些书签
      await store.addBookmark('https://test1.com', 'Test1', '1');
      await store.addBookmark('https://test2.com', 'Test2', '1');
      
      // 批量移动，包含一个不存在的
      const results = [];
      results.push(await executor.execute('mv Test1 TestTarget', ctx));
      results.push(await executor.execute('mv NotExist TestTarget', ctx));
      results.push(await executor.execute('mv Test2 TestTarget', ctx));
      
      // 验证：2 个成功，1 个失败
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      expect(successCount).toBe(2);
      expect(failCount).toBe(1);
      
      // 验证成功的确实移动了
      await executor.execute('cd TestTarget', ctx);
      const wcResult = await executor.execute('wc', ctx);
      expect(wcResult.data?.bookmarks).toBe(2);
    });

    it('无效参数处理', async () => {
      // 各种无效参数
      const results = [
        await executor.execute('find', ctx),           // 缺少参数
        await executor.execute('rm', ctx),             // 缺少参数
        await executor.execute('mkdir', ctx),          // 缺少参数
        await executor.execute('mv', ctx),             // 缺少参数
        await executor.execute('cp', ctx),             // 缺少参数
      ];
      
      // 所有都应该失败但不崩溃
      for (const result of results) {
        expect(result.success).toBe(false);
        // 输出应该包含 error 或 usage 提示
        expect(result.output.includes('error') || result.output.includes('usage')).toBe(true);
      }
    });
  });

  // ============ 场景 8: 并发安全 ============
  describe('场景8: 并发安全', () => {
    it('快速连续执行多个命令', async () => {
      const commands = [
        'ls',
        'pwd',
        'wc',
        'find react',
        'tree',
        'ls',
        'pwd',
        'wc',
      ];
      
      const results = [];
      for (const cmd of commands) {
        results.push(await executor.execute(cmd, ctx));
      }
      
      // 所有命令都应该成功
      expect(results.every(r => r.success)).toBe(true);
    });

    it('交替读写操作', async () => {
      await executor.execute('cd 书签栏', ctx);
      
      for (let i = 0; i < 5; i++) {
        // 写操作
        await executor.execute(`mkdir TestFolder${i}`, ctx);
        
        // 读操作
        const lsResult = await executor.execute('ls', ctx);
        expect(lsResult.output).toContain(`TestFolder${i}`);
        
        // 写操作
        await store.addBookmark(`https://test${i}.com`, `TestBM${i}`, '1');
        
        // 读操作
        const findResult = await executor.execute(`find TestBM${i}`, ctx);
        expect(findResult.data?.items?.length).toBe(1);
      }
    });
  });
});
