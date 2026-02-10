/**
 * ReActLoop - ReAct 循环实现
 * 
 * 核心原则：
 * 1. 数据不压缩 - Observation 完整传递给 LLM
 * 2. 简单直接 - 没有复杂的上下文管理
 * 3. 可追踪 - 每个步骤都有回调
 */

import type {
  AgentContext,
  AgentCallbacks,
  Step,
  Trajectory,
  ParsedResponse,
  Message,
  AgentConfig,
} from './types';
import { DEFAULT_AGENT_CONFIG } from './types';
import { bashExecutor } from './BashExecutor';
import { aiService } from './aiService';
import { loadPrompts, type AgentPrompts } from './prompts';
import { getCurrentLanguage } from '../i18n/config';

const MAX_OBSERVATION_CHARS = 4000;
const MAX_DATA_CHARS = 2000;

/**
 * ReActLoop 类
 */
export class ReActLoop {
  private context: AgentContext;
  private callbacks: AgentCallbacks | null;
  private trajectory: Trajectory;
  private config: AgentConfig;
  private prompts: AgentPrompts | null = null;

  constructor(
    context: AgentContext,
    callbacks: AgentCallbacks | null,
    config: Partial<AgentConfig> = {}
  ) {
    this.context = context;
    this.callbacks = callbacks;
    this.trajectory = { steps: [], startTime: Date.now() };
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
   * 运行 ReAct 循环
   */
  async run(
    query: string,
    history: Message[]
  ): Promise<string> {
    let iteration = 0;

    while (iteration < this.config.maxIterations) {
      iteration++;

      try {
        // 1. 构建 prompt
        const messages = await this.buildMessages(query, history);

        // 2. 调用 LLM
        const response = await this.callLLM(messages);

        // 3. 解析响应
        const parsed = this.parseResponse(response);

        // 4. 记录 Thought
        if (parsed.thought) {
          this.addStep({
            type: 'thought',
            content: parsed.thought,
            timestamp: Date.now(),
          });
        }

        // 5. 如果有 complete，结束循环
        if (parsed.answer) {
          // complete 的内容通常是简短的状态说明
          this.addStep({
            type: 'complete',
            content: parsed.answer,
            timestamp: Date.now(),
          });
          this.trajectory.endTime = Date.now();
          
          // 如果之前没有 answer 输出过，才输出 complete 的内容
          // 检查是否已有 answer 类型的步骤
          const hasAnswerStep = this.trajectory.steps.some(
            s => s.type === 'answer'
          );
          
          if (!hasAnswerStep && this.callbacks?.onToken) {
            await this.streamAnswer(parsed.answer);
          }
          
          return parsed.answer;
        }

        // 5.5 如果有 intermediateAnswer（answer action），输出但继续循环
        if (parsed.intermediateAnswer) {
          this.addStep({
            type: 'answer',
            content: parsed.intermediateAnswer,
            timestamp: Date.now(),
          });
          
          // 流式输出中间答案
          if (this.callbacks?.onToken) {
            await this.streamAnswer(parsed.intermediateAnswer);
          }
          // 继续循环，不 return
          continue; // 明确继续下一次迭代
        }

        // 6. 执行 Action
        if (parsed.action) {
          // 记录 Action
          this.addStep({
            type: 'action',
            content: `${parsed.action.tool}(${parsed.action.input})`,
            toolName: parsed.action.tool,
            toolInput: parsed.action.input,
            timestamp: Date.now(),
          });

          // 执行工具
          const result = await bashExecutor.execute(
            parsed.action.input,
            this.context
          );

          // 记录 Observation（完整数据，不压缩）
          this.addStep({
            type: 'observation',
            content: result.output,
            toolResult: {
              success: result.success,
              message: result.output,
              data: result.data, // 完整保留
            },
            timestamp: Date.now(),
          });

          // 通知路径变化
          this.callbacks?.onPathChange?.(
            this.context.cwd.path,
            this.context.cwd.folderId
          );
        }

        // 如果没有 action 也没有 answer，可能是格式错误
        if (!parsed.action && !parsed.answer) {
          // 尝试将整个响应作为答案
          if (response.trim()) {
            // 流式输出
            if (this.callbacks?.onToken) {
              await this.streamAnswer(response.trim());
            }
            return response;
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.callbacks?.onError?.(err);
        throw err;
      }
    }

    // 达到最大迭代次数
    this.trajectory.endTime = Date.now();
    return '任务较复杂，已达到最大迭代次数。请尝试简化请求或分步执行。';
  }

  /**
   * 构建消息列表
   */
  private async buildMessages(query: string, history: Message[]): Promise<Message[]> {
    const messages: Message[] = [];
    const prompts = await this.initPrompts();

    // 1. System prompt (dynamically loaded based on language)
    messages.push({
      role: 'system',
      content: prompts.systemPrompt,
    });

    // 2. 历史对话
    for (const msg of history) {
      messages.push(msg);
    }

    // 3. 当前查询（带上下文前缀）
    const contextPrefix = prompts.buildContextPrefix(this.context.cwd.path);
    messages.push({
      role: 'user',
      content: contextPrefix + query,
    });

    // 4. 当前轨迹（Thought/Action/Observation）
    if (this.trajectory.steps.length > 0) {
      const trajectoryText = this.buildTrajectoryText();
      messages.push({
        role: 'assistant',
        content: trajectoryText,
      });
    }

    return messages;
  }

  /**
   * 构建轨迹文本
   * 关键：Observation 包含完整数据
   */
  private buildTrajectoryText(): string {
    const parts: string[] = [];

    for (const step of this.trajectory.steps) {
      switch (step.type) {
        case 'thought':
          parts.push(`Thought: ${step.content}`);
          break;
        case 'action':
          parts.push(`Action: bash`);
          parts.push(`Action Input: ${step.toolInput}`);
          break;
        case 'observation':
          // Observation 过长会显著拖慢后续迭代，截断到合理长度
          parts.push(`Observation: ${this.truncateForContext(step.content, MAX_OBSERVATION_CHARS)}`);
          // 结构化数据同样截断，避免 prompt 膨胀
          if (step.toolResult?.data) {
            const serialized = JSON.stringify(step.toolResult.data);
            parts.push(`Data: ${this.truncateForContext(serialized, MAX_DATA_CHARS)}`);
          }
          break;
        case 'answer':
          // answer action 的输出
          parts.push(`Action: answer`);
          parts.push(`Action Input: ${step.content}`);
          break;
        case 'complete':
          // complete action 的输出
          parts.push(`Action: complete`);
          parts.push(`Action Input: ${step.content}`);
          break;
      }
    }

    return parts.join('\n');
  }

  /**
   * 调用 LLM（流式）
   *
   * 使用流式 API 减少 TTFB（首字节时间），即使需要累积完整响应后再解析。
   * 流式模式下服务端边生成边发送，比非流式等待全部生成后才返回更快。
   *
   * 注意：ReAct 格式文本（Thought/Action）不直接显示给用户，
   * 思考过程通过 onStep 回调展示在 Thinking 组件中。
   */
  private async callLLM(messages: Message[]): Promise<string> {
    let fullResponse = '';

    await aiService.chatStream(
      {
        messages,
        temperature: this.config.temperature,
      },
      {
        onToken: (token) => {
          fullResponse += token;
        },
      }
    );

    return fullResponse;
  }

  /**
   * 解析 LLM 响应
   */
  parseResponse(response: string): ParsedResponse {
    const result: ParsedResponse = {};

    // 提取 Thought（兼容中英文标签）
    const thoughtMatch = response.match(/(?:Thought|思考)\s*[:：]\s*(.+?)(?=\n(?:Action|动作|Final Answer|最终答案)|$)/is);
    if (thoughtMatch) {
      result.thought = thoughtMatch[1].trim();
    }

    // 提取 Final Answer（兼容中英文标签）
    const answerMatch = response.match(/(?:Final Answer|最终答案)\s*[:：]\s*(.+)/is);
    if (answerMatch) {
      result.answer = answerMatch[1].trim();
      return result;
    }

    // 提取 Action 和 Action Input
    const actionMatch = response.match(/(?:Action|动作)\s*[:：]\s*([^\n]+)/i);
    const inputMatch = response.match(/(?:Action Input|动作输入|输入)\s*[:：]\s*(.+?)(?=\n(?:Thought|思考|Action|动作|Final Answer|最终答案|Observation|观察)|$)/is);

    if (actionMatch && inputMatch) {
      const actionType = actionMatch[1].trim().toLowerCase();
      const actionInput = inputMatch[1].trim();

      // 处理不同的 Action 类型
      if (actionType === 'complete') {
        // complete 结束循环
        result.answer = actionInput;
      } else if (actionType === 'answer') {
        // answer 输出内容，但标记为中间输出（不结束循环）
        result.intermediateAnswer = actionInput;
      } else {
        // bash 或其他，作为工具调用
        result.action = {
          tool: actionType,
          input: actionInput,
        };
      }
    }

    return result;
  }

  /**
   * 添加步骤
   */
  private addStep(step: Step): void {
    this.trajectory.steps.push(step);
    this.callbacks?.onStep?.(step);

    if (this.config.debug) {
      console.log(`[ReActLoop] Step: ${step.type}`, step);
    }
  }

  /**
   * 获取轨迹
   */
  getTrajectory(): Trajectory {
    return this.trajectory;
  }

  /**
   * 输出最终答案（一次性传递给 onToken）
   */
  private async streamAnswer(answer: string): Promise<void> {
    const onToken = this.callbacks?.onToken;
    if (!onToken) return;

    onToken(answer);
  }

  private truncateForContext(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
      return value;
    }
    const omitted = value.length - maxChars;
    return `${value.slice(0, maxChars)}\n...[truncated ${omitted} chars]`;
  }
}
