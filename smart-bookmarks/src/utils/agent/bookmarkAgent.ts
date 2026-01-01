/**
 * BookmarkAIAgent - 智能书签助手核心类
 * 基于 Function Calling 的 Tool-based 架构
 * 支持流式响应和进度显示
 */

import type { Message, ChatRequest, ChatResponse, AgentResponse, StreamCallbacks } from './types';
import { ToolRegistry } from './toolRegistry';
import { AIService } from './aiService';
import { ContextManager } from './contextManager';
import { coreTools } from './tools/coreTools';

/**
 * Agent 配置
 */
export interface AgentConfig {
  maxHistoryLength: number;
  maxToolCalls: number;
  systemPrompt: string;
}

/** 获取带当前日期的 system prompt */
function getSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `You are AnyMark's bookmark manager - a friendly assistant helping users organize and find their bookmarks.

Today: ${today}

## Your Role
- Help users manage their bookmark collection
- Reply in user's language naturally
- Casual chat is fine without using tools
- Ask for confirmation before bulk/destructive operations

## Domain Knowledge
- Chrome folders (folderPath) = real bookmark folders in browser
- AI folders (aiFolderPath) = virtual classification by AI
- Decay status: active(7d) → cooling(30d) → cold(90d) → frozen(90d+)
- Frecency = importance score based on visit frequency + recency

## Guidelines
- search = find user's SAVED bookmarks; discover = find NEW resources online
- context = READ-ONLY info (overview/stats/folders); organize = ANALYZE + ACTION (find problems, suggest, move)
- Always mention folder path in results (users care WHERE bookmarks are)
- Use function calling only (no tool calls in text)
- Use tools flexibly to complete user's task - combine multiple tools if needed
- Summarize results clearly
- If user's intent is unclear, ASK them what they want instead of guessing

## Flexibility
- For questions unrelated to bookmarks that you're unsure about, you MAY use discover(web) to help
- Don't search for things you already know - just answer directly
- If you truly can't help, explain why and suggest alternatives`;
}

const DEFAULT_CONFIG: AgentConfig = {
  maxHistoryLength: 50,
  maxToolCalls: 10,
  systemPrompt: getSystemPrompt(),
};

/**
 * 智能书签助手
 */
export class BookmarkAIAgent {
  private toolRegistry: ToolRegistry;
  private aiService: AIService;
  private contextManager: ContextManager;
  private config: AgentConfig;

  constructor(config: Partial<AgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.toolRegistry = new ToolRegistry();
    this.aiService = new AIService();
    this.contextManager = new ContextManager({
      maxMessages: this.config.maxHistoryLength,
    });

    // 注册所有工具
    this.registerTools();
    
    // 初始化系统提示词（Rules）- 只设置一次
    this.contextManager.initializeSystem(this.config.systemPrompt);
  }

  /**
   * 注册所有工具
   */
  private registerTools(): void {
    // 注册 5 个核心工具
    coreTools.forEach(tool => this.toolRegistry.register(tool));
  }

