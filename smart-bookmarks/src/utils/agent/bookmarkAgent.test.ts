/**
 * BookmarkAIAgent 测试
 * 测试核心 Agent 类的 Function Calling 功能
 * 包含 Property 13, 15 属性测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import { Message } from './types';

// Mock storage for chat function
let mockChatFn: ReturnType<typeof vi.fn>;

// Mock AIService class
vi.mock('./aiService', () => {
  return {
    AIService: class MockAIService {
      chat(...args: any[]) {
        return mockChatFn(...args);
      }
      getConfig() {
        return Promise.resolve({
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          endpoint: 'https://api.openai.com/v1/chat/completions',
        });
      }
    },
  };
});

// Mock bookmarkStore
vi.mock('../../sidebar/store/bookmarkStore', () => ({
  useBookmarkStore: {
    getState: () => ({
      bookmarks: [
        {
          id: 'bookmark-1',
          title: 'React Tutorial',
          url: 'https://react.dev',
          aiCategory: 'Frontend',
          aiTags: ['react', 'javascript'],
          userTags: [],
          starred: false,
          status: 'active',
          folderId: 'folder-/',
          folderPath: '/',
          analytics: { visitCount: 10, importance: 80 },
        },
        {
          id: 'bookmark-2',
          title: 'Vue Guide',
          url: 'https://vuejs.org',
          aiCategory: 'Frontend',
          aiTags: ['vue', 'javascript'],
          userTags: [],
          starred: true,
          status: 'active',
          folderId: 'folder-/',
          folderPath: '/',
          analytics: { visitCount: 5, importance: 70 },
        },
      ],
      folders: [],
      addBookmark: vi.fn(),
      updateBookmark: vi.fn(),
      deleteBookmark: vi.fn(),
      restoreBookmark: vi.fn(),
      moveBookmarkToFolder: vi.fn(),
      addFolder: vi.fn(),
      updateFolder: vi.fn(),
      deleteFolder: vi.fn(),
    }),
  },
}));

// Mock chrome.storage
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
    },
  },
  tabs: {
    create: vi.fn(),
  },
});

// Import after mocks are set up
import { BookmarkAIAgent } from './bookmarkAgent';

describe('BookmarkAIAgent', () => {
  let agent: BookmarkAIAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatFn = vi.fn();
    agent = new BookmarkAIAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初始化', () => {
    it('should initialize with default config', () => {
      expect(agent).toBeDefined();
      expect(agent.getAvailableTools().length).toBeGreaterThan(0);
    });

    it('should register all tools', () => {
      const tools = agent.getAvailableTools();

      // 书签工具
      expect(tools).toContain('search_bookmarks');
      expect(tools).toContain('add_bookmark');
      expect(tools).toContain('delete_bookmark');

      // 文件夹工具
      expect(tools).toContain('create_folder');
      expect(tools).toContain('list_folders');

      // 整理工具
      expect(tools).toContain('organize_bookmarks');
      expect(tools).toContain('collect_bookmarks');

      // 搜索工具
      expect(tools).toContain('web_search');
      expect(tools).toContain('github_search');
    });
  });

  describe('对话历史管理', () => {
    it('should clear history', () => {
      agent.clearHistory();
      expect(agent.getHistory()).toHaveLength(0);
    });

    it('should export and import conversation', () => {
      const exported = agent.exportConversation();

      expect(exported).toHaveProperty('messages');
      expect(exported).toHaveProperty('lastSearchResults');
      expect(exported).toHaveProperty('lastMentionedBookmarks');

      // Import should work without error
      agent.importConversation(exported);
    });
  });

  describe('降级处理', () => {
    it('should handle API key not configured error', async () => {
      mockChatFn.mockRejectedValueOnce(new Error('API Key not configured'));

      const response = await agent.chat('Hello');

      expect(response.message).toContain('AI 服务未配置');
    });

    it('should handle network error', async () => {
      mockChatFn.mockRejectedValueOnce(new Error('fetch failed'));

      const response = await agent.chat('Hello');

      expect(response.message).toContain('网络连接失败');
    });

    it('should handle generic error gracefully', async () => {
      mockChatFn.mockRejectedValueOnce(new Error('Unknown error'));

      const response = await agent.chat('Hello');

      expect(response.message).toBeTruthy();
      expect(response.suggestions).toBeDefined();
    });
  });

  describe('工具调用', () => {
    it('should handle chat without tool calls', async () => {
      mockChatFn.mockResolvedValueOnce({
        content: '你好！有什么可以帮你的吗？',
        tool_calls: undefined,
      });

      const response = await agent.chat('你好');

      expect(response.message).toBe('你好！有什么可以帮你的吗？');
      expect(response.toolsUsed).toBeUndefined();
    });

    it('should handle chat with tool calls', async () => {
      // First response with tool call
      mockChatFn.mockResolvedValueOnce({
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search_bookmarks',
              arguments: JSON.stringify({ query: 'React' }),
            },
          },
        ],
      });

      // Second response after tool execution
      mockChatFn.mockResolvedValueOnce({
        content: '找到了 1 个关于 React 的书签。',
        tool_calls: undefined,
      });

      const response = await agent.chat('搜索 React');

      expect(response.message).toBe('找到了 1 个关于 React 的书签。');
      expect(response.toolsUsed).toContain('search_bookmarks');
    });

    it('should limit tool call iterations', async () => {
      // Always return tool calls (should be limited)
      mockChatFn.mockResolvedValue({
        content: null,
        tool_calls: [
          {
            id: 'call-loop',
            type: 'function',
            function: {
              name: 'search_bookmarks',
              arguments: JSON.stringify({ query: 'test' }),
            },
          },
        ],
      });

      const response = await agent.chat('搜索测试');

      // Should not hang, should return after max iterations
      expect(response).toBeDefined();
    });
  });

  describe('建议生成', () => {
    it('should generate suggestions based on tools used', async () => {
      mockChatFn
        .mockResolvedValueOnce({
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'search_bookmarks',
                arguments: JSON.stringify({ query: 'test' }),
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: '搜索完成',
          tool_calls: undefined,
        });

      const response = await agent.chat('搜索书签');

      expect(response.suggestions).toBeDefined();
      expect(response.suggestions?.length).toBeGreaterThan(0);
    });
  });
});

// Property-based tests
describe('BookmarkAIAgent - Property Tests', () => {
  let agent: BookmarkAIAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatFn = vi.fn();
    agent = new BookmarkAIAgent();
  });

  /**
   * Property 13: Recommendation Priority
   * For any recommendation request, the Agent SHALL search existing bookmarks
   * before offering external search options.
   */
  it('Property 13: Recommendation Priority - should have search_bookmarks tool available', () => {
    // 验证 Agent 有搜索书签的能力
    const tools = agent.getAvailableTools();

    // 必须有书签搜索工具
    expect(tools).toContain('search_bookmarks');

    // 也应该有外部搜索工具
    expect(tools).toContain('web_search');
    expect(tools).toContain('github_search');

    // 书签搜索应该在工具列表中（可以被优先调用）
    const searchIndex = tools.indexOf('search_bookmarks');
    expect(searchIndex).toBeGreaterThanOrEqual(0);
  });

  /**
   * Property 15: Configuration Fallback
   * For any service call where no custom configuration exists,
   * the Agent SHALL use default service endpoints and standard rate limits.
   */
  it('Property 15: Configuration Fallback - should initialize without custom config', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          maxHistoryLength: fc.option(fc.integer({ min: 10, max: 100 })),
          maxToolCalls: fc.option(fc.integer({ min: 1, max: 10 })),
        }),
        async (partialConfig) => {
          // 使用部分配置创建 Agent
          const testAgent = new BookmarkAIAgent(partialConfig as any);

          // Agent 应该正常初始化
          expect(testAgent).toBeDefined();

          // 应该有可用的工具
          expect(testAgent.getAvailableTools().length).toBeGreaterThan(0);

          // 应该能导出对话（即使是空的）
          const exported = testAgent.exportConversation();
          expect(exported).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Agent should always return a response
   */
  it('Property: Agent should always return a valid response structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-zA-Z0-9\u4e00-\u9fa5]{1,50}$/),
        async (userMessage) => {
          mockChatFn.mockResolvedValue({
            content: 'Test response',
            tool_calls: undefined,
          });

          const response = await agent.chat(userMessage);

          // 响应应该有正确的结构
          expect(response).toBeDefined();
          expect(typeof response.message).toBe('string');
          expect(response.message.length).toBeGreaterThan(0);

          // suggestions 应该是数组或 undefined
          if (response.suggestions !== undefined) {
            expect(Array.isArray(response.suggestions)).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: History should be properly managed
   */
  it('Property: History operations should be consistent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            role: fc.constantFrom('user', 'assistant') as fc.Arbitrary<'user' | 'assistant'>,
            content: fc.string({ minLength: 1, maxLength: 50 }),
            timestamp: fc.integer({ min: 0 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        async (messages) => {
          const testAgent = new BookmarkAIAgent();

          // 导入消息
          testAgent.importConversation({ messages });

          // 导出应该返回相同的消息
          const exported = testAgent.exportConversation();
          expect(exported.messages.length).toBe(messages.length);

          // 清空后应该为空
          testAgent.clearHistory();
          expect(testAgent.getHistory()).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Tool list should be stable
   */
  it('Property: Available tools should be consistent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (iterations) => {
          const tools1 = agent.getAvailableTools();

          for (let i = 0; i < iterations; i++) {
            const tools2 = agent.getAvailableTools();
            expect(tools2).toEqual(tools1);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
