/**
 * 聊天状态管理 - 增强版
 * 集成记忆系统和MCP服务
 */

import { create } from 'zustand';
import type { ChatMessage } from './chatService';
import { sendChatMessage, generateBookmarkRecommendation, analyzeBookmarkContent, suggestBookmarkCollections } from './chatService';
import type { ConversationMessage } from '../utils/agentMemory';
import { agentMemory } from '../utils/agentMemory';
import { mcpService } from '../utils/mcpService';

interface ChatState {
  // 状态
  messages: ChatMessage[];
  isLoading: boolean;
  isOpen: boolean;
  currentMode: 'chat' | 'analysis' | 'recommendation';
  error: string | null;
  memoryInitialized: boolean;

  // 操作
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setOpen: (open: boolean) => void;
  setMode: (mode: 'chat' | 'analysis' | 'recommendation') => void;
  setError: (error: string | null) => void;
  initializeMemory: () => Promise<void>;

  // 聊天功能
  sendMessage: (content: string, apiToken?: string) => Promise<void>;
  requestBookmarkRecommendation: (query: string, bookmarks: any[], apiToken?: string) => Promise<void>;
  analyzeBookmark: (bookmark: any, apiToken?: string) => Promise<void>;
  getCollectionSuggestion: (query: string, apiToken?: string) => Promise<void>;
  
  // MCP增强功能
  searchWebWithMCP: (query: string) => Promise<void>;
  getRealtimeInfo: (query: string, type?: 'news' | 'weather' | 'stock') => Promise<void>;
  askQuestion: (question: string) => Promise<void>;
  
  // 记忆管理
  loadHistory: () => Promise<void>;
  startNewConversation: () => Promise<void>;
  exportMemory: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // 初始状态
  messages: [],
  isLoading: false,
  isOpen: false,
  currentMode: 'chat',
  error: null,
  memoryInitialized: false,

