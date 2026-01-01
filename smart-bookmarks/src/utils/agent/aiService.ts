/**
 * AI Service - AI 服务封装
 * 封装用户配置的 AI API 调用，支持 Function Calling 和流式响应
 */

import type { ChatRequest, ChatResponse, OpenAITool, Message, ToolCall } from './types';

// AI 配置类型
interface AIConfig {
  provider: string;
  apiKey?: string;
  apiKeys?: string[];
  model: string;
  endpoint: string;
}

// 流式响应回调
export interface StreamCallback {
  onToken?: (token: string) => void;
  onToolCall?: (toolCalls: ToolCall[]) => void;
  onComplete?: (response: ChatResponse) => void;
  onError?: (error: Error) => void;
}

// Provider 默认配置 - 统一管理所有支持的厂商
// 模型名称来源于各厂商官方文档 (2025年12月)
const PROVIDER_CONFIGS: Record<string, { endpoint: string; model: string }> = {
  // 国际大厂
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/chat/completions',
    model: 'claude-sonnet-4-5',
  },
  azure: {
    endpoint: '',  // 用户需配置
    model: 'gpt-4o',
  },
  google: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    model: 'gemini-2.5-pro',
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
  },
  xai: {
    endpoint: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-4-1-fast',
  },

  // 国内主流
  doubao: {
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    model: 'doubao-pro-32k',
  },
  moonshot: {
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k',
  },
  aliyun: {
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-turbo',
  },
  yi: {
    endpoint: 'https://api.yi.01.ai/v1/chat/completions',
    model: 'yi-light',
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
  },
  siliconflow: {
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'deepseek-ai/DeepSeek-V3',
  },
  zhipu: {
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash',
  },
  minimax: {
    endpoint: 'https://api.minimaxi.com/v1/chat/completions',
    model: 'MiniMax-M2.1',
  },
  'minimax-intl': {
    endpoint: 'https://api.minimax.io/v1/chat/completions',
    model: 'MiniMax-M2.1',
  },

  // 聚合平台
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'anthropic/claude-sonnet-4-5',
  },

  // 本地/其他 - 注意：模型由用户在设置中配置
  ollama: {
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: '', // 用户在设置中自行配置
  },
  huggingface: {
    endpoint: 'https://api-inference.huggingface.co/models/',
    model: '',
  },

  // 兼容旧名
  qwen: {
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-turbo',
  },
  kimi: {
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k',
  },
};

export class AIService {
  /**
   * 获取用户 AI 配置
   */
  async getConfig(): Promise<AIConfig> {
    try {
      // 检查是否在 Chrome 扩展环境中
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(['aiConfig']);
        const aiConfig = result.aiConfig as any;

        const provider = aiConfig?.provider || 'doubao';
        const providerConfig = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.doubao;

        return {
          provider,
          apiKey: aiConfig?.apiKey,
          apiKeys: aiConfig?.apiKeys,
          model: aiConfig?.model || providerConfig.model,
          endpoint: aiConfig?.endpoint || providerConfig.endpoint,
        };
      }
    } catch (error) {
      console.warn('[AIService] Failed to get AI config:', error);
    }

