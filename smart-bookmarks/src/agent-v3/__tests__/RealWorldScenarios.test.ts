/**
 * 真实场景测试 - 模拟用户日常使用
 * 
 * 测试 Agent 在真实场景下的思考过程和执行能力
 * 使用 GLM-4.7 API 进行实际对话测试
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { MockBookmarkStore } from '../mock';
import { BashExecutor } from '../BashExecutor';
import { ReActLoop } from '../ReActLoop';
import type { AgentContext, AgentCallbacks, Step } from '../types';
import { DEFAULT_AGENT_CONFIG } from '../types';

// 日志收集器
const logs: string[] = [];

function log(message: string) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const line = `[${timestamp}] ${message}`;
  logs.push(line);
  console.log(line);
}

function logSection(title: string) {
  log('');
  log('═'.repeat(70));
  log(`  ${title}`);
  log('═'.repeat(70));
}

function logThought(thought: string) {
  log(`💭 Thought: ${thought}`);
}

function logAction(action: string, input: string) {
  log(`🔧 Action: ${action}`);
  log(`   Input: ${input}`);
}

function logObservation(obs: string) {
  const lines = obs.split('\n').slice(0, 5);
  log(`👁️ Observation: ${lines.join(' | ')}${obs.split('\n').length > 5 ? '...' : ''}`);
}

function logAnswer(answer: string) {
  log(`✅ Answer: ${answer.slice(0, 100)}${answer.length > 100 ? '...' : ''}`);
}

// 测试结束后输出完整日志
afterAll(() => {
  console.log('\n\n📝 完整测试日志:');
  console.log('─'.repeat(70));
  console.log(logs.join('\n'));
});

// GLM-4.7 API 配置
const GLM_CONFIG = {
  endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions',
  apiKey: '76db1e0dd4984c519ad40d2779c08724.pnEqlPkJ6megt015',
  model: 'glm-4.7',
};

// 模拟 chrome.storage API
function setupChromeStorageMock() {
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn().mockImplementation(async (keys: string[]) => {
          if (keys.includes('aiConfig')) {
            return {
              aiConfig: {
                provider: 'zhipu',
                apiKey: GLM_CONFIG.apiKey,
                model: GLM_CONFIG.model,
                endpoint: GLM_CONFIG.endpoint,
              },
            };
          }
          return {};
        }),
      },
    },
    tabs: {
      create: vi.fn(),
    },
  };
}

/**
 * 测试 Agent - 带详细日志
 */
class TestAgent {
  private context: AgentContext;
  private bashExecutor: BashExecutor;
  private callbacks: AgentCallbacks | null = null;

  constructor(store: MockBookmarkStore, sessionId: string) {
    this.context = {
      cwd: { folderId: null, path: '/' },
      sessionId,
    };
    this.bashExecutor = new BashExecutor(store);
  }

  setCallbacks(callbacks: AgentCallbacks): void {
    this.callbacks = callbacks;
  }

  async process(input: string): Promise<string> {
    const trimmed = input.trim();
    if (!trimmed) return '';

    if (this.isDirectCommand(trimmed)) {
      return this.executeDirectCommand(trimmed);
    }

    return this.runReActLoop(trimmed);
  }

  private isDirectCommand(input: string): boolean {
    if (input.startsWith('/')) return true;
    const directCommands = ['ls', 'dir', 'cd', 'pwd', 'tree', 'help'];
    const firstWord = input.split(/\s+/)[0].toLowerCase();
    return directCommands.includes(firstWord);
  }

  private async executeDirectCommand(command: string): Promise<string> {
    const cmd = command.startsWith('/') ? command.slice(1) : command;
    const result = await this.bashExecutor.execute(cmd, this.context);
    this.callbacks?.onPathChange?.(this.context.cwd.path, this.context.cwd.folderId);
    return result.output;
  }

  private async runReActLoop(query: string): Promise<string> {
    const loop = new TestReActLoop(
      this.context,
      this.callbacks,
      DEFAULT_AGENT_CONFIG,
      this.bashExecutor
    );
    return loop.run(query, []);
  }
}

/**
 * 自定义 ReActLoop - 带详细日志
 */
class TestReActLoop extends ReActLoop {
  private injectedBashExecutor: BashExecutor;

  constructor(
    context: AgentContext,
    callbacks: AgentCallbacks | null,
    config: typeof DEFAULT_AGENT_CONFIG,
    bashExecutor: BashExecutor
  ) {
    super(context, callbacks, config);
    this.injectedBashExecutor = bashExecutor;
  }

  async run(query: string, history: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
    return this.runWithInjectedExecutor(query);
  }

