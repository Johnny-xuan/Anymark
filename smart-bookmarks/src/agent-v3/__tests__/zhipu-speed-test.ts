/**
 * 智谱 API 响应速度测试
 * 运行: npx ts-node src/agent-v3/__tests__/zhipu-speed-test.ts
 */

const ZHIPU_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// 从环境变量或直接设置 API Key
const API_KEY = process.env.ZHIPU_API_KEY || '';

interface TestResult {
  testName: string;
  model: string;
  promptTokens: number;
  responseTokens: number;
  totalTime: number;
  firstTokenTime: number;
  tokensPerSecond: number;
}

async function testZhipuSpeed(
  model: string,
  prompt: string,
  testName: string
): Promise<TestResult> {
  const startTime = Date.now();
  let firstTokenTime = 0;
  let responseText = '';
  
  const response = await fetch(ZHIPU_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No reader');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          if (!firstTokenTime) {
            firstTokenTime = Date.now() - startTime;
          }
          responseText += content;
        }
      } catch (e) {
        // ignore
      }
    }
  }

  const totalTime = Date.now() - startTime;
  const responseTokens = responseText.length; // 简单估算
  const tokensPerSecond = responseTokens / (totalTime / 1000);

  return {
    testName,
    model,
    promptTokens: prompt.length,
    responseTokens,
    totalTime,
    firstTokenTime,
    tokensPerSecond,
  };
}

async function runTests() {
  if (!API_KEY) {
    console.error('❌ 请设置 ZHIPU_API_KEY 环境变量');
    console.log('   export ZHIPU_API_KEY=your_api_key');
    process.exit(1);
  }

  console.log('🚀 智谱 API 响应速度测试\n');
  console.log('=' .repeat(60));

  const tests = [
    {
      name: '简单问答',
      prompt: '你好，请用一句话介绍自己',
      models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus'],
    },
    {
      name: '代码生成',
      prompt: '用 TypeScript 写一个快速排序函数',
      models: ['glm-4-flash', 'glm-4-air'],
    },
    {
      name: '长文本生成',
      prompt: '请详细解释 React 的虚拟 DOM 工作原理，包括 diff 算法',
      models: ['glm-4-flash', 'glm-4-air'],
    },
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    console.log(`\n📝 测试: ${test.name}`);
    console.log(`   Prompt: ${test.prompt.slice(0, 50)}...`);
    console.log('-'.repeat(60));

    for (const model of test.models) {
      try {
        console.log(`   测试模型: ${model}...`);
        const result = await testZhipuSpeed(model, test.prompt, test.name);
        results.push(result);
        
        console.log(`   ✅ ${model}:`);
        console.log(`      首 Token: ${result.firstTokenTime}ms`);
        console.log(`      总耗时: ${result.totalTime}ms`);
        console.log(`      响应长度: ${result.responseTokens} 字符`);
        console.log(`      速度: ${result.tokensPerSecond.toFixed(1)} 字符/秒`);
      } catch (error) {
        console.log(`   ❌ ${model}: ${error}`);
      }
    }
  }

  // 汇总
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试汇总\n');
  
  const byModel = new Map<string, TestResult[]>();
  for (const r of results) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model)!.push(r);
  }

  for (const [model, modelResults] of byModel) {
    const avgFirstToken = modelResults.reduce((a, b) => a + b.firstTokenTime, 0) / modelResults.length;
    const avgTotal = modelResults.reduce((a, b) => a + b.totalTime, 0) / modelResults.length;
    const avgSpeed = modelResults.reduce((a, b) => a + b.tokensPerSecond, 0) / modelResults.length;
    
    console.log(`${model}:`);
    console.log(`  平均首 Token: ${avgFirstToken.toFixed(0)}ms`);
    console.log(`  平均总耗时: ${avgTotal.toFixed(0)}ms`);
    console.log(`  平均速度: ${avgSpeed.toFixed(1)} 字符/秒`);
    console.log();
  }
}

runTests().catch(console.error);
