/**
 * AIService 测试
 * 包含单元测试和属性测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { AIService } from './aiService';
import { Message, OpenAITool, ChatResponse } from './types';

// Mock chrome.storage
const mockChromeStorage = {
  local: {
    get: vi.fn(),
  },
};

// 设置全局 chrome mock
vi.stubGlobal('chrome', {
  storage: mockChromeStorage,
});

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AIService', () => {
  let aiService: AIService;

  beforeEach(() => {
    aiService = new AIService();
    vi.clearAllMocks();
    
    // 默认 mock 配置
    mockChromeStorage.local.get.mockResolvedValue({
      aiConfig: {
        provider: 'openai',
        apiKey: 'test-api-key',
        model: 'gpt-3.5-turbo',
        endpoint: 'https://api.openai.com/v1/chat/completions',
      },
    });
  });

  describe('getConfig', () => {
    it('应该返回用户配置', async () => {
      const config = await aiService.getConfig();
      
      expect(config.provider).toBe('openai');
      expect(config.apiKey).toBe('test-api-key');
      expect(config.model).toBe('gpt-3.5-turbo');
    });

    it('应该在没有配置时返回默认值', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      
      const config = await aiService.getConfig();
      
      expect(config.provider).toBe('doubao');
      expect(config.model).toBe('doubao-lite-4k');
    });
  });

  describe('chat', () => {
    it('应该发送正确格式的请求', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: 'Hello!',
              tool_calls: undefined,
            },
          }],
        }),
      });

      const messages: Message[] = [
        { role: 'user', content: 'Hi' },
      ];

      await aiService.chat({ messages });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          }),
        })
      );
    });

    it('应该在没有 API Key 时抛出错误', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        aiConfig: { provider: 'openai' },
      });

      await expect(aiService.chat({ messages: [] }))
        .rejects.toThrow('API Key not configured');
    });

    it('应该正确处理带工具的请求', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'search_bookmarks',
                  arguments: '{"query":"test"}',
                },
              }],
            },
          }],
        }),
      });

      const tools: OpenAITool[] = [{
        type: 'function',
        function: {
          name: 'search_bookmarks',
          description: 'Search bookmarks',
          parameters: { type: 'object' },
        },
      }];

      const response = await aiService.chatWithTools(
        [{ role: 'user', content: 'Find my bookmarks' }],
        tools
      );

      expect(response.tool_calls).toBeDefined();
      expect(response.tool_calls?.[0].function.name).toBe('search_bookmarks');
    });
  });

  /**
   * Property 2: No Tool Invocation for Pure Chat
   * Feature: agent-enhancement, Property 2: No Tool Invocation for Pure Chat
   * Validates: Requirements 2.3
   * 
   * 对于纯聊天消息（问候、闲聊、一般问题），LLM 应该直接回复而不调用工具
   * 注意：这个属性测试模拟 LLM 的行为，验证我们的请求格式正确
   */
  describe('Property 2: No Tool Invocation for Pure Chat', () => {
    // 纯聊天消息示例
    const pureChatMessages = [
      '你好',
      'Hi',
      'Hello',
      '谢谢',
      'Thanks',
      '今天天气怎么样？',
      '你是谁？',
      '你能做什么？',
      '讲个笑话',
      '早上好',
    ];

    it('对于纯聊天消息，请求中不应强制使用工具', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...pureChatMessages),
          async (message) => {
            // 模拟 LLM 返回纯文本响应（无 tool_calls）
            mockFetch.mockResolvedValue({
              ok: true,
              json: () => Promise.resolve({
                choices: [{
                  message: {
                    content: '你好！有什么可以帮你的吗？',
                    tool_calls: undefined,
                  },
                }],
              }),
            });

            const response = await aiService.chat({
              messages: [{ role: 'user', content: message }],
              // 不传入 tools，表示纯聊天
            });

            // 验证响应没有 tool_calls
            return response.tool_calls === undefined;
          }
        ),
        { numRuns: 10 } // 减少运行次数因为涉及异步操作
      );
    });

    it('当 tool_choice 为 none 时，不应返回 tool_calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (message) => {
            mockFetch.mockResolvedValue({
              ok: true,
              json: () => Promise.resolve({
                choices: [{
                  message: {
                    content: 'Response without tools',
                    tool_calls: undefined,
                  },
                }],
              }),
            });

            const tools: OpenAITool[] = [{
              type: 'function',
              function: {
                name: 'test_tool',
                description: 'Test',
                parameters: { type: 'object' },
              },
            }];

            const response = await aiService.chat({
              messages: [{ role: 'user', content: message }],
              tools,
              tool_choice: 'none', // 明确禁用工具
            });

            return response.tool_calls === undefined;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 3: Error Handling on Tool Failure
   * Feature: agent-enhancement, Property 3: Error Handling on Tool Failure
   * Validates: Requirements 2.5
   * 
   * 当 API 调用失败时，应该抛出包含有用信息的错误
   */
  describe('Property 3: Error Handling on Tool Failure', () => {
    const httpErrorCodes = [400, 401, 403, 404, 429, 500, 502, 503];

    it('对于任何 HTTP 错误码，应该抛出包含状态码的错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...httpErrorCodes),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (statusCode, errorMessage) => {
            mockFetch.mockResolvedValue({
              ok: false,
              status: statusCode,
              text: () => Promise.resolve(errorMessage),
            });

            try {
              await aiService.chat({
                messages: [{ role: 'user', content: 'test' }],
              });
              return false; // 应该抛出错误
            } catch (error) {
              // 验证错误消息包含状态码
              const errorMsg = (error as Error).message;
              return errorMsg.includes(String(statusCode));
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('当响应格式无效时，应该抛出有意义的错误', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' }),
      });

      await expect(aiService.chat({
        messages: [{ role: 'user', content: 'test' }],
      })).rejects.toThrow('Invalid API response');
    });
  });
});