  /**
   * 处理用户消息（主入口）- 支持流式响应
   */
  async chat(
    userMessage: string, 
    context?: { quickAction?: string },
    callbacks?: StreamCallbacks
  ): Promise<AgentResponse> {
    try {
      // 生成思考步骤 ID
      let stepCounter = 0;
      const generateStepId = () => `step-${Date.now()}-${stepCounter++}`;

      // 添加思考步骤：开始分析
      callbacks?.onThinkingStep?.({
        id: generateStepId(),
        message: '开始分析用户请求...',
        timestamp: Date.now(),
        type: 'thinking',
      });

      // 解析指代
      const resolvedMessage = this.resolveReferences(userMessage);

      // 添加用户消息到历史
      const userMsg: Message = {
        role: 'user',
        content: resolvedMessage,
        timestamp: Date.now(),
      };
      this.contextManager.addMessage(userMsg);

      // 添加思考步骤：构建请求
      callbacks?.onThinkingStep?.({
        id: generateStepId(),
        message: '构建 AI 请求上下文...',
        timestamp: Date.now(),
        type: 'thinking',
      });

      // 构建请求
      const request = this.buildRequest(resolvedMessage, context?.quickAction);

      // 通知开始思考
      callbacks?.onProgress?.({
        stage: 'thinking',
        message: '正在思考...',
      });

      // 添加思考步骤：发送请求
      callbacks?.onThinkingStep?.({
        id: generateStepId(),
        message: '向 AI 模型发送请求...',
        timestamp: Date.now(),
        type: 'thinking',
      });

      // 发送请求到 AI（使用流式或非流式）
      let response: ChatResponse;
      let streamedContent = '';
      
      if (callbacks?.onToken) {
        // 流式响应
        response = await this.aiService.chatStream(request, {
          onToken: (token) => {
            streamedContent += token;
            callbacks.onToken?.(token);
          },
          onToolCall: (toolCalls) => {
            callbacks.onProgress?.({
              stage: 'tool_calling',
              message: `准备调用工具: ${toolCalls.map(tc => this.getToolDisplayName(tc.function.name)).join(', ')}`,
            });
          },
        });
      } else {
        // 非流式响应
        response = await this.aiService.chat(request);
      }

      // 处理工具调用
      const toolsUsed: string[] = [];
      let iterations = 0;

      while (response.tool_calls && response.tool_calls.length > 0 && iterations < this.config.maxToolCalls) {
        iterations++;

        // 添加思考步骤：发现工具调用
        callbacks?.onThinkingStep?.({
          id: generateStepId(),
          message: `AI 决定调用 ${response.tool_calls.length} 个工具`,
          timestamp: Date.now(),
          type: 'thinking',
        });

        // 添加 assistant 消息（包含 tool_calls）
        const assistantMsg: Message = {
          role: 'assistant',
          content: response.content || '',
          timestamp: Date.now(),
          tool_calls: response.tool_calls,
        };
        this.contextManager.addMessage(assistantMsg);

        // 通知工具执行进度
        const totalTools = response.tool_calls.length;
        
        // 执行工具调用
        const toolResults: any[] = [];
        for (let i = 0; i < response.tool_calls.length; i++) {
          const toolCall = response.tool_calls[i];
          const toolName = toolCall.function.name;
          
          // 添加思考步骤：执行工具
          callbacks?.onThinkingStep?.({
            id: generateStepId(),
            message: `调用工具: ${this.getToolDisplayName(toolName)}`,
            timestamp: Date.now(),
            type: 'tool',
          });

          // 通知进度
          callbacks?.onProgress?.({
            stage: 'tool_executing',
            toolName,
            toolIndex: i + 1,
            totalTools,
            message: `执行中: ${this.getToolDisplayName(toolName)} (${i + 1}/${totalTools})`,
          });

          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await this.toolRegistry.execute(toolName, args);
            toolResults.push(result);

            // 添加思考步骤：工具执行结果
            callbacks?.onThinkingStep?.({
              id: generateStepId(),
              message: result.success 
                ? `✓ ${this.getToolDisplayName(toolName)} 执行成功`
                : `✗ ${this.getToolDisplayName(toolName)} 执行失败`,
              timestamp: Date.now(),
              type: result.success ? 'result' : 'error',
            });
          } catch (error) {
            console.error(`[BookmarkAgent] Tool execution error (${toolName}):`, error);
            const errorResult = {
              success: false,
              error: error instanceof Error ? error.message : 'Tool execution failed',
            };
            toolResults.push(errorResult);

            // 添加思考步骤：工具执行错误
            callbacks?.onThinkingStep?.({
              id: generateStepId(),
              message: `✗ ${this.getToolDisplayName(toolName)} 执行出错: ${errorResult.error}`,
              timestamp: Date.now(),
              type: 'error',
            });
          }

          // 记录使用的工具
          if (!toolsUsed.includes(toolName)) {
            toolsUsed.push(toolName);
          }
        }

        // 添加工具结果到历史
        toolResults.forEach((result, index) => {
          const toolMsg: Message = {
            role: 'tool',
            content: JSON.stringify(result),
            timestamp: Date.now(),
            tool_call_id: response.tool_calls![index].id,
            name: response.tool_calls![index].function.name,
          };
          this.contextManager.addMessage(toolMsg);
        });

        // 添加思考步骤：分析工具结果
        callbacks?.onThinkingStep?.({
          id: generateStepId(),
          message: '分析工具执行结果...',
          timestamp: Date.now(),
          type: 'thinking',
        });

        // 通知正在生成回复
        callbacks?.onProgress?.({
          stage: 'responding',
          message: '正在生成回复...',
        });

        // 添加思考步骤：生成回复
        callbacks?.onThinkingStep?.({
          id: generateStepId(),
          message: '基于工具结果生成回复...',
          timestamp: Date.now(),
          type: 'thinking',
        });

        // 继续对话，让 AI 处理工具结果
        const continueRequest = this.buildContinueRequest();
        
        if (callbacks?.onToken) {
          streamedContent = '';
          response = await this.aiService.chatStream(continueRequest, {
            onToken: (token) => {
              streamedContent += token;
              callbacks.onToken?.(token);
            },
          });
        } else {
          response = await this.aiService.chat(continueRequest);
        }
      }

      // 添加思考步骤：完成
      callbacks?.onThinkingStep?.({
        id: generateStepId(),
        message: '回复生成完成',
        timestamp: Date.now(),
        type: 'result',
      });

      // 添加最终回复到历史
      const finalContent = response.content || streamedContent || '';
      const finalMsg: Message = {
        role: 'assistant',
        content: finalContent,
        timestamp: Date.now(),
      };
      this.contextManager.addMessage(finalMsg);

      // 构建响应
      const agentResponse: AgentResponse = {
        message: finalContent || '抱歉，我无法处理这个请求。',
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        suggestions: this.generateSuggestions(toolsUsed),
      };

      callbacks?.onComplete?.(agentResponse);
      return agentResponse;
    } catch (error) {
      console.error('[BookmarkAgent] Chat error:', error);
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));

      // 降级处理
      return this.handleFallback(userMessage, error);
    }
  }

  /**
   * 获取工具的显示名称
   */
  private getToolDisplayName(toolName: string): string {
    const displayNames: Record<string, string> = {
      // 6 个核心工具
      'context': '📚 获取上下文',
      'bookmark': '🔖 书签操作',
      'organize': '🗂️ AI 分类整理',
      'folder': '📁 文件夹管理',
      'search': '🔍 搜索书签',
      'discover': '🌐 发现资源',
    };
    return displayNames[toolName] || toolName;
  }

  /**
   * 解析消息中的指代
   */
  private resolveReferences(message: string): string {
    const reference = this.contextManager.resolveReference(message);

    if (reference && reference.id) {
      // 将指代替换为具体的 ID
      return message.replace(
        reference.originalText,
        `书签 ID: ${reference.id}`
      );
    }

    return message;
  }

  /**
   * 构建 AI 请求
   */
  private buildRequest(userMessage: string, quickAction?: string): ChatRequest {
    // 如果有快捷功能，添加明确的工具指导
    if (quickAction) {
      const actionGuidance = this.getActionGuidance(quickAction);
      if (actionGuidance) {
        const contextHint: Message = {
          role: 'system' as any,
          content: actionGuidance,
          timestamp: Date.now(),
        };
        this.contextManager.addMessage(contextHint);
      }
    }

    // 获取完整消息（系统提示词 + 历史消息）
    const messages = this.contextManager.getMessagesForRequest(this.config.maxHistoryLength - 2);

    return {
      messages,
      tools: this.toolRegistry.toOpenAIFormat(),
      tool_choice: 'auto',
    };
  }

  /**
   * 获取快捷功能的工具指导
   */
  private getActionGuidance(quickAction: string): string | null {
    const guidanceMap: Record<string, string> = {
      // 搜书签 - 使用 search 工具
      '搜书签': 'User wants to search their saved bookmarks. Use search tool with query.',
      'Search Bookmarks': 'User wants to search their saved bookmarks. Use search tool with query.',
      '搜索': 'User wants to search their saved bookmarks. Use search tool with query.',
      'Search': 'User wants to search their saved bookmarks. Use search tool with query.',
      
      // 找资源 - 使用 discover 工具
      '找资源': 'User wants to discover new resources on the web. Use discover tool with action "web".',
      'Discover': 'User wants to discover new resources on the web. Use discover tool with action "web".',
      
      // 看热门 - 使用 discover 工具的 trending
      '看热门': 'User wants to see trending GitHub projects. Use discover tool with action "trending".',
      'Trending': 'User wants to see trending GitHub projects. Use discover tool with action "trending".',
      
      // 整理 - 使用 organize 工具
      '整理': 'User wants to organize bookmarks. Use context({ action: "overview" }) first, then organize({ action: "suggest" }).',
      'Organize': 'User wants to organize bookmarks. Use context({ action: "overview" }) first, then organize({ action: "suggest" }).',
      
      // 聊天 - 不需要工具
      '聊天': 'User wants casual conversation. No specific tool preference.',
      'Chat': 'User wants casual conversation. No specific tool preference.',
    };
    return guidanceMap[quickAction] || null;
  }

  /**
   * 构建继续对话的请求
   */
  private buildContinueRequest(): ChatRequest {
    // 获取完整消息（系统提示词 + 所有历史消息）
    const messages = this.contextManager.getAllMessages();

    return {
      messages,
      tools: this.toolRegistry.toOpenAIFormat(),
      tool_choice: 'auto',
    };
  }

  /**
   * 生成建议
   */
  private generateSuggestions(toolsUsed: string[]): string[] {
    const suggestions: string[] = [];

    if (toolsUsed.includes('search_bookmarks')) {
      suggestions.push('打开第一个', '查看更多结果');
    }

    if (toolsUsed.includes('add_bookmark')) {
      suggestions.push('查看书签', '添加标签');
    }

    if (toolsUsed.includes('organize_bookmarks')) {
      suggestions.push('查看整理结果', '继续整理');
    }

    if (toolsUsed.includes('web_search') || toolsUsed.includes('github_search')) {
      suggestions.push('收藏第一个', '搜索更多');
    }

    if (suggestions.length === 0) {
      suggestions.push('搜索书签', '整理书签', '找资源');
    }

    return suggestions.slice(0, 3);
  }

  /**
   * 降级处理
   */
  private handleFallback(userMessage: string, error: unknown): AgentResponse {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // 检查是否是 API 配置问题
    if (errorMessage.includes('API Key') || errorMessage.includes('not configured')) {
      return {
        message: '❌ AI 服务未配置。请在设置中配置您的 AI API Key。',
        suggestions: ['打开设置', '查看帮助'],
      };
    }

    // 检查是否是网络问题
    if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
      return {
        message: '❌ 网络连接失败。请检查网络连接后重试。',
        suggestions: ['重试', '查看帮助'],
      };
    }

    // 通用错误
    return {
      message: `😔 抱歉，处理您的请求时出现了问题。\n\n您可以试试：\n- "搜索 React 教程"\n- "整理我的书签"\n- "找一些 Python 学习资源"`,
      suggestions: ['搜索书签', '整理书签', '查看帮助'],
    };
  }

  /**
   * 清空对话历史（保留系统提示词）
   */
  clearHistory(): void {
    this.contextManager.clear();
  }

  /**
   * 获取对话历史（不包含系统提示词，用于显示给用户）
   */
  getHistory(): Message[] {
    return this.contextManager.getHistory();
  }

  /**
   * 导出对话（用于存档）
   */
  exportConversation(): {
    messages: Message[];
    lastSearchResults: any[];
    lastMentionedBookmarks: { id: string; title: string }[];
  } {
    return this.contextManager.export();
  }

  /**
   * 导入对话（用于恢复存档）
   */
  importConversation(data: {
    messages: Message[];
    lastSearchResults?: any[];
    lastMentionedBookmarks?: { id: string; title: string }[];
  }): void {
    this.contextManager.import(data);
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): string[] {
    return this.toolRegistry.getAll().map(t => t.name);
  }
}

// 导出单例
export const bookmarkAgent = new BookmarkAIAgent();
