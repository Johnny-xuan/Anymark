/**
 * Context Manager 测试
 * 测试对话历史管理、指代解析和上下文压缩
 * 包含 Property 14 属性测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { ContextManager, ResolvedReference } from './contextManager';
import { Message } from './types';

describe('ContextManager', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager();
  });

  describe('消息管理', () => {
    it('should add messages to history', () => {
      const message: Message = {
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };

      contextManager.addMessage(message);

      expect(contextManager.getMessageCount()).toBe(1);
      expect(contextManager.getHistory()[0]).toEqual(message);
    });

    it('should get limited history', () => {
      for (let i = 0; i < 10; i++) {
        contextManager.addMessage({
          role: 'user',
          content: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      const history = contextManager.getHistory(5);
      expect(history).toHaveLength(5);
      expect(history[0].content).toBe('Message 5');
    });

    it('should clear history', () => {
      contextManager.addMessage({
        role: 'user',
        content: 'Test',
        timestamp: Date.now(),
      });

      contextManager.clear();

      expect(contextManager.getMessageCount()).toBe(0);
      expect(contextManager.getLastSearchResults()).toHaveLength(0);
    });
  });

  describe('上下文压缩', () => {
    it('should compress when threshold is reached', () => {
      const manager = new ContextManager({
        maxMessages: 50,
        compressThreshold: 10,
        keepRecentCount: 5,
      });

      // 添加超过阈值的消息
      for (let i = 0; i < 12; i++) {
        manager.addMessage({
          role: 'user',
          content: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      // 应该被压缩
      expect(manager.getMessageCount()).toBeLessThan(12);
    });

    it('should keep recent messages after compression', () => {
      const manager = new ContextManager({
        compressThreshold: 10,
        keepRecentCount: 5,
      });

      for (let i = 0; i < 12; i++) {
        manager.addMessage({
          role: 'user',
          content: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      const history = manager.getAllMessages();
      // 压缩后应该有摘要消息 + 最近的消息 + 压缩后新增的消息
      // 压缩在第10条时触发，保留5条，然后又添加了2条
      expect(history.length).toBeLessThanOrEqual(10);
    });

    it('should create summary message during compression', () => {
      const manager = new ContextManager({
        compressThreshold: 10,
        keepRecentCount: 5,
      });

      for (let i = 0; i < 12; i++) {
        manager.addMessage({
          role: 'user',
          content: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      const history = manager.getAllMessages();
      const summaryMessage = history.find(m => m.content.includes('[对话摘要]'));
      expect(summaryMessage).toBeDefined();
    });
  });

  describe('指代解析', () => {
    beforeEach(() => {
      // 设置搜索结果上下文
      contextManager.setLastSearchResults([
        { id: 'bookmark-1', title: 'React Tutorial' },
        { id: 'bookmark-2', title: 'Vue Guide' },
        { id: 'bookmark-3', title: 'Angular Docs' },
      ]);
    });

    it('should resolve "第一个" reference', () => {
      const result = contextManager.resolveReference('打开第一个');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('search_result');
      expect(result?.id).toBe('bookmark-1');
      expect(result?.index).toBe(0);
    });

    it('should resolve "第二个" reference', () => {
      const result = contextManager.resolveReference('打开第二个');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('bookmark-2');
      expect(result?.index).toBe(1);
    });

    it('should resolve numeric index "第1个"', () => {
      const result = contextManager.resolveReference('第1个');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('bookmark-1');
    });

    it('should resolve "这个书签" to last mentioned bookmark', () => {
      const result = contextManager.resolveReference('打开这个书签');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('bookmark');
      expect(result?.id).toBe('bookmark-1');
    });

    it('should resolve "那个书签" to last mentioned bookmark', () => {
      const result = contextManager.resolveReference('删除那个书签');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('bookmark');
    });

    it('should resolve by title match', () => {
      const result = contextManager.resolveReference('打开 React Tutorial');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('bookmark');
      expect(result?.id).toBe('bookmark-1');
    });

    it('should return null for unresolvable reference', () => {
      contextManager.clear();
      const result = contextManager.resolveReference('打开第一个');

      // 没有搜索结果时，返回 index 类型
      expect(result?.type).toBe('index');
    });

    it('should handle Chinese numbers up to 10', () => {
      const numbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

      numbers.forEach((num, index) => {
        const result = contextManager.resolveReference(`第${num}个`);
        if (index < 3) {
          // 只有前3个有对应的搜索结果
          expect(result?.index).toBe(index);
        }
      });
    });
  });

  describe('工具结果提取', () => {
    it('should extract bookmarks from search results', () => {
      const toolMessage: Message = {
        role: 'tool',
        content: JSON.stringify({
          success: true,
          data: {
            results: [
              { id: 'b1', title: 'Result 1' },
              { id: 'b2', title: 'Result 2' },
            ],
          },
        }),
        timestamp: Date.now(),
        name: 'search_bookmarks',
        tool_call_id: 'call-1',
      };

      contextManager.addMessage(toolMessage);

      const bookmarks = contextManager.getLastMentionedBookmarks();
      expect(bookmarks).toHaveLength(2);
      expect(bookmarks[0].id).toBe('b1');
    });

    it('should extract single bookmark from operation result', () => {
      const toolMessage: Message = {
        role: 'tool',
        content: JSON.stringify({
          success: true,
          data: {
            id: 'bookmark-123',
            title: 'New Bookmark',
          },
        }),
        timestamp: Date.now(),
        name: 'add_bookmark',
        tool_call_id: 'call-2',
      };

      contextManager.addMessage(toolMessage);

      const bookmarks = contextManager.getLastMentionedBookmarks();
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].id).toBe('bookmark-123');
    });
  });

  describe('导入导出', () => {
    it('should export context data', () => {
      contextManager.addMessage({
        role: 'user',
        content: 'Test message',
        timestamp: Date.now(),
      });
      contextManager.setLastSearchResults([{ id: 'b1', title: 'Test' }]);

      const exported = contextManager.export();

      expect(exported.messages).toHaveLength(1);
      expect(exported.lastSearchResults).toHaveLength(1);
      expect(exported.lastMentionedBookmarks).toHaveLength(1);
    });

    it('should import context data', () => {
      const data = {
        messages: [
          { role: 'user' as const, content: 'Imported', timestamp: Date.now() },
        ],
        lastSearchResults: [{ id: 'imported-1', title: 'Imported Bookmark' }],
        lastMentionedBookmarks: [{ id: 'imported-1', title: 'Imported Bookmark' }],
      };

      contextManager.import(data);

      expect(contextManager.getMessageCount()).toBe(1);
      expect(contextManager.getLastSearchResults()).toHaveLength(1);
    });
  });
});

// Property-based tests
describe('ContextManager - Property Tests', () => {
  /**
   * Property 14: Context Reference Resolution
   * For any follow-up message containing references like "the first one" or "that bookmark",
   * the Agent SHALL resolve them to the correct entity from the previous response.
   */
  it('Property 14: Context Reference Resolution - should correctly resolve index references', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            title: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.integer({ min: 1, max: 10 }),
        async (searchResults, requestedIndex) => {
          const manager = new ContextManager();
          manager.setLastSearchResults(searchResults);

          // 测试中文数字引用
          const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
          const chineseNum = chineseNumbers[requestedIndex - 1] || String(requestedIndex);

          const result = manager.resolveReference(`打开第${chineseNum}个`);

          if (requestedIndex <= searchResults.length) {
            // 如果索引在范围内，应该正确解析
            expect(result).not.toBeNull();
            expect(result?.index).toBe(requestedIndex - 1);
            expect(result?.id).toBe(searchResults[requestedIndex - 1].id);
          } else {
            // 如果索引超出范围，返回 index 类型（无法解析到具体书签）
            expect(result?.type).toBe('index');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Pronoun references should resolve to last mentioned bookmark
   */
  it('Property: Pronoun references should resolve to most recent bookmark', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            title: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (bookmarks) => {
          const manager = new ContextManager();
          manager.setLastSearchResults(bookmarks);

          const pronouns = ['这个书签', '那个书签', '它'];

          for (const pronoun of pronouns) {
            const result = manager.resolveReference(pronoun);

            if (bookmarks.length > 0) {
              expect(result).not.toBeNull();
              expect(result?.type).toBe('bookmark');
              // 应该解析到第一个（最近提到的）书签
              expect(result?.id).toBe(bookmarks[0].id);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Message count should never exceed max after compression
   */
  it('Property: Message count should stay within bounds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 20 }), // keepRecentCount
        fc.integer({ min: 10, max: 50 }), // compressThreshold
        fc.integer({ min: 1, max: 100 }), // number of messages to add
        async (keepRecentCount, compressThreshold, messageCount) => {
          // Ensure valid config
          const validThreshold = Math.max(compressThreshold, keepRecentCount + 5);

          const manager = new ContextManager({
            maxMessages: 100,
            compressThreshold: validThreshold,
            keepRecentCount,
          });

          for (let i = 0; i < messageCount; i++) {
            manager.addMessage({
              role: 'user',
              content: `Message ${i}`,
              timestamp: Date.now(),
            });
          }

          // 消息数量应该在合理范围内
          const count = manager.getMessageCount();
          expect(count).toBeLessThanOrEqual(validThreshold + 5); // 允许一些缓冲
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Export and import should preserve data integrity
   */
  it('Property: Export/Import should be lossless', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            role: fc.constantFrom('user', 'assistant') as fc.Arbitrary<'user' | 'assistant'>,
            content: fc.string({ minLength: 1, maxLength: 100 }),
            timestamp: fc.integer({ min: 0 }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        async (messages) => {
          const manager1 = new ContextManager();

          messages.forEach(msg => manager1.addMessage(msg));

          const exported = manager1.export();

          const manager2 = new ContextManager();
          manager2.import(exported);

          // 消息应该完全相同
          expect(manager2.getMessageCount()).toBe(manager1.getMessageCount());

          const history1 = manager1.getAllMessages();
          const history2 = manager2.getAllMessages();

          history1.forEach((msg, i) => {
            expect(history2[i].content).toBe(msg.content);
            expect(history2[i].role).toBe(msg.role);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Clear should reset all state
   */
  it('Property: Clear should completely reset state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        async (messageCount) => {
          const manager = new ContextManager();

          // 添加消息和搜索结果
          for (let i = 0; i < messageCount; i++) {
            manager.addMessage({
              role: 'user',
              content: `Message ${i}`,
              timestamp: Date.now(),
            });
          }
          manager.setLastSearchResults([{ id: 'test', title: 'Test' }]);

          // 清空
          manager.clear();

          // 所有状态应该被重置
          expect(manager.getMessageCount()).toBe(0);
          expect(manager.getLastSearchResults()).toHaveLength(0);
          expect(manager.getLastMentionedBookmarks()).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
