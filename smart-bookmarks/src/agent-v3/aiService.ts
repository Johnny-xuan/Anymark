/**
 * AI Service - AI 服务封装
 * 封装用户配置的 AI API 调用，支持 Function Calling 和流式响应
 */

import type { ChatRequest, ChatResponse, AIMessage, ToolCall } from './types';

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
    endpoint: '',
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
    endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions',
    model: 'glm-4.7',
  },
  'zhipu-flash': {
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

  // 本地/其他
  ollama: {
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: '',
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

const DEFAULT_TIMEOUT = 60000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        console.warn(`[AIService] Server error ${response.status}, retrying (${attempt + 1}/${MAX_RETRIES})...`);
        await delay(RETRY_DELAY * (attempt + 1));
        continue;
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          lastError = new Error(`请求超时 (${timeout / 1000}秒)，请检查网络连接或 API 服务状态`);
        } else if (error.message === 'Failed to fetch') {
          lastError = new Error('网络请求失败，请检查：1) 网络连接 2) API 地址是否正确 3) API 服务是否可用');
        } else {
          lastError = error;
        }
        
        if (attempt < MAX_RETRIES) {
          console.warn(`[AIService] Request failed, retrying (${attempt + 1}/${MAX_RETRIES})...`, error.message);
          await delay(RETRY_DELAY * (attempt + 1));
          continue;
        }
      }
    }
  }
  
  throw lastError || new Error('请求失败');
}

export class AIService {
  async getConfig(): Promise<AIConfig> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(['aiConfig']);
        const aiConfig = result.aiConfig as Record<string, unknown> | undefined;

        const provider = (aiConfig?.provider as string) || 'doubao';
        const providerConfig = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.doubao;

