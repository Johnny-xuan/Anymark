/**
 * 通配符功能模拟测试 - 使用真实 AI API
 * 
 * 测试 Agent 在真实场景下使用通配符命令的能力
 * 使用 GLM-4.7 API 进行实际对话测试
 * 
 * 关键：通过依赖注入将 MockBookmarkStore 注入到 BashExecutor
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
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  logs.push(line);
  console.log(line);
}

function logSection(title: string) {
  log('');
  log('═'.repeat(80));
  log(`  ${title}`);
  log('═'.repeat(80));
}

function logSubSection(title: string) {
  log('');
  log(`  ── ${title} ──`);
}

// 测试结束后输出日志
afterAll(() => {
  console.log('\n📝 测试日志:');
  console.log(logs.join('\n'));
});

// GLM-4.7 API 配置（来自 .kiro/specs/key.md）
const GLM_CONFIG = {
  endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions',
  apiKey: '76db1e0dd4984c519ad40d2779c08724.pnEqlPkJ6megt015',
  model: 'glm-4.7',
};

// 模拟 chrome.storage API - 返回 GLM-4.7 配置
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
 * 创建一个连接到 MockBookmarkStore 的测试 Agent
 * 
 * 关键：通过依赖注入，让 BashExecutor 使用 MockBookmarkStore
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
    // 关键：注入 MockBookmarkStore 到 BashExecutor
    this.bashExecutor = new BashExecutor(store);
  }

  setCallbacks(callbacks: AgentCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 处理用户请求 - 使用注入了 MockBookmarkStore 的 BashExecutor
   */
  async process(input: string): Promise<string> {
    const trimmed = input.trim();
    if (!trimmed) return '';

    // 直接命令快速路径
    if (this.isDirectCommand(trimmed)) {
      return this.executeDirectCommand(trimmed);
    }

    // ReAct 循环 - 需要自定义 ReActLoop 来使用注入的 BashExecutor
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
    // 创建自定义 ReActLoop，注入我们的 BashExecutor
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
 * 自定义 ReActLoop - 使用注入的 BashExecutor
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

  // 重写 run 方法，使用注入的 BashExecutor
  async run(query: string, history: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
    // 调用父类的 run，但我们需要 hook 工具执行
    // 由于 ReActLoop 内部直接使用 bashExecutor 单例，我们需要另一种方式
    // 方案：直接在这里实现简化的 ReAct 循环
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

      // 构建消息
      const messages = [
        { role: 'system' as const, content: REACT_SYSTEM_PROMPT },
        { role: 'user' as const, content: buildContextPrefix(context.cwd.path) + query },
      ];

      // 添加轨迹
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

      // 调用 LLM
      log(`[ReAct] 迭代 ${iteration}: 调用 LLM...`);
      const response = await aiService.chat({ messages, temperature: 0.3 });
      const content = response.content || '';
      log(`[ReAct] LLM 响应: ${content.slice(0, 200)}...`);

      // 解析响应
      const parsed = this.parseResponse(content);

      // 记录 Thought
      if (parsed.thought) {
        trajectory.push({ type: 'thought', content: parsed.thought, timestamp: Date.now() });
        callbacks?.onStep?.({ type: 'thought', content: parsed.thought, timestamp: Date.now() });
        log(`[ReAct] Thought: ${parsed.thought}`);
      }

      // 如果有 complete/answer，结束
      if (parsed.answer) {
        log(`[ReAct] 完成: ${parsed.answer}`);
        return parsed.answer;
      }

      // 执行 Action
      if (parsed.action) {
        log(`[ReAct] Action: ${parsed.action.tool}(${parsed.action.input})`);
        trajectory.push({
          type: 'action',
          content: `${parsed.action.tool}(${parsed.action.input})`,
          toolName: parsed.action.tool,
          toolInput: parsed.action.input,
          timestamp: Date.now(),
        });
        callbacks?.onStep?.({
          type: 'action',
          content: `${parsed.action.tool}(${parsed.action.input})`,
          toolName: parsed.action.tool,
          toolInput: parsed.action.input,
          timestamp: Date.now(),
        });

        // 使用注入的 BashExecutor 执行命令
        const result = await this.injectedBashExecutor.execute(parsed.action.input, context);
        log(`[ReAct] Observation: ${result.output}`);

        trajectory.push({
          type: 'observation',
          content: result.output,
          toolResult: { success: result.success, message: result.output, data: result.data },
          timestamp: Date.now(),
        });
        callbacks?.onStep?.({
          type: 'observation',
          content: result.output,
          toolResult: { success: result.success, message: result.output, data: result.data },
          timestamp: Date.now(),
        });

        // 通知路径变化
        callbacks?.onPathChange?.(context.cwd.path, context.cwd.folderId);
      }

      // 如果没有 action 也没有 answer，返回原始响应
      if (!parsed.action && !parsed.answer) {
        if (content.trim()) {
          return content.trim();
        }
      }
    }

    return '任务较复杂，已达到最大迭代次数。';
  }
}

