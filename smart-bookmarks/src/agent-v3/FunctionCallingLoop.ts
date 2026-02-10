/**
 * FunctionCallingLoop - 原生 Function Calling 循环
 *
 * V4 架构核心：替代 ReActLoop 的文本解析方式，
 * 使用 OpenAI Function Calling 实现结构化工具调用。
 *
 * 关键改进：
 * 1. 中间迭代文本（"让我搜索..."）不发给用户，作为 thought 展示在思考面板
 * 2. 只有最终回答（无 tool_calls 时）才通过 onToken 发送给用户
 * 3. 工具调用通过结构化 JSON 传递，不再依赖正则解析
 * 4. 简单问候等不需要工具的场景，LLM 直接回复
 */

import type {
  AgentContext,
  AgentCallbacks,
  Step,
  Message,
  AgentConfig,
  AIMessage,
  ToolCall,
  OpenAITool,
} from './types';
import { DEFAULT_AGENT_CONFIG } from './types';
import { bashExecutor } from './BashExecutor';
import { aiService } from './aiService';
import { loadPrompts, type AgentPrompts } from './prompts';
import { getCurrentLanguage } from '../i18n/config';

/** 单次请求最大工具调用轮数 */
const MAX_TOOL_ITERATIONS = 10;

/** Observation 文本最大字符数 */
const MAX_OBSERVATION_CHARS = 4000;

/** 结构化数据最大字符数 */
const MAX_DATA_CHARS = 2000;

/**
 * bash 工具定义
 * 单一工具包装所有 BashExecutor 命令，保留通配符和命令链支持
 */
const BASH_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'bash',
    description: `Execute a bookmark management command. The bookmark system maps to a Unix-like filesystem.

Available commands (all support --id <ID> for precise targeting):
- ls [path] [-l] [--id <ID>] — List directory contents. -l shows IDs. --id lists a specific folder.
- cd <folder> [--id <ID>] — Change directory. --id navigates to a specific folder.
- pwd — Show current path
- tree [depth] — Display directory tree
- find <keyword> [-type f|d] [-starred] [-limit n] — Search bookmarks/folders
- cat <bookmark> [--id <ID>] — View bookmark details
- stat <name> [--id <ID>] — Show detailed info
- wc [path] — Count items
- mv <source> <dest> [--id <ID>] — Move or rename (supports wildcards for batch)
- cp <bookmark> <folder> [--id <ID>] — Copy bookmark (supports wildcards)
- rm <name> [--id <ID>] — Delete (supports wildcards)
- mkdir <name> — Create folder
- open <bookmark> [--id <ID>] — Open in browser
- star <bookmark> [--id <ID>] — Toggle star status

IMPORTANT - Handling same-name items:
Every bookmark/folder has a unique chrome ID. When a command returns "ambiguous name" with candidates, you MUST use --id <ID>. Use "ls -l" to see IDs.
Example workflow: ls -l → see [id:29428] → cd --id 29428 → ls -l
Tips: Quote names with spaces, chain with ; and &&, use wildcards for batch operations.`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute (e.g., "ls -l", "find react", "mv \\"GitHub\\" \\"Dev Tools\\"")',
        },
      },
      required: ['command'],
    },
  },
};

/**
 * FunctionCallingLoop 类
 */
export class FunctionCallingLoop {
  private context: AgentContext;
  private callbacks: AgentCallbacks | null;
  private config: AgentConfig;
  private prompts: AgentPrompts | null = null;

