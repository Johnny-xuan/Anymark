/**
 * 8 个用户场景详细测试 - 带完整日志输出
 * 
 * 测试 BashExecutor 在真实用户场景下的表现
 * 每个命令的输入输出都会记录到日志中
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { BashExecutor } from '../BashExecutor';
import { MockBookmarkStore, setupMockEnvironment } from '../mock';
import type { AgentContext } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// 日志收集器
const logs: string[] = [];
const LOG_FILE = path.join(__dirname, 'scenario-test.log');

function log(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  logs.push(line);
  console.log(line);
}

function logCommand(cmd: string, result: { success: boolean; output: string; data?: unknown }) {
  log(`  $ ${cmd}`);
  log(`    → success: ${result.success}`);
  log(`    → output: ${result.output.split('\n').slice(0, 3).join(' | ')}${result.output.split('\n').length > 3 ? '...' : ''}`);
  if (result.data) {
    log(`    → data: ${JSON.stringify(result.data).slice(0, 100)}${JSON.stringify(result.data).length > 100 ? '...' : ''}`);
  }
}

function logSection(title: string) {
  log('');
  log('═'.repeat(60));
  log(`  ${title}`);
  log('═'.repeat(60));
}

function logSubSection(title: string) {
  log('');
  log(`  ── ${title} ──`);
}

// 测试结束后写入日志文件
afterAll(() => {
  const logContent = logs.join('\n');
  fs.writeFileSync(LOG_FILE, logContent, 'utf-8');
  console.log(`\n📝 日志已写入: ${LOG_FILE}`);
});

describe('8 个用户场景详细测试', () => {
  let store: MockBookmarkStore;
  let executor: BashExecutor;
  let ctx: AgentContext;

  beforeEach(() => {
    const env = setupMockEnvironment();
    store = env.mockStore;
    executor = new BashExecutor(store);
    ctx = env.context;
  });

  // ============================================================
  // 场景 1: 整理混乱的书签
  // ============================================================
  describe('场景1: 整理混乱的书签', () => {
    it('把所有 React 相关的书签移动到一个新文件夹', async () => {
      logSection('场景1: 整理混乱的书签');
      logSubSection('任务: 把所有 React 相关的书签移动到一个新文件夹');
      
      // Step 1: 查看当前状态
      log('Step 1: 查看当前书签状态');
      let result = await executor.execute('wc', ctx);
      logCommand('wc', result);
      
      // Step 2: 进入书签栏
      log('Step 2: 进入书签栏');
      result = await executor.execute('cd 书签栏', ctx);
      logCommand('cd 书签栏', result);
      
      // Step 3: 创建目标文件夹
      log('Step 3: 创建 React收藏 文件夹');
      result = await executor.execute('mkdir React收藏', ctx);
      logCommand('mkdir React收藏', result);
      expect(result.success).toBe(true);
      
      // Step 4: 搜索 React 相关书签
      log('Step 4: 搜索所有 React 相关书签');
      result = await executor.execute('find React -type f', ctx);
      logCommand('find React -type f', result);
      expect(result.success).toBe(true);
      
      const reactBookmarks = result.data?.items || [];
      log(`  找到 ${reactBookmarks.length} 个 React 相关书签`);
      
      // Step 5: 移动书签
      log('Step 5: 移动书签到新文件夹');
      let movedCount = 0;
      for (const bm of reactBookmarks.slice(0, 3)) {
        const mvResult = await executor.execute(`mv "${bm.name}" React收藏`, ctx);
        logCommand(`mv "${bm.name}" React收藏`, mvResult);
        if (mvResult.success) movedCount++;
      }
      log(`  成功移动 ${movedCount} 个书签`);
      
      // Step 6: 验证结果
      log('Step 6: 验证移动结果');
      result = await executor.execute('cd React收藏', ctx);
      logCommand('cd React收藏', result);
      
      result = await executor.execute('ls', ctx);
      logCommand('ls', result);
      
      result = await executor.execute('wc', ctx);
      logCommand('wc', result);
      
      log(`✅ 场景1完成: 成功移动 ${movedCount} 个 React 书签到新文件夹`);
      expect(movedCount).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 场景 2: 按技术栈分类书签
  // ============================================================
  describe('场景2: 按技术栈分类书签', () => {
    it('创建前端框架分类结构并整理', async () => {
      logSection('场景2: 按技术栈分类书签');
      logSubSection('任务: 创建前端框架分类结构');
      
      // Step 1: 进入书签栏
      log('Step 1: 进入书签栏');
      let result = await executor.execute('cd 书签栏', ctx);
      logCommand('cd 书签栏', result);
      
      // Step 2: 创建分类结构
      log('Step 2: 创建前端框架分类结构');
      result = await executor.execute('mkdir 前端框架', ctx);
      logCommand('mkdir 前端框架', result);
      
      result = await executor.execute('cd 前端框架', ctx);
      logCommand('cd 前端框架', result);
      
      const frameworks = ['React', 'Vue', 'Angular', 'Svelte'];
      for (const fw of frameworks) {
        result = await executor.execute(`mkdir ${fw}`, ctx);
        logCommand(`mkdir ${fw}`, result);
      }
      
      // Step 3: 查看创建的结构
      log('Step 3: 查看创建的目录结构');
      result = await executor.execute('ls', ctx);
      logCommand('ls', result);
      
      result = await executor.execute('tree', ctx);
      logCommand('tree', result);
      
      // Step 4: 搜索并分类书签
      log('Step 4: 搜索各框架相关书签');
      for (const fw of frameworks.slice(0, 2)) {
        const findResult = await executor.execute(`find ${fw.toLowerCase()} -type f -limit 2`, ctx);
        logCommand(`find ${fw.toLowerCase()} -type f -limit 2`, findResult);
        
        // 复制到对应文件夹
        for (const bm of (findResult.data?.items || []).slice(0, 1)) {
          const cpResult = await executor.execute(`cp "${bm.name}" ${fw}`, ctx);
          logCommand(`cp "${bm.name}" ${fw}`, cpResult);
        }
      }
      
      // Step 5: 验证结果
      log('Step 5: 验证分类结果');
      result = await executor.execute('tree 2', ctx);
      logCommand('tree 2', result);
      
      log('✅ 场景2完成: 成功创建前端框架分类结构');
      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // 场景 3: 星标书签管理
  // ============================================================
  describe('场景3: 星标书签管理', () => {
    it('管理星标书签：列出、添加、取消', async () => {
      logSection('场景3: 星标书签管理');
      logSubSection('任务: 管理星标书签');
      
      // Step 1: 列出所有星标书签
      log('Step 1: 列出所有星标书签');
      let result = await executor.execute('find -starred', ctx);
      logCommand('find -starred', result);
      
      const initialStarred = result.data?.items || [];
      log(`  当前有 ${initialStarred.length} 个星标书签`);
      
      // Step 2: 搜索 GitHub 书签并加星标
      log('Step 2: 给 GitHub 书签加星标');
      result = await executor.execute('find github -type f', ctx);
      logCommand('find github -type f', result);
      
      const githubBookmarks = result.data?.items || [];
      let starredCount = 0;
      for (const bm of githubBookmarks.slice(0, 3)) {
        if (!bm.starred) {
          const starResult = await executor.execute(`star "${bm.name}"`, ctx);
          logCommand(`star "${bm.name}"`, starResult);
          if (starResult.success) starredCount++;
        }
      }
      log(`  新增 ${starredCount} 个星标`);
      
      // Step 3: 再次列出星标书签
      log('Step 3: 验证星标变化');
      result = await executor.execute('find -starred', ctx);
      logCommand('find -starred', result);
      
      const afterStarred = result.data?.items || [];
      log(`  现在有 ${afterStarred.length} 个星标书签`);
      
      // Step 4: 取消部分星标
      log('Step 4: 取消部分星标');
      for (const bm of afterStarred.slice(0, 2)) {
        const unstarResult = await executor.execute(`star "${bm.name}"`, ctx);
        logCommand(`star "${bm.name}" (取消)`, unstarResult);
      }
      
      // Step 5: 最终验证
      log('Step 5: 最终星标状态');
      result = await executor.execute('find -starred', ctx);
      logCommand('find -starred', result);
      
      log(`✅ 场景3完成: 星标管理功能正常`);
      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // 场景 4: 批量操作
  // ============================================================
  describe('场景4: 批量操作', () => {
    it('统计书签、复制备份、清理空文件夹', async () => {
      logSection('场景4: 批量操作');
      logSubSection('任务: 批量统计、备份、清理');
      
      // Step 1: 统计各文件夹书签数量
      log('Step 1: 统计各文件夹书签数量');
      let result = await executor.execute('wc', ctx);
      logCommand('wc (根目录)', result);
      
      result = await executor.execute('cd 书签栏', ctx);
      logCommand('cd 书签栏', result);
      
      result = await executor.execute('ls', ctx);
      logCommand('ls', result);
      
      const folders = (result.data?.items || []).filter(item => item.type === 'directory');
      log(`  书签栏下有 ${folders.length} 个文件夹`);
      
      for (const folder of folders.slice(0, 3)) {
        await executor.execute(`cd "${folder.name}"`, ctx);
        const wcResult = await executor.execute('wc', ctx);
        logCommand(`wc (${folder.name})`, wcResult);
        await executor.execute('cd ..', ctx);
      }
      
      // Step 2: 创建备份文件夹并复制星标书签
      log('Step 2: 备份星标书签');
      result = await executor.execute('mkdir 重要备份', ctx);
      logCommand('mkdir 重要备份', result);
      
      result = await executor.execute('find -starred', ctx);
      logCommand('find -starred', result);
      
      const starred = result.data?.items || [];
      let backupCount = 0;
      for (const bm of starred.slice(0, 5)) {
        const cpResult = await executor.execute(`cp "${bm.name}" 重要备份`, ctx);
        logCommand(`cp "${bm.name}" 重要备份`, cpResult);
        if (cpResult.success) backupCount++;
      }
      log(`  备份了 ${backupCount} 个星标书签`);
      
      // Step 3: 创建并清理空文件夹
      log('Step 3: 清理空文件夹');
      result = await executor.execute('mkdir 临时文件夹1', ctx);
      logCommand('mkdir 临时文件夹1', result);
      
      result = await executor.execute('mkdir 临时文件夹2', ctx);
      logCommand('mkdir 临时文件夹2', result);
      
      result = await executor.execute('cd 临时文件夹1', ctx);
      logCommand('cd 临时文件夹1', result);
      
      result = await executor.execute('ls', ctx);
      logCommand('ls (应该为空)', result);
      
      result = await executor.execute('cd ..', ctx);
      logCommand('cd ..', result);
      
      result = await executor.execute('rm 临时文件夹1', ctx);
      logCommand('rm 临时文件夹1', result);
      
      result = await executor.execute('rm 临时文件夹2', ctx);
      logCommand('rm 临时文件夹2', result);
      
      // Step 4: 验证清理结果
      log('Step 4: 验证清理结果');
      result = await executor.execute('find 临时文件夹 -type d', ctx);
      logCommand('find 临时文件夹 -type d', result);
      
      log(`✅ 场景4完成: 批量操作成功，备份 ${backupCount} 个书签`);
      expect(result.output).toBe('no results');
    });
  });

  // ============================================================
  // 场景 5: 高级搜索和导航
  // ============================================================
  describe('场景5: 高级搜索和导航', () => {
    it('搜索文档、查看详情、深层导航', async () => {
      logSection('场景5: 高级搜索和导航');
      logSubSection('任务: 高级搜索和导航');
      
      // Step 1: 搜索文档类书签
      log('Step 1: 搜索文档类书签');
      let result = await executor.execute('find documentation -type f', ctx);
      logCommand('find documentation -type f', result);
      
      const docs = result.data?.items || [];
      log(`  找到 ${docs.length} 个文档类书签`);
      
      // Step 2: 查看书签详细信息
      log('Step 2: 查看书签详细信息');
      if (docs.length > 0) {
        result = await executor.execute(`stat "${docs[0].name}"`, ctx);
        logCommand(`stat "${docs[0].name}"`, result);
        
        result = await executor.execute(`cat "${docs[0].name}"`, ctx);
        logCommand(`cat "${docs[0].name}"`, result);
      }
      
      // Step 3: 深层目录导航
      log('Step 3: 深层目录导航');
      result = await executor.execute('cd 书签栏', ctx);
      logCommand('cd 书签栏', result);
      
      result = await executor.execute('cd Development', ctx);
      logCommand('cd Development', result);
      
      result = await executor.execute('cd Frontend', ctx);
      logCommand('cd Frontend', result);
      
      result = await executor.execute('cd React', ctx);
      logCommand('cd React', result);
      
      result = await executor.execute('pwd', ctx);
      logCommand('pwd', result);
      
      result = await executor.execute('ls', ctx);
      logCommand('ls', result);
      
      // Step 4: 返回根目录
      log('Step 4: 返回根目录');
      result = await executor.execute('cd /', ctx);
      logCommand('cd /', result);
      
      result = await executor.execute('pwd', ctx);
      logCommand('pwd', result);
      
      log('✅ 场景5完成: 搜索和导航功能正常');
      expect(result.output).toBe('/');
    });
  });

  // ============================================================
  // 场景 6: 重命名和整理
  // ============================================================
  describe('场景6: 重命名和整理', () => {
    it('重命名书签和文件夹', async () => {
      logSection('场景6: 重命名和整理');
      logSubSection('任务: 重命名书签和文件夹');
      
      // Step 1: 添加测试书签
      log('Step 1: 添加测试书签');
      await store.addBookmark('https://example.com/test', 'Test-Bookmark-2024', '1');
      
      let result = await executor.execute('find Test-Bookmark -type f', ctx);
      logCommand('find Test-Bookmark -type f', result);
      
      // Step 2: 重命名书签
      log('Step 2: 重命名书签');
      result = await executor.execute('mv "Test-Bookmark-2024" "测试书签 2024"', ctx);
      logCommand('mv "Test-Bookmark-2024" "测试书签 2024"', result);
      expect(result.success).toBe(true);
      
      // Step 3: 验证重命名
      log('Step 3: 验证书签重命名');
      result = await executor.execute('find "测试书签" -type f', ctx);
      logCommand('find "测试书签" -type f', result);
      
      // Step 4: 创建并重命名文件夹
      log('Step 4: 创建并重命名文件夹');
      result = await executor.execute('cd 书签栏', ctx);
      logCommand('cd 书签栏', result);
      
      result = await executor.execute('mkdir OldFolderName', ctx);
      logCommand('mkdir OldFolderName', result);
      
      result = await executor.execute('mv OldFolderName NewFolderName', ctx);
      logCommand('mv OldFolderName NewFolderName', result);
      expect(result.success).toBe(true);
      
      // Step 5: 验证文件夹重命名
      log('Step 5: 验证文件夹重命名');
      result = await executor.execute('ls', ctx);
      logCommand('ls', result);
      
      log('✅ 场景6完成: 重命名功能正常');
      expect(result.output).toContain('NewFolderName');
    });
  });

  // ============================================================
  // 场景 7: 错误处理和边界情况
  // ============================================================
  describe('场景7: 错误处理和边界情况', () => {
    it('测试各种错误情况的处理', async () => {
      logSection('场景7: 错误处理和边界情况');
      logSubSection('任务: 测试错误处理');
      
      // Step 1: 删除不存在的书签
      log('Step 1: 尝试删除不存在的书签');
      let result = await executor.execute('rm "完全不存在的书签XYZ123"', ctx);
      logCommand('rm "完全不存在的书签XYZ123"', result);
      expect(result.success).toBe(false);
      log(`  预期失败: ${result.output}`);
      
      // Step 2: 进入不存在的文件夹
      log('Step 2: 尝试进入不存在的文件夹');
      result = await executor.execute('cd "不存在的文件夹ABC"', ctx);
      logCommand('cd "不存在的文件夹ABC"', result);
      expect(result.success).toBe(false);
      log(`  预期失败: ${result.output}`);
      
      // Step 3: 执行未知命令
      log('Step 3: 执行未知命令');
      result = await executor.execute('unknowncmd arg1 arg2', ctx);
      logCommand('unknowncmd arg1 arg2', result);
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(127);
      log(`  预期失败: exitCode=${result.exitCode}`);
      
      // Step 4: 空命令
      log('Step 4: 执行空命令');
      result = await executor.execute('', ctx);
      logCommand('(空命令)', result);
      expect(result.success).toBe(true);
      log(`  空命令正常处理`);
      
      // Step 5: 搜索不存在的内容
      log('Step 5: 搜索不存在的内容');
      result = await executor.execute('find "ZZZZNOTEXIST12345" -type f', ctx);
      logCommand('find "ZZZZNOTEXIST12345" -type f', result);
      expect(result.output).toBe('no results');
      log(`  搜索无结果正常处理`);
      
      // Step 6: 特殊字符处理
      log('Step 6: 特殊字符处理');
      await store.addBookmark('https://test.com', 'Test & Demo (2024)', '1');
      result = await executor.execute('find "Test & Demo" -type f', ctx);
      logCommand('find "Test & Demo" -type f', result);
      expect(result.success).toBe(true);
      log(`  特殊字符正常处理`);
      
      log('✅ 场景7完成: 错误处理机制正常');
    });
  });

  // ============================================================
  // 场景 8: 复杂工作流
  // ============================================================
  describe('场景8: 复杂工作流', () => {
    it('完整的项目书签整理工作流', async () => {
      logSection('场景8: 复杂工作流');
      logSubSection('任务: 完整的项目书签整理');
      
      // Step 1: 初始状态统计
      log('Step 1: 初始状态统计');
      let result = await executor.execute('wc', ctx);
      logCommand('wc', result);
      const initialBookmarks = result.data?.bookmarks;
      const initialFolders = result.data?.folders;
      log(`  初始: ${initialBookmarks} 书签, ${initialFolders} 文件夹`);
      
      // Step 2: 创建项目结构
      log('Step 2: 创建项目结构');
      result = await executor.execute('cd 书签栏', ctx);
      logCommand('cd 书签栏', result);
      
      result = await executor.execute('mkdir "MyProject-2024"', ctx);
      logCommand('mkdir "MyProject-2024"', result);
      
      result = await executor.execute('cd "MyProject-2024"', ctx);
      logCommand('cd "MyProject-2024"', result);
      
      const subfolders = ['文档', '代码', '工具', '参考'];
      for (const sf of subfolders) {
        result = await executor.execute(`mkdir ${sf}`, ctx);
        logCommand(`mkdir ${sf}`, result);
      }
      
      // Step 3: 收集相关书签
      log('Step 3: 收集相关书签');
      const keywords = ['documentation', 'github', 'api'];
      for (const kw of keywords) {
        result = await executor.execute(`find ${kw} -type f -limit 2`, ctx);
        logCommand(`find ${kw} -type f -limit 2`, result);
        
        for (const bm of (result.data?.items || []).slice(0, 1)) {
          const cpResult = await executor.execute(`cp "${bm.name}" 文档`, ctx);
          logCommand(`cp "${bm.name}" 文档`, cpResult);
        }
      }
      
      // Step 4: 标记重要书签
      log('Step 4: 标记重要书签');
      result = await executor.execute('cd 文档', ctx);
      logCommand('cd 文档', result);
      
      result = await executor.execute('ls', ctx);
      logCommand('ls', result);
      
      for (const item of (result.data?.items || []).slice(0, 2)) {
        if (item.type === 'file') {
          const starResult = await executor.execute(`star "${item.name}"`, ctx);
          logCommand(`star "${item.name}"`, starResult);
        }
      }
      
      // Step 5: 生成项目报告
      log('Step 5: 生成项目报告');
      result = await executor.execute('cd ..', ctx);
      logCommand('cd ..', result);
      
      result = await executor.execute('tree', ctx);
      logCommand('tree', result);
      
      result = await executor.execute('wc', ctx);
      logCommand('wc', result);
      
      // Step 6: 最终统计
      log('Step 6: 最终统计');
      result = await executor.execute('cd /', ctx);
      logCommand('cd /', result);
      
      result = await executor.execute('wc', ctx);
      logCommand('wc', result);
      
      const finalBookmarks = result.data?.bookmarks;
      const finalFolders = result.data?.folders;
      log(`  最终: ${finalBookmarks} 书签, ${finalFolders} 文件夹`);
      log(`  新增: ${(finalBookmarks as number) - (initialBookmarks as number)} 书签, ${(finalFolders as number) - (initialFolders as number)} 文件夹`);
      
      log('✅ 场景8完成: 复杂工作流执行成功');
      expect(result.success).toBe(true);
    });
  });
});
