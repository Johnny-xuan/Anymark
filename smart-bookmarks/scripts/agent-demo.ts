#!/usr/bin/env npx ts-node
/**
 * Agent 终端演示脚本
 * 在终端中展示 Agent 处理各种任务的能力
 * 
 * 运行方式: npx ts-node scripts/agent-demo.ts
 */

// ============================================================================
// Mock Chrome API (必须在导入其他模块之前设置)
// ============================================================================

const mockStorage: Record<string, any> = {
  bookmarks: [],
  folders: [],
  userSettings: {
    chromeSyncEnabled: false,
    autoAnalyze: true,
    theme: 'dark',
  },
};

(global as any).chrome = {
  storage: {
    local: {
      get: async (keys: string | string[]) => {
        if (typeof keys === 'string') {
          return { [keys]: mockStorage[keys] };
        }
        const result: Record<string, any> = {};
        keys.forEach(key => {
          result[key] = mockStorage[key];
        });
        return result;
      },
      set: async (items: Record<string, any>) => {
        Object.assign(mockStorage, items);
      },
    },
  },
  tabs: {
    create: async (options: { url: string }) => {
      console.log(`  📂 [模拟] 打开标签页: ${options.url}`);
      return { id: Date.now(), url: options.url };
    },
  },
  runtime: {
    sendMessage: async () => {},
  },
  bookmarks: {
    getTree: async () => [{
      id: '0',
      title: '',
      children: [
        { id: '1', title: 'Bookmarks bar', children: [] },
        { id: '2', title: 'Other bookmarks', children: [] },
      ],
    }],
    create: async (options: any) => ({ id: `chrome-${Date.now()}`, ...options }),
    update: async () => ({}),
    remove: async () => {},
    move: async () => ({}),
    getChildren: async () => [],
    get: async (id: string) => [{ id, title: 'Test', parentId: '2' }],
  },
};

// ============================================================================
// 导入模块
// ============================================================================

import type { IBookmark, IFolder } from '../src/types/bookmark';

// ============================================================================
// 测试数据
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

function createTestData() {
  const bookmarks: IBookmark[] = [
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
    createTestBookmark({
      title: '未访问的教程',
      url: 'https://example.com/unvisited',
      folderPath: '/',
      folderId: 'folder-/',
      aiTags: [],
      analytics: { visitCount: 0, importance: 30 },
    }),
    createTestBookmark({
      title: 'React 文档 (重复)',
      url: 'https://react.dev',
      folderPath: '/',
      folderId: 'folder-/',
      aiTags: ['react'],
    }),
    createTestBookmark({
      title: '已删除的书签',
      url: 'https://example.com/deleted',
      folderPath: '/',
      folderId: 'folder-/',
      status: 'deleted',
    }),
    createTestBookmark({
      title: '很久没看的文章',
      url: 'https://example.com/old-article',
      folderPath: '/Archive',
      folderId: 'folder-/Archive',
      aiTags: ['article', 'old'],
      analytics: { visitCount: 2, lastVisit: Date.now() - 1000 * 60 * 60 * 24 * 100, importance: 20 },
    }),
  ];

  const folders: IFolder[] = [
    createTestFolder('Frontend'),
    createTestFolder('Backend'),
    createTestFolder('Archive'),
  ];

  return { bookmarks, folders };
}

// ============================================================================
// 演示函数
// ============================================================================