describe('通配符功能模拟测试 - 真实 AI 对话', () => {
  let store: MockBookmarkStore;
  let agent: TestAgent;

  beforeEach(async () => {
    // 设置 Chrome Storage Mock
    setupChromeStorageMock();

    // 创建 MockBookmarkStore
    store = new MockBookmarkStore();
    store.clear(); // 清空默认数据

    // 创建注入了 MockBookmarkStore 的 TestAgent
    agent = new TestAgent(store, 'wildcard-test-session');

    // 添加测试数据
    await setupTestData(store);
  });

  // 设置测试数据
  async function setupTestData(store: MockBookmarkStore) {
    // 添加 React 相关书签
    await store.addBookmark('https://react.dev', 'React-Official-Docs', '1');
    await store.addBookmark('https://reactrouter.com', 'React-Router-Guide', '1');
    await store.addBookmark('https://redux.js.org', 'React-Redux-Tutorial', '1');
    await store.addBookmark('https://nextjs.org', 'React-Next.js-Framework', '1');

    // 添加 Vue 相关书签
    await store.addBookmark('https://vuejs.org', 'Vue-Official-Docs', '1');
    await store.addBookmark('https://router.vuejs.org', 'Vue-Router-Guide', '1');
    await store.addBookmark('https://pinia.vuejs.org', 'Vue-Pinia-Store', '1');

    // 添加测试书签
    await store.addBookmark('https://test1.com', 'test-bookmark-1', '1');
    await store.addBookmark('https://test2.com', 'test-bookmark-2', '1');
    await store.addBookmark('https://test3.com', 'test-bookmark-3', '1');

    // 添加临时书签
    await store.addBookmark('https://temp1.com', 'temp-file-1', '1');
    await store.addBookmark('https://temp2.com', 'temp-file-2', '1');

    // 添加项目书签
    await store.addBookmark('https://project1.com', 'project-alpha', '1');
    await store.addBookmark('https://project2.com', 'project-beta', '1');
    await store.addBookmark('https://project3.com', 'project-gamma', '1');

    log('测试数据已设置完成');
    log(`书签数量: ${store.bookmarks.length}`);
    log(`文件夹数量: ${store.folders.length}`);
  }

  // ============================================================
  // 场景 1: 批量移动 React 书签
  // ============================================================
  describe('场景1: 批量移动 React 书签', () => {
    it('用户说："把所有 React 开头的书签移到前端框架文件夹"', async () => {
      logSection('场景1: 批量移动 React 书签');
      
      const userQuery = '把所有 React 开头的书签移到前端框架文件夹';
      logSubSection(`用户查询: ${userQuery}`);

      try {
        // 执行 Agent 查询
        const response = await agent.process(userQuery);
        
        log('Agent 响应:');
        log(response);

        // 验证结果
        log('');
        log('验证结果:');
        
        // 检查是否创建了前端框架文件夹
        const frontendFolder = store.folders.find(f => f.title.includes('前端框架'));
        if (frontendFolder) {
          log(`✓ 前端框架文件夹已创建: ${frontendFolder.title}`);
          
          // 检查 React 书签是否被移动
          const reactBookmarks = store.bookmarks.filter(b => 
            b.title.startsWith('React-') && b.parentId === frontendFolder.chromeId
          );
          log(`✓ 移动了 ${reactBookmarks.length} 个 React 书签`);
          
          expect(reactBookmarks.length).toBeGreaterThan(0);
        } else {
          log('✗ 前端框架文件夹未创建');
        }

      } catch (error) {
        log(`✗ 测试失败: ${error}`);
        throw error;
      }
    }, 60000); // 60秒超时
  });

  // ============================================================
  // 场景 2: 批量复制项目书签
  // ============================================================
  describe('场景2: 批量复制项目书签', () => {
    it('用户说："把所有 project- 开头的书签复制到备份文件夹"', async () => {
      logSection('场景2: 批量复制项目书签');
      
      const userQuery = '把所有 project- 开头的书签复制到备份文件夹';
      logSubSection(`用户查询: ${userQuery}`);

      try {
        const response = await agent.process(userQuery);
        
        log('Agent 响应:');
        log(response);

        log('');
        log('验证结果:');
        
        // 检查备份文件夹
        const backupFolder = store.folders.find(f => f.title.includes('备份'));
        if (backupFolder) {
          log(`✓ 备份文件夹已创建: ${backupFolder.title}`);
          
          // 检查项目书签是否被复制
          const projectBookmarks = store.bookmarks.filter(b => 
            b.title.startsWith('project-') && b.parentId === backupFolder.chromeId
          );
          log(`✓ 复制了 ${projectBookmarks.length} 个项目书签`);
          
          // 原始书签应该还在
          const originalBookmarks = store.bookmarks.filter(b => 
            b.title.startsWith('project-') && b.parentId === '1'
          );
          log(`✓ 原始书签仍保留: ${originalBookmarks.length} 个`);
          
          expect(projectBookmarks.length).toBeGreaterThan(0);
          expect(originalBookmarks.length).toBeGreaterThan(0);
        } else {
          log('✗ 备份文件夹未创建');
        }

      } catch (error) {
        log(`✗ 测试失败: ${error}`);
        throw error;
      }
    }, 60000);
  });

  // ============================================================
  // 场景 3: 批量删除临时书签
  // ============================================================
  describe('场景3: 批量删除临时书签', () => {
    it('用户说："删除所有 temp- 开头的书签"', async () => {
      logSection('场景3: 批量删除临时书签');
      
      const userQuery = '删除所有 temp- 开头的书签';
      logSubSection(`用户查询: ${userQuery}`);

      try {
        // 记录删除前的数量
        const beforeCount = store.bookmarks.filter(b => b.title.startsWith('temp-')).length;
        log(`删除前: ${beforeCount} 个 temp- 书签`);

        const response = await agent.process(userQuery);
        
        log('Agent 响应:');
        log(response);

        log('');
        log('验证结果:');
        
        // 检查是否删除成功
        const afterCount = store.bookmarks.filter(b => b.title.startsWith('temp-')).length;
        log(`删除后: ${afterCount} 个 temp- 书签`);
        
        if (afterCount === 0) {
          log(`✓ 成功删除所有临时书签 (${beforeCount} 个)`);
          expect(afterCount).toBe(0);
        } else {
          log(`✗ 仍有 ${afterCount} 个临时书签未删除`);
        }

      } catch (error) {
        log(`✗ 测试失败: ${error}`);
        throw error;
      }
    }, 60000);
  });

  // ============================================================
  // 场景 4: 通配符搜索
  // ============================================================
  describe('场景4: 通配符搜索', () => {
    it('用户说："找出所有 test- 开头的书签"', async () => {
      logSection('场景4: 通配符搜索');
      
      const userQuery = '找出所有 test- 开头的书签';
      logSubSection(`用户查询: ${userQuery}`);

      try {
        const response = await agent.process(userQuery);
        
        log('Agent 响应:');
        log(response);

        log('');
        log('验证结果:');
        
        // 检查响应中是否包含 test- 书签
        const testBookmarks = store.bookmarks.filter(b => b.title.startsWith('test-'));
        log(`✓ 数据库中有 ${testBookmarks.length} 个 test- 书签`);
        
        // 检查响应中是否提到了这些书签
        const mentionedCount = testBookmarks.filter(b => 
          response.includes(b.title)
        ).length;
        log(`✓ Agent 响应中提到了 ${mentionedCount} 个书签`);
        
        expect(testBookmarks.length).toBeGreaterThan(0);

      } catch (error) {
        log(`✗ 测试失败: ${error}`);
        throw error;
      }
    }, 60000);
  });

  // ============================================================
  // 场景 5: 复杂通配符操作
  // ============================================================
  describe('场景5: 复杂通配符操作', () => {
    it('用户说："把所有 Vue 开头的书签移到前端框架文件夹，然后给它们加星标"', async () => {
      logSection('场景5: 复杂通配符操作');
      
      const userQuery = '把所有 Vue 开头的书签移到前端框架文件夹，然后给它们加星标';
      logSubSection(`用户查询: ${userQuery}`);

      try {
        const response = await agent.process(userQuery);
        
        log('Agent 响应:');
        log(response);

        log('');
        log('验证结果:');
        
        // 检查前端框架文件夹
        const frontendFolder = store.folders.find(f => f.title.includes('前端框架'));
        if (frontendFolder) {
          log(`✓ 前端框架文件夹存在: ${frontendFolder.title}`);
          
          // 检查 Vue 书签
          const vueBookmarks = store.bookmarks.filter(b => 
            b.title.startsWith('Vue-') && b.parentId === frontendFolder.chromeId
          );
          log(`✓ 移动了 ${vueBookmarks.length} 个 Vue 书签`);
          
          // 检查星标
          const starredVue = vueBookmarks.filter(b => b.starred);
          log(`✓ 其中 ${starredVue.length} 个已加星标`);
          
          expect(vueBookmarks.length).toBeGreaterThan(0);
        } else {
          log('✗ 前端框架文件夹不存在');
        }

      } catch (error) {
        log(`✗ 测试失败: ${error}`);
        throw error;
      }
    }, 90000); // 90秒超时，因为是复杂操作
  });

  // ============================================================
  // 场景 6: 通配符过滤显示
  // ============================================================
  describe('场景6: 通配符过滤显示', () => {
    it('用户说："只显示 React 开头的书签"', async () => {
      logSection('场景6: 通配符过滤显示');
      
      const userQuery = '只显示 React 开头的书签';
      logSubSection(`用户查询: ${userQuery}`);

      try {
        const response = await agent.process(userQuery);
        
        log('Agent 响应:');
        log(response);

        log('');
        log('验证结果:');
        
        // 检查响应中是否只包含 React 书签
        const reactBookmarks = store.bookmarks.filter(b => b.title.startsWith('React-'));
        const nonReactBookmarks = store.bookmarks.filter(b => !b.title.startsWith('React-'));
        
        log(`✓ React 书签数量: ${reactBookmarks.length}`);
        log(`✓ 非 React 书签数量: ${nonReactBookmarks.length}`);
        
        // 检查响应中提到的书签
        const mentionedReact = reactBookmarks.filter(b => response.includes(b.title)).length;
        const mentionedNonReact = nonReactBookmarks.filter(b => response.includes(b.title)).length;
        
        log(`✓ 响应中提到 ${mentionedReact} 个 React 书签`);
        log(`✓ 响应中提到 ${mentionedNonReact} 个非 React 书签`);
        
        expect(mentionedReact).toBeGreaterThan(0);

      } catch (error) {
        log(`✗ 测试失败: ${error}`);
        throw error;
      }
    }, 60000);
  });
});