    // 默认配置
    return {
      provider: 'doubao',
      model: PROVIDER_CONFIGS.doubao.model,
      endpoint: PROVIDER_CONFIGS.doubao.endpoint,
    };
  }

  /**
   * 获取有效的 API Key
   */
  private getApiKey(config: AIConfig): string | undefined {
    return config.apiKeys?.[0] || config.apiKey;
  }

  /**
   * 发送聊天请求（支持 Function Calling）
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const config = await this.getConfig();
    const apiKey = this.getApiKey(config);
    const isOllama = config.provider === 'ollama';

    // Ollama 本地模型不需要 API Key
    if (!isOllama && !apiKey) {
      throw new Error('API Key not configured. Please set your API Key in Settings.');
    }

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // 构建请求体
    const body: any = {
      model: config.model,
      messages: this.formatMessages(request.messages),
      temperature: request.temperature ?? 0.3,
    };

    // 添加工具定义（如果有）
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.tool_choice ?? 'auto';
    }

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  /**
   * 格式化消息为 API 格式
   */
  private formatMessages(messages: Message[]): any[] {
    return messages.map(msg => {
      const formatted: any = {
        role: msg.role,
        content: msg.content,
      };

      // 处理 tool 消息
      if (msg.role === 'tool') {
        formatted.tool_call_id = msg.tool_call_id;
        if (msg.name) {
          formatted.name = msg.name;
        }
      }

      // 处理 assistant 消息中的 tool_calls
      if (msg.role === 'assistant' && msg.tool_calls) {
        formatted.tool_calls = msg.tool_calls;
      }

      return formatted;
    });
  }

  /**
   * 解析 API 响应
   */
  private parseResponse(data: any): ChatResponse {
    const choice = data.choices?.[0];
    
    if (!choice) {
      throw new Error('Invalid API response: no choices');
    }

    const message = choice.message;
    
    // 清理可能的幻觉工具调用（某些模型会在文本中输出伪工具调用格式）
    let content = message.content;
    if (content) {
      content = this.cleanHallucinatedToolCalls(content);
    }
    
    return {
      content,
      tool_calls: message.tool_calls as ToolCall[] | undefined,
    };
  }

  /**
   * 清理文本中的幻觉工具调用
   * 某些模型（如 DeepSeek）有时会在文本回复中输出伪工具调用格式
   */
  private cleanHallucinatedToolCalls(content: string): string {
    if (!content) return content;
    
    // 检测并移除常见的幻觉工具调用模式
    const patterns = [
      // DeepSeek 特有格式
      /<｜DSML｜[\s\S]*$/g,
      /<｜DSML｜[^>]*>[\s\S]*?<\/｜DSML｜[^>]*>/gi,
      
      // 通用 XML 格式
      /<function_calls>[\s\S]*$/g,
      /<function_calls>[\s\S]*?<\/function_calls>/gi,
      /<tool_calls>[\s\S]*$/g,
      /<tool_calls>[\s\S]*?<\/tool_calls>/gi,
      
      // invoke 格式
      /<invoke[\s\S]*?<\/invoke>/gi,
      
      // JSON 格式的工具调用
      /```json\s*\{[\s\S]*"function"[\s\S]*$/g,
      /```json\s*\{[\s\S]*"tool"[\s\S]*?\}```/gi,
      
      // 让我搜索更具体... 后面跟着伪代码
      /让我.*更具体.*[:：]\s*(<|```)/gi,
      /let me.*more specific.*[:：]\s*(<|```)/gi,
    ];
    
    let cleaned = content;
    for (const pattern of patterns) {
      if (pattern.test(cleaned)) {
        console.warn('[AIService] Detected hallucinated tool call in response, cleaning...');
        cleaned = cleaned.replace(pattern, '').trim();
      }
    }
    
    // 移除末尾的不完整 XML 标签
    cleaned = cleaned.replace(/<[^>]*$/g, '').trim();
    
    return cleaned;
  }

  /**
   * 流式聊天请求
   */
  async chatStream(request: ChatRequest, callbacks: StreamCallback): Promise<ChatResponse> {
    const config = await this.getConfig();
    const apiKey = this.getApiKey(config);
    const isOllama = config.provider === 'ollama';

    // Ollama 本地模型不需要 API Key
    if (!isOllama && !apiKey) {
      throw new Error('API Key not configured. Please set your API Key in Settings.');
    }

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // 构建请求体
    const body: any = {
      model: config.model,
      messages: this.formatMessages(request.messages),
      temperature: request.temperature ?? 0.3,
      stream: true,
    };

    // 添加工具定义（如果有）
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.tool_choice ?? 'auto';
    }

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API request failed: ${response.status} - ${errorText}`);
    }

    return this.parseStreamResponse(response, callbacks);
  }

  /**
   * 解析流式响应
   */
  private async parseStreamResponse(response: Response, callbacks: StreamCallback): Promise<ChatResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let content = '';
    let toolCalls: ToolCall[] = [];
    const toolCallsMap: Map<number, { id: string; type: 'function'; function: { name: string; arguments: string } }> = new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              if (delta) {
                // 处理文本内容
                if (delta.content) {
                  content += delta.content;
                  callbacks.onToken?.(delta.content);
                }

                // 处理工具调用
                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const index = tc.index ?? 0;
                    
                    if (!toolCallsMap.has(index)) {
                      toolCallsMap.set(index, {
                        id: tc.id || '',
                        type: 'function',
                        function: { name: '', arguments: '' }
                      });
                    }

                    const existing = toolCallsMap.get(index)!;
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.function.name = tc.function.name;
                    if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                  }
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 转换工具调用
      toolCalls = Array.from(toolCallsMap.values());
      
      if (toolCalls.length > 0) {
        callbacks.onToolCall?.(toolCalls);
      }

      // 清理可能的幻觉工具调用
      const cleanedContent = this.cleanHallucinatedToolCalls(content);

      const result: ChatResponse = {
        content: cleanedContent || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      };

      callbacks.onComplete?.(result);
      return result;

    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 简单聊天（不使用工具）
   */
  async simpleChat(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: Message[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const response = await this.chat({ messages });
    return response.content || '';
  }

  /**
   * 带工具的聊天
   */
  async chatWithTools(
    messages: Message[],
    tools: OpenAITool[],
    toolChoice: ChatRequest['tool_choice'] = 'auto'
  ): Promise<ChatResponse> {
    return this.chat({
      messages,
      tools,
      tool_choice: toolChoice,
    });
  }
}

// 导出单例
export const aiService = new AIService();
