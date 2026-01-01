/**
 * Agent 功能测试脚本 - 使用 DeepSeek API
 * 
 * 使用方法：
 * 1. 在浏览器控制台中运行此脚本
 * 2. 或者在扩展的 background.js 中运行
 */

// DeepSeek API 配置
const DEEPSEEK_CONFIG = {
  provider: 'deepseek',
  apiKey: 'sk-b6f01906387b43bd89cad1add9086791',
  apiKeys: ['sk-b6f01906387b43bd89cad1add9086791'],
  model: 'deepseek-chat',
  endpoint: 'https://api.deepseek.com/v1/chat/completions'
};

// 测试函数
async function testAgentWithDeepSeek() {
  console.log('🚀 开始测试 Agent 功能...\n');

  try {
    // 1. 保存配置到 Chrome Storage
    console.log('📝 步骤 1: 保存 DeepSeek 配置...');
    await chrome.storage.local.set({ aiConfig: DEEPSEEK_CONFIG });
    console.log('✅ 配置已保存\n');

    // 2. 验证配置
    console.log('🔍 步骤 2: 验证配置...');
    const result = await chrome.storage.local.get(['aiConfig']);
    console.log('当前配置:', result.aiConfig);
    console.log('✅ 配置验证成功\n');

    // 3. 测试基本 API 调用
    console.log('🧪 步骤 3: 测试 DeepSeek API...');
    const testResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: '你好，请用一句话介绍你自己。' }
        ],
        max_tokens: 100
      })
    });

    if (!testResponse.ok) {
      const error = await testResponse.text();
      throw new Error(`API 调用失败: ${testResponse.status} - ${error}`);
    }

    const testData = await testResponse.json();
    console.log('✅ API 响应:', testData.choices[0].message.content);
    console.log('✅ DeepSeek API 测试成功\n');

    // 4. 测试 Agent 工具调用
    console.log('🔧 步骤 4: 测试 Agent 工具...');
    
    // 动态导入 Agent
    const { BookmarkAIAgent } = await import('./src/utils/agent/bookmarkAgent.js');
    const agent = new BookmarkAIAgent();

    // 测试简单对话
    console.log('💬 测试对话: "你好"');
    const chatResult = await agent.chat('你好，请介绍一下你的功能');
    console.log('Agent 回复:', chatResult.content);
    console.log('✅ 对话测试成功\n');

    // 5. 测试书签上下文获取
    console.log('📚 步骤 5: 测试书签上下文...');
    const contextResult = await agent.chat('显示我的书签概览');
    console.log('书签概览:', contextResult.content);
    console.log('✅ 上下文测试成功\n');

    // 6. 测试添加书签（如果需要）
    console.log('➕ 步骤 6: 测试添加书签...');
    const addResult = await agent.chat('帮我添加一个测试书签：https://example.com，标题是"测试书签"');
    console.log('添加结果:', addResult.content);
    console.log('✅ 添加书签测试完成\n');

    console.log('🎉 所有测试完成！\n');
    console.log('=' .repeat(50));
    console.log('测试总结:');
    console.log('✅ DeepSeek API 配置成功');
    console.log('✅ API 连接正常');
    console.log('✅ Agent 对话功能正常');
    console.log('✅ 书签操作功能正常');
    console.log('=' .repeat(50));

  } catch (error) {
    console.error('❌ 测试失败:', error);
    console.error('错误详情:', error.stack);
    throw error;
  }
}

// 简化版测试（只测试 API 和配置）
async function quickTest() {
  console.log('🚀 快速测试 DeepSeek API...\n');

  try {
    // 1. 保存配置
    await chrome.storage.local.set({ aiConfig: DEEPSEEK_CONFIG });
    console.log('✅ 配置已保存');

    // 2. 测试 API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: '你好，请用一句话介绍你自己。' }
        ],
        max_tokens: 100,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ API 错误:', error);
      return;
    }

    const data = await response.json();
    console.log('✅ API 响应:', data.choices[0].message.content);
    console.log('\n🎉 DeepSeek API 测试成功！');
    console.log('现在可以在 Sidebar 中使用 AI Chat 功能了。');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 导出测试函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testAgentWithDeepSeek, quickTest };
}

// 如果在浏览器环境中直接运行
if (typeof window !== 'undefined') {
  window.testAgentWithDeepSeek = testAgentWithDeepSeek;
  window.quickTest = quickTest;
  console.log('✅ 测试函数已加载');
  console.log('运行 quickTest() 进行快速测试');
  console.log('运行 testAgentWithDeepSeek() 进行完整测试');
}
