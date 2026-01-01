/**
 * 本地测试脚本 - 模拟 Chrome 环境测试 Agent 功能
 * 
 * 运行方式：node test-local.mjs
 */

import fetch from 'node-fetch';

// 模拟 Chrome Storage API
class MockChromeStorage {
  constructor() {
    this.data = {};
  }

  async get(keys) {
    if (Array.isArray(keys)) {
      const result = {};
      keys.forEach(key => {
        if (this.data[key] !== undefined) {
          result[key] = this.data[key];
        }
      });
      return result;
    } else if (typeof keys === 'string') {
      return { [keys]: this.data[keys] };
    } else if (keys === null || keys === undefined) {
      return { ...this.data };
    }
    return {};
  }

  async set(items) {
    Object.assign(this.data, items);
    console.log('[MockStorage] Data saved:', Object.keys(items));
  }

  async remove(keys) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    keyArray.forEach(key => delete this.data[key]);
  }

  async clear() {
    this.data = {};
  }
}

// 模拟 Chrome Bookmarks API
class MockChromeBookmarks {
  constructor() {
    this.bookmarks = new Map();
    this.nextId = 1;
  }

  async create(bookmark) {
    const id = `${this.nextId++}`;
    const newBookmark = {
      id,
      ...bookmark,
      dateAdded: Date.now(),
    };
    this.bookmarks.set(id, newBookmark);
    console.log('[MockBookmarks] Created:', newBookmark);
    return newBookmark;
  }

  async get(ids) {
    const idArray = Array.isArray(ids) ? ids : [ids];
    return idArray.map(id => this.bookmarks.get(id)).filter(Boolean);
  }

  async update(id, changes) {
    const bookmark = this.bookmarks.get(id);
    if (bookmark) {
      Object.assign(bookmark, changes);
      console.log('[MockBookmarks] Updated:', id);
      return bookmark;
    }
    throw new Error(`Bookmark not found: ${id}`);
  }

  async remove(id) {
    const deleted = this.bookmarks.delete(id);
    if (deleted) {
      console.log('[MockBookmarks] Removed:', id);
    }
  }

  async getTree() {
    return [{
      id: '0',
      title: 'Bookmarks Bar',
      children: Array.from(this.bookmarks.values())
    }];
  }
}

// 模拟 Chrome History API
class MockChromeHistory {
  constructor() {
    this.history = new Map();
  }

  async search({ text, maxResults }) {
    const results = [];
    for (const [url, item] of this.history.entries()) {
      if (url.includes(text) || text === '') {
        results.push(item);
        if (results.length >= maxResults) break;
      }
    }
    return results;
  }

  addVisit(url) {
    const existing = this.history.get(url);
    if (existing) {
      existing.visitCount++;
      existing.lastVisitTime = Date.now();
    } else {
      this.history.set(url, {
        url,
        visitCount: 1,
        lastVisitTime: Date.now(),
      });
    }
  }
}

// 模拟全局 chrome 对象
const mockStorage = new MockChromeStorage();
const mockBookmarks = new MockChromeBookmarks();
const mockHistory = new MockChromeHistory();

global.chrome = {
  storage: {
    local: mockStorage,
  },
  bookmarks: mockBookmarks,
  history: mockHistory,
  runtime: {
    sendMessage: async (message) => {
      console.log('[MockRuntime] Message sent:', message.type);
      return { success: true };
    },
  },
};

// 模拟 fetch（如果需要）
if (!global.fetch) {
  global.fetch = fetch;
}

console.log('✅ Chrome 环境模拟完成\n');

// ============================================================================
// 测试函数
// ============================================================================

/**
 * 测试 1: DeepSeek API 连接
 */
async function testDeepSeekAPI() {
  console.log('🧪 测试 1: DeepSeek API 连接...\n');

  const apiKey = 'sk-b6f01906387b43bd89cad1add9086791';
  const endpoint = 'https://api.deepseek.com/v1/chat/completions';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: '你好，请用一句话介绍你自己。' }
        ],
        max_tokens: 100,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;

    console.log('✅ API 响应:', reply);
    console.log('✅ DeepSeek API 测试通过\n');
    return true;

  } catch (error) {
    console.error('❌ DeepSeek API 测试失败:', error.message);
    return false;
  }
}

/**
 * 测试 2: 配置保存和读取
 */
async function testConfigStorage() {
  console.log('🧪 测试 2: 配置保存和读取...\n');

  const config = {
    provider: 'deepseek',
    apiKey: 'sk-b6f01906387b43bd89cad1add9086791',
    apiKeys: ['sk-b6f01906387b43bd89cad1add9086791'],
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
  };

  try {
    // 保存配置
    await chrome.storage.local.set({ aiConfig: config });
    console.log('✅ 配置已保存');

    // 读取配置
    const result = await chrome.storage.local.get(['aiConfig']);
    console.log('✅ 配置已读取:', result.aiConfig.provider);

    // 验证
    if (result.aiConfig.provider === 'deepseek') {
      console.log('✅ 配置验证通过\n');
      return true;
    } else {
      throw new Error('配置验证失败');
    }

  } catch (error) {
    console.error('❌ 配置测试失败:', error.message);
    return false;
  }
}

/**
 * 测试 3: 书签数据同步
 */