  private async runWithInjectedExecutor(query: string): Promise<string> {
    const { aiService } = await import('../aiService');
    const { REACT_SYSTEM_PROMPT, buildContextPrefix } = await import('../prompts');
    
    let iteration = 0;
    const maxIterations = 10;
    const trajectory: Step[] = [];
    const context = (this as any).context as AgentContext;
    const callbacks = (this as any).callbacks as AgentCallbacks | null;

    while (iteration < maxIterations) {
      iteration++;
      log(`\n--- 迭代 ${iteration} ---`);

      const messages = [
        { role: 'system' as const, content: REACT_SYSTEM_PROMPT },
        { role: 'user' as const, content: buildContextPrefix(context.cwd.path) + query },
      ];

      if (trajectory.length > 0) {
        const trajectoryText = trajectory.map(step => {
          switch (step.type) {
            case 'thought': return `Thought: ${step.content}`;
            case 'action': return `Action: bash\nAction Input: ${step.toolInput}`;
            case 'observation': return `Observation: ${step.content}`;
            default: return '';
          }
        }).join('\n');
        messages.push({ role: 'assistant' as const, content: trajectoryText });
      }

      const response = await aiService.chat({ messages, temperature: 0.3 });
      const content = response.content || '';

      const parsed = this.parseResponse(content);

      if (parsed.thought) {
        logThought(parsed.thought);
        trajectory.push({ type: 'thought', content: parsed.thought, timestamp: Date.now() });
        callbacks?.onStep?.({ type: 'thought', content: parsed.thought, timestamp: Date.now() });
      }

      if (parsed.answer) {
        logAnswer(parsed.answer);
        return parsed.answer;
      }

      if (parsed.action) {
        logAction(parsed.action.tool, parsed.action.input);
        trajectory.push({
          type: 'action',
          content: `${parsed.action.tool}(${parsed.action.input})`,
          toolName: parsed.action.tool,
          toolInput: parsed.action.input,
          timestamp: Date.now(),
        });

        const result = await this.injectedBashExecutor.execute(parsed.action.input, context);
        logObservation(result.output);

        trajectory.push({
          type: 'observation',
          content: result.output,
          toolResult: { success: result.success, message: result.output, data: result.data },
          timestamp: Date.now(),
        });

        callbacks?.onPathChange?.(context.cwd.path, context.cwd.folderId);
      }

      if (!parsed.action && !parsed.answer) {
        if (content.trim()) {
          return content.trim();
        }
      }
    }

    return '任务较复杂，已达到最大迭代次数。';
  }
}

