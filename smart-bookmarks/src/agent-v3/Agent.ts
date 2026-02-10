/**
 * Agent V3/V4 - 主入口类
 *
 * 设计原则：
 * 1. 单一入口 - 所有请求通过 process() 方法
 * 2. 智能路由 - 直接命令走快速路径，复杂请求走 Agent 循环
 * 3. 状态简单 - 只维护必要的上下文和历史
 * 4. V4 优先 - 默认使用 Function Calling，不支持时自动回退 ReAct
 */

import type {
  AgentContext,
  AgentCallbacks,
  Message,
  AgentConfig,
  WorkingDirectory,
} from './types';
import { DEFAULT_AGENT_CONFIG } from './types';
import { bashExecutor } from './BashExecutor';
import { ReActLoop } from './ReActLoop';
import { FunctionCallingLoop } from './FunctionCallingLoop';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Agent 类 - V3 架构主入口
 */
export class Agent {
  private context: AgentContext;
  private callbacks: AgentCallbacks | null = null;
  private history: Message[] = [];
  private config: AgentConfig;

  constructor(sessionId?: string, config: Partial<AgentConfig> = {}) {
    this.context = {
      cwd: { folderId: null, path: '/' },
      sessionId: sessionId || generateId(),
    };
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: AgentCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 获取当前工作目录
   */
  getCwd(): WorkingDirectory {
    return { ...this.context.cwd };
  }

  /**
   * 设置当前工作目录
   */
  setCwd(cwd: WorkingDirectory): void {
    this.context.cwd = { ...cwd };
  }

  /**
   * 处理用户请求 - 主入口
   */
  async process(input: string): Promise<string> {
    const trimmed = input.trim();
    if (!trimmed) {
      return '';
    }

    // 1. 判断是否是直接命令
    if (this.isDirectCommand(trimmed)) {
      return this.executeDirectCommand(trimmed);
    }

    // 2. 否则进入 Agent 循环（FC 优先，ReAct 兜底）
    return this.runAgentLoop(trimmed);
  }

  /**
   * 判断是否是直接命令
   * 直接命令不需要 LLM 参与，直接执行
   */
  private isDirectCommand(input: string): boolean {
    // 以 / 开头的命令
    if (input.startsWith('/')) {
      return true;
    }

    // 常见的 bash 命令
    const directCommands = [
      'ls', 'dir',
      'cd',
      'pwd',
      'tree',
      'help',
    ];

    const firstWord = input.split(/\s+/)[0].toLowerCase();
    return directCommands.includes(firstWord);
  }

  /**
   * 直接执行命令（不经过 LLM）
   */
  private async executeDirectCommand(command: string): Promise<string> {
    // 移除开头的 / 如果有
    const cmd = command.startsWith('/') ? command.slice(1) : command;

    const result = await bashExecutor.execute(cmd, this.context);

    // 通知路径变化
    this.callbacks?.onPathChange?.(
      this.context.cwd.path,
      this.context.cwd.folderId
    );

    // 格式化输出为代码块（保留换行）
    const formattedOutput = this.formatCommandOutput(result.output);

    // 记录到历史
    this.history.push({ role: 'user', content: command });
    this.history.push({ role: 'assistant', content: formattedOutput });

    // 限制历史长度
    this.trimHistory();

    return formattedOutput;
  }

  /**
   * 格式化命令输出
   * 将多行输出包装为代码块，单行输出保持原样
   */
  private formatCommandOutput(output: string): string {
    if (!output) return output;
    
    // 如果输出包含换行，包装为代码块
    if (output.includes('\n')) {
      return '```\n' + output + '\n```';
    }
    
    // 单行输出用行内代码
    return '`' + output + '`';
  }

  /**
   * Agent 循环路由
   * FC 优先，不支持时自动回退到 ReAct
   */
  private async runAgentLoop(query: string): Promise<string> {
    if (this.config.useFunctionCalling) {
      try {
        return await this.runFunctionCallingLoop(query);
      } catch (error) {
        // 如果是模型不支持 FC 的错误，回退到 ReAct
        if (this.isFunctionCallingError(error)) {
          console.warn('[Agent] Function calling not supported, falling back to ReAct');
          return this.runReActLoop(query);
        }
        throw error;
      }
    }
    return this.runReActLoop(query);
  }

  /**
   * 运行 Function Calling 循环（V4）
   */
  private async runFunctionCallingLoop(query: string): Promise<string> {
    const loop = new FunctionCallingLoop(this.context, this.callbacks, this.config);

    try {
      const answer = await loop.run(query, this.history);

      // 记录到历史
      this.history.push({ role: 'user', content: query });
      this.history.push({ role: 'assistant', content: answer });

      // 限制历史长度
      this.trimHistory();

      return answer;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks?.onError?.(err);
      throw err;
    }
  }

  /**
   * 运行 ReAct 循环（V3，作为兜底）
   */
  private async runReActLoop(query: string): Promise<string> {
    const loop = new ReActLoop(this.context, this.callbacks, this.config);

    try {
      const answer = await loop.run(query, this.history);

      // 记录到历史
      this.history.push({ role: 'user', content: query });
      this.history.push({ role: 'assistant', content: answer });

      // 限制历史长度
      this.trimHistory();

      return answer;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks?.onError?.(err);
      throw err;
    }
  }

  /**
   * 检测是否为 Function Calling 不支持的错误
   */
  private isFunctionCallingError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        (msg.includes('tool') && msg.includes('not supported')) ||
        (msg.includes('function') && msg.includes('not supported')) ||
        (msg.includes('tools') && msg.includes('invalid')) ||
        (msg.includes('400') && (msg.includes('tool') || msg.includes('function'))) ||
        (msg.includes('422') && (msg.includes('tool') || msg.includes('function')))
      );
    }
    return false;
  }

  /**
   * 限制历史长度
   */
  private trimHistory(): void {
    const maxMessages = 20; // 保留最近 20 条消息
    if (this.history.length > maxMessages) {
      this.history = this.history.slice(-maxMessages);
    }
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * 获取历史
   */
  getHistory(): Message[] {
    return [...this.history];
  }

  /**
   * 加载历史记录（从存档恢复时使用）
   */
  loadHistory(messages: Array<{ role: string; content: string }>): void {
    this.history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    this.trimHistory();
  }

  /**
   * 加载完整状态（历史 + 工作目录）
   */
  loadState(state: {
    messages?: Array<{ role: string; content: string }>;
    cwd?: { path: string; folderId: string | null };
  }): void {
    if (state.messages) {
      this.loadHistory(state.messages);
    }
    if (state.cwd) {
      this.context.cwd = {
        path: state.cwd.path,
        folderId: state.cwd.folderId,
      };
    }
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string {
    return this.context.sessionId;
  }
}
