/**
 * Agent V3 - 统一类型定义
 * 
 * 设计原则：
 * 1. 所有 Agent 相关类型定义在此文件
 * 2. 类型即契约，编译时检查兼容性
 * 3. 数据结构简单清晰，不做过度抽象
 */

// ============ 核心类型 ============

/** 工作目录状态 */
export interface WorkingDirectory {
  /** 文件夹 Chrome ID，null 表示根目录 */
  folderId: string | null;
  /** 路径字符串，如 "/书签栏/开发" */
  path: string;
}

/** Agent 上下文 */
export interface AgentContext {
  /** 当前工作目录 */
  cwd: WorkingDirectory;
  /** 会话 ID */
  sessionId: string;
}

// ============ Tool 类型 ============

/** Tool 执行结果 - 统一格式 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean;
  /** 人类可读的消息 */
  message: string;
  /** 结构化数据，完整传递给 LLM，不做压缩 */
  data?: Record<string, unknown>;
  /** 错误码 */
  errorCode?: string;
}

/** Tool 定义接口 */
export interface Tool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 执行工具 */
  execute(input: string, context: AgentContext): Promise<ToolResult>;
}

// ============ Bash 类型 ============

/** 目录项类型 */
export type ItemType = 'directory' | 'file';

/** 目录项 */
export interface DirectoryItem {
  /** 类型：目录或文件 */
  type: ItemType;
  /** 名称 */
  name: string;
  /** Chrome ID */
  id: string;
  /** URL（仅书签有） */
  url?: string;
  /** 是否星标（仅书签有） */
  starred?: boolean;
  /** 父目录 ID */
  parentId?: string;
  /** 完整路径 */
  path?: string;
  /** AI 摘要 */
  aiSummary?: string;
  /** AI 标签 */
  aiTags?: string[];
  /** 用户标签 */
  userTags?: string[];
}

/** Bash 命令结果 */
export interface BashResult {
  /** 是否成功 */
  success: boolean;
  /** 纯文本输出（给 LLM 看，Unix 风格） */
  output: string;
  /** 结构化数据 */
  data?: {
    /** 目录项列表 */
    items?: DirectoryItem[];
    /** 项目数量 */
    count?: number;
    /** 当前路径 */
    path?: string;
    /** 其他数据 */
    [key: string]: unknown;
  };
  /** 退出码 */
  exitCode: number;
}

// ============ ReAct 类型 ============

/** ReAct 步骤类型 */
export type StepType = 'thought' | 'action' | 'observation' | 'answer' | 'complete';

/** ReAct 步骤 */
export interface Step {
  /** 步骤类型 */
  type: StepType;
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** Action 步骤的工具名 */
  toolName?: string;
  /** Action 步骤的工具输入 */
  toolInput?: string;
  /** Observation 步骤的工具结果（完整保留） */
  toolResult?: ToolResult;
}

/** ReAct 轨迹 */
export interface Trajectory {
  /** 步骤列表 */
  steps: Step[];
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
}

/** 解析后的 LLM 响应 */
export interface ParsedResponse {
  /** 思考内容 */
  thought?: string;
  /** Action 信息 */
  action?: {
    tool: string;
    input: string;
  };
  /** 最终答案（complete 时使用，结束循环） */
  answer?: string;
  /** 中间回答（answer 时使用，输出但继续循环） */
  intermediateAnswer?: string;
}

// ============ 回调类型 ============

/** Agent 回调 */
export interface AgentCallbacks {
  /** 步骤回调 */
  onStep?: (step: Step) => void;
  /** Token 流式输出回调 */
  onToken?: (token: string) => void;
  /** 通知 UI 清空已流出的中间文本（当发现当前流是中间迭代而非最终回答时） */
  onStreamingReset?: () => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 路径变化回调 */
  onPathChange?: (path: string, folderId: string | null) => void;
}

// ============ 消息类型 ============

/** 对话消息 */
export interface Message {
  /** 角色 */
  role: 'user' | 'assistant' | 'system';
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp?: number;
}

// ============ 配置类型 ============

/** Agent 配置 */
export interface AgentConfig {
  /** 最大迭代次数 */
  maxIterations: number;
  /** LLM 温度 */
  temperature: number;
  /** 是否启用流式输出 */
  enableStreaming: boolean;
  /** 调试模式 */
  debug: boolean;
  /** 使用 Function Calling 模式（默认 true，不支持时自动回退到 ReAct） */
  useFunctionCalling: boolean;
}

/** 默认配置 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 6,
  temperature: 0.3,
  enableStreaming: true,
  debug: false,
  useFunctionCalling: true,
};

// ============ AI Service 类型 ============

/** JSON Schema 属性 */
export interface JSONSchemaProperty {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  items?: JSONSchemaProperty;
  enum?: string[];
  description?: string;
  default?: unknown;
  additionalProperties?: boolean;
}

export interface JSONSchema extends JSONSchemaProperty {}

/** OpenAI 工具格式 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** AI 消息（扩展 Message 支持 tool 角色） */
export interface AIMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  timestamp?: number;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/** Chat 请求 */
export interface ChatRequest {
  messages: AIMessage[];
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
}

/** Chat 响应 */
export interface ChatResponse {
  content: string | null;
  tool_calls?: ToolCall[];
}

// ============ 进度和回调类型（兼容旧 UI） ============

/** 进度信息 */
export interface ProgressInfo {
  stage: 'thinking' | 'tool_calling' | 'tool_executing' | 'responding';
  toolName?: string;
  toolIndex?: number;
  totalTools?: number;
  message: string;
}

/** 思考步骤（兼容旧 UI） */
export interface ThinkingStep {
  id: string;
  message: string;
  timestamp: number;
  type?: 'thinking' | 'tool' | 'result' | 'error';
}
