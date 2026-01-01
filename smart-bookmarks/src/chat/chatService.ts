/**
 * AI对话服务（已弃用）
 * 
 * 注意：此文件中的函数已弃用，因为服务器端豆包 API 不存在。
 * 请使用 src/utils/aiAnalyzer.ts 进行 AI 分析功能。
 * 请使用 src/chat/chatStore.ts 中的 AI Agent 进行对话功能。
 * 
 * 保留此文件仅为向后兼容，未来版本将删除。
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ChatResponse {
  success: boolean;
  message?: ChatMessage;
  error?: string;
}

/**
 * 发送聊天消息（已弃用）
 * @deprecated 请使用 AI Agent 系统进行对话
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  apiToken?: string
): Promise<ChatResponse> {
  return {
    success: false,
    error: '此功能已迁移至 AI Agent 系统，请在设置中配置 AI API Key'
  };
}

/**
 * 生成智能书签推荐（已弃用）
 * @deprecated 请使用 AI Agent 的搜索功能
 */
export async function generateBookmarkRecommendation(
  query: string,
  bookmarks: any[],
  apiToken?: string
): Promise<ChatResponse> {
  return {
    success: false,
    error: '此功能已迁移至 AI Agent 系统'
  };
}

/**
 * 分析书签内容并生成摘要（已弃用）
 * @deprecated 请使用 aiAnalyzer.analyzeBookmark()
 */
export async function analyzeBookmarkContent(
  bookmark: { title: string; url: string; description?: string },
  apiToken?: string
): Promise<ChatResponse> {
  return {
    success: false,
    error: '此功能已迁移至 AI Analyzer 系统'
  };
}

/**
 * 智能收藏建议（已弃用）
 * @deprecated 请使用 AI Agent 系统
 */
export async function suggestBookmarkCollections(
  query: string,
  apiToken?: string
): Promise<ChatResponse> {
  return {
    success: false,
    error: '此功能已迁移至 AI Agent 系统'
  };
}