  constructor(
    context: AgentContext,
    callbacks: AgentCallbacks | null,
    config: Partial<AgentConfig> = {}
  ) {
    this.context = context;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  /**
   * Initialize prompts based on current language
   */
  private async initPrompts(): Promise<AgentPrompts> {
    if (!this.prompts) {
      const language = getCurrentLanguage();
      this.prompts = await loadPrompts(language);
    }
    return this.prompts;
  }

  /**
   * 运行 Function Calling 循环
   *
   * 关键设计：
   * - 每次 LLM 调用都实时流式输出 token（用户可看到 LLM 正在生成）
   * - 流式完成后，根据是否有 tool_calls 决定后续处理：
   *   - 有 tool_calls → 已流出的文本通知为 thought，执行工具后继续循环
   *   - 无 tool_calls → 已流出的文本就是最终回答，直接返回
   * - 通过 onStreamingReset 通知 UI 清空已流出的中间文本
   */
  async run(query: string, history: Message[]): Promise<string> {
    const messages: AIMessage[] = await this.buildMessages(query, history);

    let iteration = 0;

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      try {
        // 始终流式输出 token 到 UI（让用户实时看到 LLM 生成内容）
        const response = await this.callLLMStream(messages, true);

        // 如果没有工具调用，这就是最终回答（token 已经流式发给用户了）
        if (!response.tool_calls || response.tool_calls.length === 0) {
          return response.content || '';
        }

        // 有工具调用 → 这是中间迭代
        // 通知 UI：之前流式输出的文本是中间思考，需要清空流式显示
        this.callbacks?.onStreamingReset?.();

        // 将中间文本作为 thought 步骤发到思考面板
        if (response.content) {
          this.emitStep({
            type: 'thought',
            content: response.content,
            timestamp: Date.now(),
          });
        }

        // 将 assistant 消息（含 tool_calls）加入对话
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.tool_calls,
        });

        // 执行每个工具调用，将结果作为 tool 消息加入对话
        for (const toolCall of response.tool_calls) {
          const result = await this.executeToolCall(toolCall);

          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id || `call_${Date.now()}`,
            name: toolCall.function.name,
          });
        }

        // 让出事件循环，确保 React 能 flush 状态更新（思考面板实时刷新）
        await new Promise(resolve => setTimeout(resolve, 0));

        // 继续循环，让 LLM 基于工具结果继续响应
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.callbacks?.onError?.(err);
        throw err;
      }
    }

    // 安全上限：达到最大迭代次数
    return '任务较复杂，已达到最大工具调用次数。请尝试简化请求或分步执行。';
  }

  /**
   * 构建初始消息列表
   */
  private async buildMessages(query: string, history: Message[]): Promise<AIMessage[]> {
    const messages: AIMessage[] = [];
    const prompts = await this.initPrompts();

    // 1. System prompt（使用 FC 版本）
    messages.push({
      role: 'system',
      content: prompts.systemPromptFC,
    });

    // 2. 历史对话
    for (const msg of history) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // 3. 当前查询（带上下文前缀）
    const contextPrefix = prompts.buildContextPrefix(this.context.cwd.path);
    messages.push({
      role: 'user',
      content: contextPrefix + query,
    });

    return messages;
  }

  /**
   * 流式调用 LLM
   *
   * 始终将 token 实时转发给 UI，让用户看到 LLM 生成内容。
   * 如果最终发现有 tool_calls（中间迭代），调用方会通过
   * onStreamingReset 通知 UI 清空流式内容，并将文本转为 thought。
   */
  private async callLLMStream(
    messages: AIMessage[],
    streamToUser: boolean = true
  ): Promise<{
    content: string | null;
    tool_calls?: ToolCall[];
  }> {
    const response = await aiService.chatStream(
      {
        messages,
        tools: [BASH_TOOL],
        tool_choice: 'auto',
        temperature: this.config.temperature,
      },
      {
        onToken: (token) => {
          if (streamToUser) {
            this.callbacks?.onToken?.(token);
          }
        },
        onToolCall: (calls) => {
          // 工具调用完成时，发出 action 步骤通知 UI
          for (const call of calls) {
            let commandStr: string;
            try {
              const args = JSON.parse(call.function.arguments);
              commandStr = args.command || call.function.arguments;
            } catch {
              commandStr = call.function.arguments;
            }

            this.emitStep({
              type: 'action',
              content: `bash(${commandStr})`,
              toolName: 'bash',
              toolInput: commandStr,
              timestamp: Date.now(),
            });
          }
        },
        onError: (error) => {
          this.callbacks?.onError?.(error);
        },
      }
    );

    return response;
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(toolCall: ToolCall): Promise<string> {
    const { name, arguments: argsJson } = toolCall.function;

    if (name !== 'bash') {
      return JSON.stringify({ success: false, output: `Unknown tool: ${name}` });
    }

    // 解析参数
    let command: string;
    try {
      const args = JSON.parse(argsJson);
      command = args.command;
    } catch {
      // 某些模型可能直接传命令字符串而非 JSON
      command = argsJson;
    }

    if (!command || typeof command !== 'string') {
      const errorMsg = 'Missing or invalid command parameter';
      this.emitStep({
        type: 'observation',
        content: `error: ${errorMsg}`,
        toolResult: { success: false, message: errorMsg },
        timestamp: Date.now(),
      });
      return errorMsg;
    }

    // 执行命令
    const result = await bashExecutor.execute(command, this.context);

    // 发出 observation 步骤通知 UI
    this.emitStep({
      type: 'observation',
      content: result.output,
      toolResult: {
        success: result.success,
        message: result.output,
        data: result.data,
      },
      timestamp: Date.now(),
    });

    // 通知路径变化
    this.callbacks?.onPathChange?.(
      this.context.cwd.path,
      this.context.cwd.folderId
    );

    // 构建返回给 LLM 的结果（截断以控制上下文长度）
    const output = this.truncateForContext(result.output, MAX_OBSERVATION_CHARS);

    if (result.data) {
      const dataStr = JSON.stringify(result.data);
      const truncatedData = this.truncateForContext(dataStr, MAX_DATA_CHARS);
      return `${output}\n\nData: ${truncatedData}`;
    }

    return output;
  }

  /**
   * 发出步骤事件
   */
  private emitStep(step: Step): void {
    this.callbacks?.onStep?.(step);

    if (this.config.debug) {
      console.log(`[FCLoop] Step: ${step.type}`, step);
    }
  }

  /**
   * 截断文本以控制上下文长度
   */
  private truncateForContext(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
      return value;
    }
    const omitted = value.length - maxChars;
    return `${value.slice(0, maxChars)}\n...[truncated ${omitted} chars]`;
  }
}