describe('真实场景测试 - Agent 思考过程', () => {
  let store: MockBookmarkStore;
  let agent: TestAgent;

  beforeEach(async () => {
    setupChromeStorageMock();
    store = new MockBookmarkStore();
    store.clear();
    agent = new TestAgent(store, 'real-world-test');
    await setupRealWorldData(store);
  });

  // 设置真实世界的书签数据
  async function setupRealWorldData(store: MockBookmarkStore) {
    // 创建文件夹结构
    const devFolderId = await store.createFolder('开发资源', '1');
    const learnFolderId = await store.createFolder('学习资料', '1');
    const toolsFolderId = await store.createFolder('常用工具', '1');
    
    // 开发资源 - 前端框架
    await store.addBookmark('https://react.dev', 'React 官方文档', devFolderId!);
    await store.addBookmark('https://vuejs.org', 'Vue.js 官方文档', devFolderId!);
    await store.addBookmark('https://angular.io', 'Angular 官方文档', devFolderId!);
    await store.addBookmark('https://nextjs.org', 'Next.js 框架', devFolderId!);
    await store.addBookmark('https://nuxt.com', 'Nuxt.js 框架', devFolderId!);
    
    // 开发资源 - 后端
    await store.addBookmark('https://nodejs.org', 'Node.js 官网', devFolderId!);
    await store.addBookmark('https://expressjs.com', 'Express.js 文档', devFolderId!);
    await store.addBookmark('https://fastapi.tiangolo.com', 'FastAPI 文档', devFolderId!);
    
    // 学习资料
    await store.addBookmark('https://www.coursera.org', 'Coursera 在线课程', learnFolderId!);
    await store.addBookmark('https://www.udemy.com', 'Udemy 课程平台', learnFolderId!);
    await store.addBookmark('https://leetcode.com', 'LeetCode 刷题', learnFolderId!);
    await store.addBookmark('https://github.com', 'GitHub 代码托管', learnFolderId!);
    
    // 常用工具
    await store.addBookmark('https://chat.openai.com', 'ChatGPT', toolsFolderId!);
    await store.addBookmark('https://claude.ai', 'Claude AI', toolsFolderId!);
    await store.addBookmark('https://www.notion.so', 'Notion 笔记', toolsFolderId!);
    await store.addBookmark('https://figma.com', 'Figma 设计工具', toolsFolderId!);
    
    // 书签栏根目录 - 杂乱的书签（模拟用户随手保存）
    await store.addBookmark('https://twitter.com', '推特', '1');
    await store.addBookmark('https://weibo.com', '微博', '1');
    await store.addBookmark('https://zhihu.com', '知乎', '1');
    await store.addBookmark('https://bilibili.com', 'B站', '1');
    await store.addBookmark('https://youtube.com', 'YouTube', '1');
    await store.addBookmark('https://netflix.com', 'Netflix', '1');
    await store.addBookmark('https://spotify.com', 'Spotify', '1');
    
    // 临时保存的链接
    await store.addBookmark('https://temp-article-1.com', '待读文章1', '1');
    await store.addBookmark('https://temp-article-2.com', '待读文章2', '1');
    await store.addBookmark('https://temp-video.com', '待看视频', '1');

    log('📚 测试数据已设置:');
    log(`   书签: ${store.bookmarks.length} 个`);
    log(`   文件夹: ${store.folders.length} 个`);
  }

  // ============================================================
  // 场景 A: 整理杂乱的书签
  // ============================================================
  describe('场景A: 整理杂乱的书签', () => {
    it('用户说："帮我把书签栏里的社交媒体网站整理到一个文件夹"', async () => {
      logSection('场景A: 整理社交媒体书签');
      
      const userQuery = '帮我把书签栏里的社交媒体网站整理到一个文件夹';
      log(`👤 用户: ${userQuery}`);

      const response = await agent.process(userQuery);
      
      log('\n📋 最终结果:');
      log(response);

      // 验证
      const socialFolder = store.folders.find(f => 
        f.title.includes('社交') || f.title.includes('媒体') || f.title.includes('Social')
      );
      expect(socialFolder).toBeDefined();
      
    }, 120000);
  });

  // ============================================================
  // 场景 B: 查找特定类型的书签
  // ============================================================
  describe('场景B: 查找特定书签', () => {
    it('用户说："我想找一下之前保存的 AI 相关的网站"', async () => {
      logSection('场景B: 查找 AI 相关书签');
      
      const userQuery = '我想找一下之前保存的 AI 相关的网站';
      log(`👤 用户: ${userQuery}`);

      const response = await agent.process(userQuery);
      
      log('\n📋 最终结果:');
      log(response);

      // 验证响应中包含 AI 相关书签
      expect(response.toLowerCase()).toMatch(/chatgpt|claude|ai/i);
      
    }, 60000);
  });

  // ============================================================
  // 场景 C: 清理临时书签
  // ============================================================
  describe('场景C: 清理临时书签', () => {
    it('用户说："把那些待读、待看的临时链接都删掉吧"', async () => {
      logSection('场景C: 清理临时书签');
      
      const userQuery = '把那些待读、待看的临时链接都删掉吧';
      log(`👤 用户: ${userQuery}`);

      const beforeCount = store.bookmarks.filter(b => 
        b.title.includes('待读') || b.title.includes('待看')
      ).length;
      log(`删除前: ${beforeCount} 个临时书签`);

      const response = await agent.process(userQuery);
      
      log('\n📋 最终结果:');
      log(response);

      const afterCount = store.bookmarks.filter(b => 
        b.title.includes('待读') || b.title.includes('待看')
      ).length;
      log(`删除后: ${afterCount} 个临时书签`);

      expect(afterCount).toBeLessThan(beforeCount);
      
    }, 60000);
  });

  // ============================================================
  // 场景 D: 统计书签情况
  // ============================================================
  describe('场景D: 了解书签情况', () => {
    it('用户说："我的书签现在是什么情况？有多少个？"', async () => {
      logSection('场景D: 统计书签情况');
      
      const userQuery = '我的书签现在是什么情况？有多少个？';
      log(`👤 用户: ${userQuery}`);

      const response = await agent.process(userQuery);
      
      log('\n📋 最终结果:');
      log(response);

      // 验证响应中包含数量信息
      expect(response).toMatch(/\d+/);
      
    }, 60000);
  });

  // ============================================================
  // 场景 E: 复杂的多步骤任务
  // ============================================================
  describe('场景E: 复杂多步骤任务', () => {
    it('用户说："创建一个娱乐文件夹，把视频网站都移进去，然后给 B站 加个星标"', async () => {
      logSection('场景E: 复杂多步骤任务');
      
      const userQuery = '创建一个娱乐文件夹，把视频网站都移进去，然后给 B站 加个星标';
      log(`👤 用户: ${userQuery}`);

      const response = await agent.process(userQuery);
      
      log('\n📋 最终结果:');
      log(response);

      // 验证文件夹创建
      const entertainFolder = store.folders.find(f => f.title.includes('娱乐'));
      expect(entertainFolder).toBeDefined();

      // 验证 B站 星标
      const bilibili = store.bookmarks.find(b => b.title.includes('B站'));
      if (bilibili) {
        log(`B站星标状态: ${bilibili.starred ? '⭐ 已星标' : '未星标'}`);
      }
      
    }, 120000);
  });

  // ============================================================
  // 场景 F: 模糊查询
  // ============================================================
  describe('场景F: 模糊查询', () => {
    it('用户说："那个什么 express 的文档在哪"', async () => {
      logSection('场景F: 模糊查询');
      
      const userQuery = '那个什么 express 的文档在哪';
      log(`👤 用户: ${userQuery}`);

      const response = await agent.process(userQuery);
      
      log('\n📋 最终结果:');
      log(response);

      // 验证找到了 Express
      expect(response.toLowerCase()).toContain('express');
      
    }, 60000);
  });
});