        return {
          provider,
          apiKey: aiConfig?.apiKey as string | undefined,
          apiKeys: aiConfig?.apiKeys as string[] | undefined,
          model: (aiConfig?.model as string) || providerConfig.model,
          endpoint: (aiConfig?.endpoint as string) || providerConfig.endpoint,
        };
      }
    } catch (error) {
      console.warn('[AIService] Failed to get AI config:', error);
    }

    return {
      provider: 'doubao',
      model: PROVIDER_CONFIGS.doubao.model,
      endpoint: PROVIDER_CONFIGS.doubao.endpoint,
    };
  }

  private getApiKey(config: AIConfig): string | undefined {
    return config.apiKeys?.[0] || config.apiKey;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const config = await this.getConfig();
    const apiKey = this.getApiKey(config);
    const isOllama = config.provider === 'ollama';

    if (!isOllama && !apiKey) {
      throw new Error('API Key not configured. Please set your API Key in Settings.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages: this.formatMessages(request.messages),
      temperature: request.temperature ?? 0.3,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.tool_choice ?? 'auto';
    }

    const response = await fetchWithTimeout(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API 请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  private formatMessages(messages: AIMessage[]): Record<string, unknown>[] {
    return messages.map(msg => {
      const formatted: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.role === 'tool') {
        formatted.tool_call_id = msg.tool_call_id;
        if (msg.name) {
          formatted.name = msg.name;
        }
      }

      if (msg.role === 'assistant' && msg.tool_calls) {
        formatted.tool_calls = msg.tool_calls;
      }

      return formatted;
    });
  }

  private parseResponse(data: Record<string, unknown>): ChatResponse {
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];
    
    if (!choice) {
      throw new Error('Invalid API response: no choices');
    }

    const message = choice.message as Record<string, unknown>;
    const finishReason = choice.finish_reason as string | undefined;
    
    let content = message.content as string | null;
    if (content) {
      content = this.cleanHallucinatedToolCalls(content);

      if (finishReason === 'length') {
        content = `${content}\n\n（提示：回复可能因 token 限制被截断。可尝试：清空聊天历史/减少一次性任务范围/切换更长上下文模型。）`;
      }
    }
    
    return {
      content,
      tool_calls: message.tool_calls as ToolCall[] | undefined,
    };
  }

  private cleanHallucinatedToolCalls(content: string): string {
    if (!content) return content;

    let cleaned = content;
    let cleanedSomething = false;

    const beforeStrip = cleaned;
    cleaned = cleaned
      .replace(/<\/｜DSML｜[^>]*>/gi, '')
      .replace(/<\/function_calls>/gi, '')
      .replace(/<\/tool_calls>/gi, '')
      .replace(/<\/invoke>/gi, '');
    if (cleaned !== beforeStrip) {
      cleanedSomething = true;
      cleaned = cleaned.trim();
    }

    const blockPatterns = [
      /<｜DSML｜[^>]*>[\s\S]*?<\/｜DSML｜[^>]*>/gi,
      /<function_calls>[\s\S]*?<\/function_calls>/gi,
      /<tool_calls>[\s\S]*?<\/tool_calls>/gi,
      /<invoke[\s\S]*?<\/invoke>/gi,
      /```json\s*\{[\s\S]*"tool"[\s\S]*?\}```/gi,
    ];

    for (const pattern of blockPatterns) {
      if (pattern.test(cleaned)) {
        cleanedSomething = true;
        cleaned = cleaned.replace(pattern, '').trim();
      }
    }

    const tailMarkers = [
      '<｜DSML｜',
      '</｜DSML｜',
      '<function_calls>',
      '</function_calls>',
      '<tool_calls>',
      '</tool_calls>',
      '```json',
      '<invoke',
      '</invoke',
    ];

    const lower = cleaned.toLowerCase();
    for (const marker of tailMarkers) {
      const m = marker.toLowerCase();
      const idx = lower.lastIndexOf(m);
      if (idx !== -1) {
        if (idx >= Math.floor(cleaned.length * 0.66)) {
          cleanedSomething = true;
          cleaned = cleaned.slice(0, idx).trim();
        }
      }
    }

    if (cleanedSomething) {
      const lines = cleaned.split('\n');
      while (lines.length > 0) {
        const last = (lines[lines.length - 1] || '').trim();
        const looksLikePromise = /^(现在)?让我|^let\s+me/i.test(last);
        const endsWithColon = /[:：]\s*$/.test(last);
        if (looksLikePromise && endsWithColon) {
          lines.pop();
          continue;
        }
        break;
      }
      cleaned = lines.join('\n').trim();

      console.warn('[AIService] Detected hallucinated tool call in response, cleaned.');
    }

    cleaned = cleaned.replace(/<[^>]*$/g, '').trim();

    return cleaned;
  }

  async chatStream(request: ChatRequest, callbacks: StreamCallback): Promise<ChatResponse> {
    const config = await this.getConfig();
    const apiKey = this.getApiKey(config);
    const isOllama = config.provider === 'ollama';

    if (!isOllama && !apiKey) {
      throw new Error('API Key not configured. Please set your API Key in Settings.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages: this.formatMessages(request.messages),
      temperature: request.temperature ?? 0.3,
      stream: true,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.tool_choice ?? 'auto';
    }

    const response = await fetchWithTimeout(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }, 120000);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API 请求失败: ${response.status} - ${errorText}`);
    }

    return this.parseStreamResponse(response, callbacks);
  }

  private async parseStreamResponse(response: Response, callbacks: StreamCallback): Promise<ChatResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let content = '';
    let toolCalls: ToolCall[] = [];
    const toolCallsMap: Map<number, { id: string; type: 'function'; function: { name: string; arguments: string } }> = new Map();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
              const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;

              if (delta) {
                if (delta.content) {
                  content += delta.content as string;
                  callbacks.onToken?.(delta.content as string);
                }

                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
                    const index = (tc.index as number) ?? 0;
                    
                    if (!toolCallsMap.has(index)) {
                      toolCallsMap.set(index, {
                        id: (tc.id as string) || '',
                        type: 'function',
                        function: { name: '', arguments: '' }
                      });
                    }

                    const existing = toolCallsMap.get(index)!;
                    if (tc.id) existing.id = tc.id as string;
                    const fn = tc.function as Record<string, unknown> | undefined;
                    if (fn?.name) existing.function.name = fn.name as string;
                    if (fn?.arguments) existing.function.arguments += fn.arguments as string;
                  }
                }
              }
            } catch {
              // JSON 解析失败，忽略
            }
          }
        }
      }
      
      if (buffer.trim()) {
        const trimmedLine = buffer.trim();
        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
              const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
              if (delta?.content) {
                content += delta.content as string;
                callbacks.onToken?.(delta.content as string);
              }
            } catch {
              // 忽略
            }
          }
        }
      }

      toolCalls = Array.from(toolCallsMap.values());
      
      if (toolCalls.length > 0) {
        callbacks.onToolCall?.(toolCalls);
      }

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

  async simpleChat(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: AIMessage[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const response = await this.chat({ messages });
    return response.content || '';
  }
}

// 导出单例
export const aiService = new AIService();