  // 初始化记忆系统
  initializeMemory: async () => {
    try {
      await agentMemory.initialize();
      
      // 加载历史消息
      const memoryMessages = agentMemory.getCurrentMessages();
      if (memoryMessages.length > 0) {
        const chatMessages: ChatMessage[] = memoryMessages.map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          timestamp: m.timestamp,
        }));
        set({ messages: chatMessages, memoryInitialized: true });
      } else {
        // 添加欢迎消息
        const welcomeMsg: ChatMessage = {
          id: 'welcome',
          role: 'assistant',
          content: '你好！我是智能书签助手，现在拥有记忆能力了！\n\n我可以：\n• 记住我们的对话历史\n• 学习你的使用习惯\n• 联网搜索最新信息\n• 回答各种问题\n• 管理和分析书签\n\n有什么可以帮你的吗？',
          timestamp: Date.now()
        };
        set({ messages: [welcomeMsg], memoryInitialized: true });
      }
    } catch (error) {
      console.error('[ChatStore] Failed to initialize memory:', error);
      set({ memoryInitialized: true }); // 即使失败也标记为已初始化
    }
  },

  // 基本操作 - 集成记忆
  addMessage: async (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };
    set((state) => ({
      messages: [...state.messages, newMessage]
    }));
    
    // 保存到记忆系统
    if (get().memoryInitialized) {
      await agentMemory.addMessage({
        role: newMessage.role,
        content: newMessage.content,
      });
    }
  },

  clearMessages: async () => {
    await agentMemory.startNewSession();
    const welcomeMsg: ChatMessage = {
      id: 'welcome_new',
      role: 'assistant',
      content: '新对话开始。有什么可以帮你的吗？',
      timestamp: Date.now()
    };
    set({ messages: [welcomeMsg], error: null });
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setOpen: (open) => set({ isOpen: open }),
  setMode: (mode) => set({ currentMode: mode }),
  setError: (error) => set({ error }),

  // MCP增强功能
  searchWebWithMCP: async (query) => {
    const { addMessage, setLoading, setError } = get();
    
    addMessage({ role: 'user', content: `搜索网络：${query}` });
    setLoading(true);
    setError(null);

    try {
      const results = await mcpService.searchWeb(query, { maxResults: 5 });

      if (results.success && results.results.length > 0) {
        const message = `🔍 网络搜索结果：\n\n${results.results.map((r, i) => 
          `${i + 1}. **${r.title}**\n   ${r.snippet}\n   🔗 ${r.url}\n   📰 来源: ${r.source || '未知'}`
        ).join('\n\n')}`;
        
        addMessage({ role: 'assistant', content: message });
      } else {
        addMessage({
          role: 'assistant',
          content: '抱歉，没有找到相关结果。请尝试其他关键词。'
        });
      }
    } catch (error) {
      console.error('MCP search error:', error);
      setError('搜索服务暂时不可用');
      addMessage({
        role: 'assistant',
        content: '搜索服务暂时不可用，请稍后重试。'
      });
    } finally {
      setLoading(false);
    }
  },

  getRealtimeInfo: async (query, type = 'general') => {
    const { addMessage, setLoading, setError } = get();
    
    addMessage({ role: 'user', content: query });
    setLoading(true);
    setError(null);

    try {
      const results = await mcpService.getRealtimeInfo(query, type);

      if (results.success && results.results.length > 0) {
        const message = `📊 实时信息：\n\n${results.results.map((r, i) => 
          `${i + 1}. **${r.title}**\n   ${r.snippet}\n   🔗 ${r.url}`
        ).join('\n\n')}`;
        
        addMessage({ role: 'assistant', content: message });
      } else {
        addMessage({
          role: 'assistant',
          content: '抱歉，暂时无法获取实时信息。'
        });
      }
    } catch (error) {
      console.error('Realtime info error:', error);
      setError('实时信息服务暂时不可用');
      addMessage({
        role: 'assistant',
        content: '实时信息服务暂时不可用，请稍后重试。'
      });
    } finally {
      setLoading(false);
    }
  },

  askQuestion: async (question) => {
    const { addMessage, setLoading, setError } = get();
    
    addMessage({ role: 'user', content: question });
    setLoading(true);
    setError(null);

    try {
      const response = await mcpService.answerQuestion(question);

      let message = `💡 **回答：**\n\n${response.answer}`;
      
      if (response.sources.length > 0) {
        message += `\n\n📚 **参考来源：**\n${response.sources.slice(0, 3).map((s, i) => 
          `${i + 1}. ${s.title}\n   ${s.url}`
        ).join('\n')}`;
      }
      
      if (response.confidence < 0.5) {
        message += `\n\n⚠️ 注意：此答案的置信度较低（${Math.round(response.confidence * 100)}%），建议进一步验证。`;
      }
      
      addMessage({ role: 'assistant', content: message });
    } catch (error) {
      console.error('Question answering error:', error);
      setError('问答服务暂时不可用');
      addMessage({
        role: 'assistant',
        content: '抱歉，我无法回答这个问题。请尝试重新表述或使用搜索功能。'
      });
    } finally {
      setLoading(false);
    }
  },

  // 记忆管理
  loadHistory: async () => {
    try {
      const history = await agentMemory.getConversationHistory(10);
      console.log('[ChatStore] Loaded conversation history:', history.length);
      // UI可以显示历史会话列表
    } catch (error) {
      console.error('[ChatStore] Failed to load history:', error);
    }
  },

  startNewConversation: async () => {
    await get().clearMessages();
  },

  exportMemory: async () => {
    try {
      const memoryData = await agentMemory.exportMemory();
      const dataStr = JSON.stringify(memoryData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-memory-${Date.now()}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      console.log('[ChatStore] Memory exported successfully');
    } catch (error) {
      console.error('[ChatStore] Failed to export memory:', error);
    }
  },

  // 发送聊天消息 - 集成MCP
  sendMessage: async (content, apiToken) => {
    const { addMessage, setLoading, setError } = get();

    // 检测是否是MCP命令
    const lowerContent = content.toLowerCase();
    
    // 联网搜索命令
    if (lowerContent.includes('搜索网络') || lowerContent.includes('网上搜') || lowerContent.startsWith('搜：')) {
      const query = content.replace(/搜索网络|网上搜|搜：/g, '').trim();
      await get().searchWebWithMCP(query);
      return;
    }
    
    // 实时信息命令
    if (lowerContent.includes('新闻') || lowerContent.includes('天气') || lowerContent.includes('股票')) {
      const type = lowerContent.includes('新闻') ? 'news' : 
                   lowerContent.includes('天气') ? 'weather' : 'stock';
      await get().getRealtimeInfo(content, type);
      return;
    }
    
    // 问答命令
    if (lowerContent.includes('什么是') || lowerContent.includes('如何') || lowerContent.includes('为什么') || lowerContent.endsWith('？')) {
      await get().askQuestion(content);
      return;
    }

    // 普通聊天
    addMessage({ role: 'user', content });
    setLoading(true);
    setError(null);

    try {
      // 获取上下文
      const contextMessages = get().memoryInitialized 
        ? agentMemory.getRecentContext(6).map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          }))
        : get().messages;

      const response = await sendChatMessage(contextMessages as ChatMessage[], apiToken);

      if (response.success && response.message) {
        addMessage({ role: 'assistant', content: response.message.content });
      } else {
        setError(response.error || '发送失败');
        addMessage({
          role: 'assistant',
          content: '抱歉，我遇到了一些问题。请稍后重试。'
        });
      }
    } catch (error) {
      console.error('Send message error:', error);
      setError('网络错误');
      addMessage({
        role: 'assistant',
        content: '抱歉，网络连接出现问题。请检查网络后重试。'
      });
    } finally {
      setLoading(false);
    }
  },

  // 请求书签推荐
  requestBookmarkRecommendation: async (query, bookmarks, apiToken) => {
    const { addMessage, setLoading, setError } = get();

    setLoading(true);
    setError(null);

    try {
      const response = await generateBookmarkRecommendation(query, bookmarks, apiToken);

      if (response.success && response.message) {
        addMessage({
          role: 'assistant',
          content: `📌 **推荐结果**\n\n${response.message.content}`
        });
      } else {
        setError(response.error || '推荐失败');
        addMessage({
          role: 'assistant',
          content: '抱歉，我无法生成推荐。请检查查询内容后重试。'
        });
      }
    } catch (error) {
      console.error('Recommendation error:', error);
      setError('推荐服务错误');
      addMessage({
        role: 'assistant',
        content: '推荐服务暂时不可用，请稍后重试。'
      });
    } finally {
      setLoading(false);
    }
  },

  // 分析书签
  analyzeBookmark: async (bookmark, apiToken) => {
    const { addMessage, setLoading, setError } = get();

    setLoading(true);
    setError(null);

    try {
      const response = await analyzeBookmarkContent(bookmark, apiToken);

      if (response.success && response.message) {
        addMessage({
          role: 'assistant',
          content: `🔍 **分析结果**\n\n${response.message.content}`
        });
      } else {
        setError(response.error || '分析失败');
        addMessage({
          role: 'assistant',
          content: '抱歉，我无法分析这个书签。请检查内容后重试。'
        });
      }
    } catch (error) {
      console.error('Analyze bookmark error:', error);
      setError('分析服务错误');
      addMessage({
        role: 'assistant',
        content: '分析服务暂时不可用，请稍后重试。'
      });
    } finally {
      setLoading(false);
    }
  },

  // 获取收藏建议
  getCollectionSuggestion: async (query, apiToken) => {
    const { addMessage, setLoading, setError } = get();

    setLoading(true);
    setError(null);

    try {
      const response = await suggestBookmarkCollections(query, apiToken);

      if (response.success && response.message) {
        addMessage({
          role: 'assistant',
          content: `💡 **收藏建议**\n\n${response.message.content}`
        });
      } else {
        setError(response.error || '建议失败');
        addMessage({
          role: 'assistant',
          content: '抱歉，我无法生成收藏建议。请稍后重试。'
        });
      }
    } catch (error) {
      console.error('Collection suggestion error:', error);
      setError('建议服务错误');
      addMessage({
        role: 'assistant',
        content: '建议服务暂时不可用，请稍后重试。'
      });
    } finally {
      setLoading(false);
    }
  }
}));

export default useChatStore;
