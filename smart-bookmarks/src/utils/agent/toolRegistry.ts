/**
 * Tool Registry - 工具注册表
 * 管理所有可用的工具，支持注册、获取和转换为 OpenAI 格式
 */

import type { Tool, OpenAITool, ToolResult } from './types';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * 验证参数
   * 检查参数类型、必需字段、范围限制等
   */
  private validateParams(params: any, schema: any): { valid: boolean; errors: string[]; sanitized: any } {
    const errors: string[] = [];
    const sanitized: any = { ...params };

    if (!schema || !schema.properties) {
      return { valid: true, errors: [], sanitized };
    }

    // 1. 检查必需参数
    if (schema.required && Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in params) || params[key] === undefined || params[key] === null) {
          errors.push(`Missing required parameter: ${key}`);
        }
      }
    }

    // 2. 检查额外参数（如果 additionalProperties: false）
    if (schema.additionalProperties === false) {
      const allowedKeys = Object.keys(schema.properties);
      for (const key of Object.keys(params)) {
        if (!allowedKeys.includes(key)) {
          errors.push(`Unknown parameter: ${key}`);
        }
      }
    }

    // 3. 验证每个参数的类型和范围
    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema.properties[key];
      if (!propSchema) continue;

      const expectedType = propSchema.type;
      let actualValue = value;

      // 类型转换和验证
      if (expectedType === 'number') {
        if (typeof value === 'string') {
          const num = Number(value);
          if (isNaN(num)) {
            errors.push(`Invalid type for "${key}": expected number, got string "${value}"`);
            continue;
          }
          actualValue = num;
          sanitized[key] = num;
        } else if (typeof value !== 'number') {
          errors.push(`Invalid type for "${key}": expected number, got ${typeof value}`);
          continue;
        }

        // 检查范围
        if (propSchema.minimum !== undefined && actualValue < propSchema.minimum) {
          errors.push(`Parameter "${key}" must be >= ${propSchema.minimum}, got ${actualValue}`);
        }
        if (propSchema.maximum !== undefined && actualValue > propSchema.maximum) {
          errors.push(`Parameter "${key}" must be <= ${propSchema.maximum}, got ${actualValue}`);
        }
      } else if (expectedType === 'string') {
        if (typeof value !== 'string') {
          errors.push(`Invalid type for "${key}": expected string, got ${typeof value}`);
        }
      } else if (expectedType === 'boolean') {
        if (typeof value === 'string') {
          // 尝试转换字符串到布尔值
          if (value === 'true') {
            sanitized[key] = true;
          } else if (value === 'false') {
            sanitized[key] = false;
          } else {
            errors.push(`Invalid type for "${key}": expected boolean, got string "${value}"`);
          }
        } else if (typeof value !== 'boolean') {
          errors.push(`Invalid type for "${key}": expected boolean, got ${typeof value}`);
        }
      } else if (expectedType === 'array') {
        if (!Array.isArray(value)) {
          errors.push(`Invalid type for "${key}": expected array, got ${typeof value}`);
        }
      } else if (expectedType === 'object') {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`Invalid type for "${key}": expected object, got ${typeof value}`);
        }
      }

      // 检查枚举值
      if (propSchema.enum && !propSchema.enum.includes(actualValue)) {
        errors.push(`Invalid value for "${key}": must be one of [${propSchema.enum.join(', ')}], got "${actualValue}"`);
      }
    }

    return { valid: errors.length === 0, errors, sanitized };
  }

  /**
   * 验证 Schema 格式
   * 确保 schema 符合 JSON Schema 规范
   */
  private validateSchema(schema: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!schema) {
      errors.push('Schema is required');
      return { valid: false, errors };
    }

    if (schema.type !== 'object') {
      errors.push('Schema type must be "object"');
    }

    if (!schema.properties || typeof schema.properties !== 'object') {
      errors.push('Schema must have "properties" object');
    }

    if (schema.required && !Array.isArray(schema.required)) {
      errors.push('Schema "required" must be an array');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 注册工具（带 Schema 验证）
   */
  register(tool: Tool): void {
    // 验证 Schema 格式
    const schemaValidation = this.validateSchema(tool.parameters);
    if (!schemaValidation.valid) {
      console.error(`[ToolRegistry] Invalid schema for tool "${tool.name}":`, schemaValidation.errors);
      // 仍然注册，但记录警告
    }

    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool "${tool.name}" already registered, overwriting.`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: Tool[]): void {
    tools.forEach(tool => this.register(tool));
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取所有工具名称
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 移除工具
   */
  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * 转换为 OpenAI Function Calling 格式
   */
  toOpenAIFormat(): OpenAITool[] {
    return this.getAll().map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * 执行工具（带参数验证）
   */
  async execute(name: string, params: any): Promise<ToolResult> {
    const tool = this.get(name);
    
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
      };
    }

    // 验证参数
    const validation = this.validateParams(params, tool.parameters);
    if (!validation.valid) {
      console.error(`[ToolRegistry] Parameter validation failed for tool "${name}":`, validation.errors);
      return {
        success: false,
        error: `Invalid parameters: ${validation.errors.join('; ')}`,
      };
    }

    try {
      // 使用清理后的参数执行工具
      return await tool.execute(validation.sanitized);
    } catch (error) {
      console.error(`[ToolRegistry] Error executing tool "${name}":`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// 导出单例
export const toolRegistry = new ToolRegistry();