function printHeader(title: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  🤖 ${title}`);
  console.log('═'.repeat(60));
}

function printQuery(query: string) {
  console.log(`\n💬 用户: "${query}"`);
  console.log('─'.repeat(50));
}

function printResponse(response: any) {
  if (response.success) {
    console.log('✅ Agent 回复:\n');
    if (response.data?.message) {
      console.log(response.data.message);
    } else if (response.data?.overview) {
      console.log(response.data.overview);
    } else if (response.data?.report) {
      console.log(response.data.report);
    } else {
      console.log(JSON.stringify(response.data, null, 2));
    }
  } else {
    console.log('❌ 错误:', response.error);
  }
}

async function runDemo() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║     🔖 AnyMark Agent 终端演示                              ║');
  console.log('║     Smart Bookmark Manager with AI                         ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // 初始化测试数据
  const { bookmarks, folders } = createTestData();
  mockStorage.bookmarks = bookmarks;
  mockStorage.folders = folders;

  // 动态导入（在 mock 设置后）
  const { useBookmarkStore } = await import('../src/sidebar/store/bookmarkStore');
  const { contextTool, searchTool, bookmarkTool, organizeTool, folderTool } = await import('../src/utils/agent/tools/coreTools');

  // 设置 store 状态
  useBookmarkStore.setState({ bookmarks, folders });

  // ========== 演示 1: 获取书签库概览 ==========
  printHeader('演示 1: 获取书签库概览');
  printQuery('看看我的书签库');
  
  const overviewResult = await contextTool.execute({ action: 'overview' });
  printResponse(overviewResult);

  await sleep(1000);

  // ========== 演示 2: 搜索书签 ==========
  printHeader('演示 2: 搜索书签');
  printQuery('找我的 React 书签');
  
  const searchResult = await searchTool.execute({ query: 'React' });
  printResponse(searchResult);

  await sleep(1000);

  // ========== 演示 3: 查看星标书签 ==========
  printHeader('演示 3: 查看星标书签');
  printQuery('我的星标书签有哪些？');
  
  const starredResult = await contextTool.execute({ action: 'filter', filterType: 'starred' });
  printResponse(starredResult);

  await sleep(1000);

  // ========== 演示 4: 查看长尾书签 ==========
  printHeader('演示 4: 查看长尾书签');
  printQuery('有哪些书签很久没用了？');
  
  const longtailResult = await contextTool.execute({ action: 'filter', filterType: 'longtail' });
  printResponse(longtailResult);

  await sleep(1000);

  // ========== 演示 5: 分析书签库 ==========
  printHeader('演示 5: 分析书签库');
  printQuery('帮我分析一下书签库，找出重复和未访问的');
  
  const analyzeResult = await organizeTool.execute({
    action: 'analyze',
    analyzeOptions: {
      findDuplicates: true,
      findUnvisited: true,
      findScattered: true,
    },
  });
  printResponse(analyzeResult);

  await sleep(1000);

  // ========== 演示 6: 添加新书签 ==========
  printHeader('演示 6: 添加新书签');
  printQuery('帮我收藏 https://nextjs.org，标题是 Next.js 文档');
  
  const addResult = await bookmarkTool.execute({
    action: 'add',
    url: 'https://nextjs.org',
    title: 'Next.js 文档',
    tags: ['nextjs', 'react', 'framework'],
  });
  printResponse(addResult);

  await sleep(1000);

  // ========== 演示 7: 创建文件夹 ==========
  printHeader('演示 7: 创建文件夹');
  printQuery('创建一个叫 "学习资料" 的文件夹');
  
  const folderResult = await folderTool.execute({
    action: 'create',
    name: '学习资料',
    parentPath: '/',
  });
  printResponse(folderResult);

  await sleep(1000);

  // ========== 演示 8: 移动书签 ==========
  printHeader('演示 8: 移动书签');
  printQuery('把刚才添加的 Next.js 文档移动到 Frontend 文件夹');
  
  const newBookmarkId = addResult.data?.id;
  if (newBookmarkId) {
    const moveResult = await bookmarkTool.execute({
      action: 'move',
      bookmarkId: newBookmarkId,
      targetFolderId: 'folder-/Frontend',
    });
    printResponse(moveResult);
  }

  await sleep(1000);

  // ========== 演示 9: 获取统计信息 ==========
  printHeader('演示 9: 获取统计信息');
  printQuery('给我看看书签库的统计数据');
  
  const statsResult = await contextTool.execute({ action: 'stats' });
  if (statsResult.success) {
    const stats = statsResult.data;
    console.log('✅ Agent 回复:\n');
    console.log(`📊 书签统计：`);
    console.log(`  • 总数: ${stats.total} 个`);
    console.log(`  • 已分析: ${stats.analyzed} 个`);
    console.log(`  • 星标: ${stats.starred} 个`);
    console.log(`  • 从未访问: ${stats.unvisited} 个`);
    console.log(`  • 回收站: ${stats.deleted} 个`);
    console.log(`\n📈 活跃度分布：`);
    console.log(`  • 🟢 活跃: ${stats.decayStats.active} 个`);
    console.log(`  • 🟡 冷却中: ${stats.decayStats.cooling} 个`);
    console.log(`  • 🔵 冷门: ${stats.decayStats.cold} 个`);
    console.log(`  • ❄️ 冻结: ${stats.decayStats.frozen} 个`);
    console.log(`\n🏷️ 热门标签：`);
    stats.topTags.slice(0, 5).forEach((t: any, i: number) => {
      console.log(`  ${i + 1}. ${t.tag} (${t.count}次)`);
    });
  }

  await sleep(1000);

  // ========== 演示 10: 按文件夹搜索 ==========
  printHeader('演示 10: 按文件夹搜索');
  printQuery('Frontend 文件夹里有什么？');
  
  const folderSearchResult = await searchTool.execute({
    query: '*',
    filters: { folder: '/Frontend' },
  });
  printResponse(folderSearchResult);

  // 结束
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║     ✨ 演示完成！                                          ║');
  console.log('║     Agent 成功处理了 10 个不同类型的任务                   ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 运行演示
runDemo().catch(console.error);
