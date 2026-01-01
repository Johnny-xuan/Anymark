/**
 * Agent 类型定义
 * Tool-based 架构的核心类型
 */

// JSON Schema 属性类型
export interface JSONSchemaProperty {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  items?: JSONSchemaProperty;
  enum?: string[];
  description?: string;
  default?: any;
  additionalProperties?: boolean;
}

// JSON Schema 类型（用于工具参数定义）
export interface JSONSchema extends JSONSchemaProperty {
  // 继承所有属性
}

// 工具定义
export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (params: any) => Promise<ToolResult>;
}

// 工具执行结果
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// OpenAI Function Calling 格式
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

// 工具调用
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// 消息类型
export interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  timestamp?: number;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

// 聊天请求
export interface ChatRequest {
  messages: Message[];
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
}

// 聊天响应
export interface ChatResponse {
  content: string | null;
  tool_calls?: ToolCall[];
}

// Agent 响应
export interface AgentResponse {
  message: string;
  toolsUsed?: string[];
  data?: any;
  suggestions?: string[];
}

// 思考步骤
export interface ThinkingStep {
  id: string;
  message: string;
  timestamp: number;
  type?: 'thinking' | 'tool' | 'result' | 'error';
}

// 流式响应回调
export interface StreamCallbacks {
  onProgress?: (progress: ProgressInfo) => void;
  onToken?: (token: string) => void;
  onComplete?: (response: AgentResponse) => void;
  onError?: (error: Error) => void;
  onThinkingStep?: (step: ThinkingStep) => void;
}

// 进度信息
export interface ProgressInfo {
  stage: 'thinking' | 'tool_calling' | 'tool_executing' | 'responding';
  toolName?: string;
  toolIndex?: number;
  totalTools?: number;
  message: string;
}

// 快捷操作
export interface QuickAction {
  id: string;
  icon: string;
  label: string;
  tag: string;
  description: string;
}

// 对话会话
export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  isArchived: boolean;
}
