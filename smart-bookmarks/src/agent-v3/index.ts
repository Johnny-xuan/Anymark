/**
 * Agent V3 - 导出入口
 * 
 * 统一导出 Agent 相关的类和类型
 */

// 主类
export { Agent } from './Agent';
export { BashExecutor, bashExecutor } from './BashExecutor';
export { ReActLoop } from './ReActLoop';
export { FunctionCallingLoop } from './FunctionCallingLoop';

// AI Service
export { AIService, aiService } from './aiService';
export type { StreamCallback } from './aiService';

// 类型
export type {
  AgentContext,
  AgentCallbacks,
  AgentConfig,
  WorkingDirectory,
  ToolResult,
  Tool,
  BashResult,
  DirectoryItem,
  ItemType,
  Step,
  StepType,
  Trajectory,
  ParsedResponse,
  Message,
  // AI Service 类型
  ChatRequest,
  ChatResponse,
  AIMessage,
  ToolCall,
  OpenAITool,
  JSONSchema,
  JSONSchemaProperty,
  // 兼容旧 UI 类型
  ProgressInfo,
  ThinkingStep,
} from './types';

// 常量
export { DEFAULT_AGENT_CONFIG } from './types';

// Prompts
export { REACT_SYSTEM_PROMPT, buildContextPrefix } from './prompts';
