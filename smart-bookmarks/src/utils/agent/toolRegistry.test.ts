/**
 * ToolRegistry 测试
 * 包含单元测试和属性测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ToolRegistry } from './toolRegistry';
import { Tool, ToolResult } from './types';

// 创建测试用的 mock 工具
const createMockTool = (name: string, description: string = 'Test tool'): Tool => ({
  name,
  description,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  execute: async (params: any): Promise<ToolResult> => ({
    success: true,
    data: { name, params },
  }),
});

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('基础功能', () => {
    it('应该能注册工具', () => {
      const tool = createMockTool('test_tool');
      registry.register(tool);
      expect(registry.has('test_tool')).toBe(true);
    });

    it('应该能获取已注册的工具', () => {
      const tool = createMockTool('test_tool');
      registry.register(tool);
      expect(registry.get('test_tool')).toEqual(tool);
    });

    it('应该返回 undefined 对于未注册的工具', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('应该能批量注册工具', () => {
      const tools = [
        createMockTool('tool1'),
        createMockTool('tool2'),
        createMockTool('tool3'),
      ];
      registry.registerAll(tools);
      expect(registry.size).toBe(3);
    });

    it('应该能移除工具', () => {
      const tool = createMockTool('test_tool');
      registry.register(tool);
      expect(registry.remove('test_tool')).toBe(true);
      expect(registry.has('test_tool')).toBe(false);
    });

    it('应该能清空所有工具', () => {
      registry.registerAll([
        createMockTool('tool1'),
        createMockTool('tool2'),
      ]);
      registry.clear();
      expect(registry.size).toBe(0);
    });
  });

  describe('OpenAI 格式转换', () => {
    it('应该正确转换为 OpenAI Function Calling 格式', () => {
      const tool = createMockTool('search_bookmarks', 'Search bookmarks');
      registry.register(tool);
      
      const openAITools = registry.toOpenAIFormat();
      
      expect(openAITools).toHaveLength(1);
      expect(openAITools[0]).toEqual({
        type: 'function',
        function: {
          name: 'search_bookmarks',
          description: 'Search bookmarks',
          parameters: tool.parameters,
        },
      });
    });
  });

  describe('工具执行', () => {
    it('应该能执行已注册的工具', async () => {
      const tool = createMockTool('test_tool');
      registry.register(tool);
      
      const result = await registry.execute('test_tool', { query: 'test' });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        name: 'test_tool',
        params: { query: 'test' },
      });
    });

    it('应该对未注册的工具返回错误', async () => {
      const result = await registry.execute('nonexistent', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('应该捕获工具执行错误', async () => {
      const failingTool: Tool = {
        name: 'failing_tool',
        description: 'A tool that fails',
        parameters: { type: 'object' },
        execute: async () => {
          throw new Error('Intentional failure');
        },
      };
      registry.register(failingTool);
      
      const result = await registry.execute('failing_tool', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Intentional failure');
    });
  });

  /**
   * Property 1: Tool Selection for Bookmark Operations
   * Feature: agent-enhancement, Property 1: Tool Selection for Bookmark Operations
   * Validates: Requirements 2.2
   * 
   * 对于任何书签操作相关的工具名称，注册后应该能被正确获取和执行
   */
  describe('Property 1: Tool Selection for Bookmark Operations', () => {
    // 书签操作相关的工具名称
    const bookmarkToolNames = [
      'search_bookmarks',
      'add_bookmark',
      'delete_bookmark',
      'edit_bookmark',
      'star_bookmark',
      'restore_bookmark',
      'open_bookmark',
    ];

    it('对于任何书签工具，注册后应该能被正确获取', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...bookmarkToolNames),
          (toolName) => {
            const localRegistry = new ToolRegistry();
            const tool = createMockTool(toolName, `${toolName} description`);
            
            localRegistry.register(tool);
            
            // 验证工具被正确注册
            const retrieved = localRegistry.get(toolName);
            return retrieved !== undefined && retrieved.name === toolName;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何书签工具，应该能转换为 OpenAI 格式', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...bookmarkToolNames),
          (toolName) => {
            const localRegistry = new ToolRegistry();
            const tool = createMockTool(toolName);
            
            localRegistry.register(tool);
            const openAITools = localRegistry.toOpenAIFormat();
            
            // 验证转换后的格式正确
            return (
              openAITools.length === 1 &&
              openAITools[0].type === 'function' &&
              openAITools[0].function.name === toolName
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任意组合的书签工具，都应该能被正确注册和获取', () => {
      fc.assert(
        fc.property(
          fc.subarray(bookmarkToolNames, { minLength: 1 }),
          (selectedTools) => {
            const localRegistry = new ToolRegistry();
            
            // 注册选中的工具
            selectedTools.forEach(name => {
              localRegistry.register(createMockTool(name));
            });
            
            // 验证所有选中的工具都能被获取
            return selectedTools.every(name => localRegistry.has(name));
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