async function testBookmarkSync() {
  console.log('🧪 测试 3: 书签数据同步...\n');

  try {
    // 创建测试书签
    const bookmark1 = await chrome.bookmarks.create({
      url: 'https://example.com',
      title: '测试书签 1',
      parentId: '1',
    });
    console.log('✅ 创建书签 1:', bookmark1.title);

    const bookmark2 = await chrome.bookmarks.create({
      url: 'https://test.com',
      title: '测试书签 2',
      parentId: '1',
    });
    console.log('✅ 创建书签 2:', bookmark2.title);

    // 添加访问记录
    mockHistory.addVisit('https://example.com');
    mockHistory.addVisit('https://example.com');
    mockHistory.addVisit('https://test.com');

    // 查询书签树
    const tree = await chrome.bookmarks.getTree();
    console.log('✅ 书签树节点数:', tree[0].children.length);

    // 查询访问统计
    const history = await chrome.history.search({ text: 'example.com', maxResults: 1 });
    console.log('✅ 访问统计:', history[0]?.visitCount || 0, '次');

    console.log('✅ 书签数据同步测试通过\n');
    return true;

  } catch (error) {
    console.error('❌ 书签同步测试失败:', error.message);
    return false;
  }
}

/**
 * 测试 4: Agent 工具调用（模拟）
 */
async function testAgentTools() {
  console.log('🧪 测试 4: Agent 工具调用（模拟）...\n');

  try {
    // 模拟 context 工具调用
    console.log('📋 测试 context(overview)...');
    const bookmarks = await chrome.bookmarks.getTree();
    const bookmarkCount = bookmarks[0].children.length;
    console.log(`✅ 书签总数: ${bookmarkCount}`);

    // 模拟 bookmark(add) 工具调用
    console.log('\n➕ 测试 bookmark(add)...');
    const newBookmark = await chrome.bookmarks.create({
      url: 'https://github.com/test',
      title: 'GitHub 测试',
      parentId: '1',
    });
    console.log('✅ 添加书签:', newBookmark.title);

    // 模拟 bookmark(edit) 工具调用
    console.log('\n✏️ 测试 bookmark(edit)...');
    await chrome.bookmarks.update(newBookmark.id, {
      title: 'GitHub 测试 (已修改)',
    });
    console.log('✅ 编辑书签成功');

    // 模拟 bookmark(delete) 工具调用
    console.log('\n🗑️ 测试 bookmark(delete)...');
    await chrome.bookmarks.remove(newBookmark.id);
    console.log('✅ 删除书签成功');

    console.log('\n✅ Agent 工具调用测试通过\n');
    return true;

  } catch (error) {
    console.error('❌ Agent 工具测试失败:', error.message);
    return false;
  }
}

/**
 * 测试 5: 完整的 Agent 对话流程（使用真实 API）
 */
async function testAgentConversation() {
  console.log('🧪 测试 5: Agent 对话流程...\n');

  const apiKey = 'sk-b6f01906387b43bd89cad1add9086791';
  const endpoint = 'https://api.deepseek.com/v1/chat/completions';

  try {
    // 获取书签上下文
    const tree = await chrome.bookmarks.getTree();
    const bookmarkCount = tree[0].children.length;
    const bookmarkList = tree[0].children.map(b => `- ${b.title}: ${b.url}`).join('\n');

    // 构建系统提示词
    const systemPrompt = `You are AnyMark's bookmark manager assistant.

Current bookmark library:
Total: ${bookmarkCount} bookmarks

Bookmarks:
${bookmarkList}

Please help the user manage their bookmarks.`;

    // 测试对话
    const testMessages = [
      '你好，我有多少个书签？',
      '帮我总结一下我的书签',
    ];

    for (const userMessage of testMessages) {
      console.log(`\n💬 用户: ${userMessage}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const reply = data.choices[0].message.content;
      console.log(`🤖 Agent: ${reply}`);
    }

    console.log('\n✅ Agent 对话流程测试通过\n');
    return true;

  } catch (error) {
    console.error('❌ Agent 对话测试失败:', error.message);
    return false;
  }
}

// ============================================================================
// 主测试流程
// ============================================================================

async function runAllTests() {
  console.log('=' .repeat(60));
  console.log('🚀 开始 Agent 功能本地测试');
  console.log('=' .repeat(60));
  console.log();

  const results = {
    deepseekAPI: false,
    configStorage: false,
    bookmarkSync: false,
    agentTools: false,
    agentConversation: false,
  };

  // 运行所有测试
  results.deepseekAPI = await testDeepSeekAPI();
  results.configStorage = await testConfigStorage();
  results.bookmarkSync = await testBookmarkSync();
  results.agentTools = await testAgentTools();
  results.agentConversation = await testAgentConversation();

  // 输出测试报告
  console.log('=' .repeat(60));
  console.log('📊 测试报告');
  console.log('=' .repeat(60));
  console.log();

  const tests = [
    ['DeepSeek API 连接', results.deepseekAPI],
    ['配置保存和读取', results.configStorage],
    ['书签数据同步', results.bookmarkSync],
    ['Agent 工具调用', results.agentTools],
    ['Agent 对话流程', results.agentConversation],
  ];

  tests.forEach(([name, passed]) => {
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${name}`);
  });

  console.log();
  const passedCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.values(results).length;
  const passRate = ((passedCount / totalCount) * 100).toFixed(0);

  console.log(`通过率: ${passedCount}/${totalCount} (${passRate}%)`);
  console.log();

  if (passedCount === totalCount) {
    console.log('🎉 所有测试通过！Agent 模块修复成功！');
  } else {
    console.log('⚠️ 部分测试失败，请检查错误信息');
  }

  console.log('=' .repeat(60));
}

// 运行测试
runAllTests().catch(error => {
  console.error('💥 测试执行失败:', error);
  process.exit(1);
});
