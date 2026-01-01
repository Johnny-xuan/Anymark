/**
 * Agent记忆系统 - 让AI助手拥有记忆和学习能力
 * 
 * 核心功能：
 * 1. 历史对话持久化 - 保存所有对话记录
 * 2. 长期记忆 - 用户偏好、常用操作、个性化设置
 * 3. 上下文学习 - 从对话中提取用户习惯
 * 4. 知识图谱 - 书签关联关系、主题分类
 */

// 对话消息类型
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  intent?: string;  // 用户意图
  action?: string;  // 执行的操作
  metadata?: {
    bookmarkIds?: string[];
    folderIds?: string[];
    tags?: string[];
    searchQuery?: string;
  };
}

// 对话会话
export interface ConversationSession {
  id: string;
  title: string;  // 会话标题（自动生成）
  messages: ConversationMessage[];
  startTime: number;
  lastUpdateTime: number;
  messageCount: number;
  summary?: string;  // AI生成的会话摘要
}

// 长期记忆 - 用户偏好
export interface UserPreferences {
  // 偏好的书签分类方式
  preferredCategories: string[];
  
  // 偏好的文件夹结构
  preferredFolders: string[];
  
  // 常用搜索关键词
  commonSearches: Array<{
    query: string;
    count: number;
    lastUsed: number;
  }>;
  
  // 常用操作模式
  commonActions: Array<{
    action: string;
    count: number;
    context?: string;
  }>;
  
  // 用户交互习惯
  interactionPatterns: {
    preferredResponseStyle?: 'concise' | 'detailed' | 'friendly';
    preferredLanguage?: 'zh' | 'en';
    usesKeyboardShortcuts: boolean;
    activeHours?: number[];  // 用户活跃时段
  };
}

// 长期记忆 - 知识图谱
export interface KnowledgeGraph {
  // 书签关联网络
  bookmarkRelations: Array<{
    bookmarkId: string;
    relatedIds: string[];
    relationshipType: 'similar' | 'related' | 'sequence';
    strength: number;  // 0-1
  }>;
  
  // 主题聚类
  topicClusters: Array<{
    id: string;
    name: string;
    keywords: string[];
    bookmarkIds: string[];
    parentTopicId?: string;
  }>;
  
  // 用户兴趣模型
  userInterests: Array<{
    topic: string;
    score: number;  // 0-1
    lastUpdated: number;
  }>;
}

// Agent记忆存储键
const STORAGE_KEYS = {
  CONVERSATIONS: 'agent_conversations',
  CURRENT_SESSION: 'agent_current_session',
  USER_PREFERENCES: 'agent_user_preferences',
  KNOWLEDGE_GRAPH: 'agent_knowledge_graph',
  MEMORY_METADATA: 'agent_memory_metadata',
};

/**
 * Agent记忆管理器
 */
export class AgentMemoryManager {
  private currentSession: ConversationSession | null = null;
  private userPreferences: UserPreferences | null = null;
  private knowledgeGraph: KnowledgeGraph | null = null;

  /**
   * 初始化记忆系统
   */
  async initialize(): Promise<void> {
    console.log('[AgentMemory] Initializing memory system...');
    
    try {
      // 加载当前会话
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.CURRENT_SESSION,
        STORAGE_KEYS.USER_PREFERENCES,
        STORAGE_KEYS.KNOWLEDGE_GRAPH,
      ]);

      this.currentSession = result[STORAGE_KEYS.CURRENT_SESSION] || this.createNewSession();
      this.userPreferences = result[STORAGE_KEYS.USER_PREFERENCES] || this.createDefaultPreferences();
      this.knowledgeGraph = result[STORAGE_KEYS.KNOWLEDGE_GRAPH] || this.createDefaultKnowledgeGraph();

      console.log('[AgentMemory] Memory system initialized', {
        sessionId: this.currentSession.id,
        messageCount: this.currentSession.messageCount,
        preferencesLoaded: !!this.userPreferences,
      });
    } catch (error) {
      console.error('[AgentMemory] Failed to initialize:', error);
      // 使用默认值
      this.currentSession = this.createNewSession();
      this.userPreferences = this.createDefaultPreferences();
      this.knowledgeGraph = this.createDefaultKnowledgeGraph();
    }
  }

  /**
   * 创建新会话
   */
  private createNewSession(): ConversationSession {
    return {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '新对话',
      messages: [],
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      messageCount: 0,
    };
  }

  /**
   * 创建默认用户偏好
   */
  private createDefaultPreferences(): UserPreferences {
    return {
      preferredCategories: [],
      preferredFolders: [],
      commonSearches: [],
      commonActions: [],
      interactionPatterns: {
        preferredResponseStyle: 'friendly',
        preferredLanguage: 'zh',
        usesKeyboardShortcuts: false,
        activeHours: [],
      },
    };
  }

  /**
   * 创建默认知识图谱
   */
  private createDefaultKnowledgeGraph(): KnowledgeGraph {
    return {
      bookmarkRelations: [],
      topicClusters: [],
      userInterests: [],
    };
  }

  /**
   * 添加消息到当前会话
   */
  async addMessage(message: Omit<ConversationMessage, 'id' | 'timestamp'>): Promise<ConversationMessage> {
    if (!this.currentSession) {
      await this.initialize();
    }

    const newMessage: ConversationMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    this.currentSession!.messages.push(newMessage);
    this.currentSession!.lastUpdateTime = Date.now();
    this.currentSession!.messageCount++;

    // 自动生成会话标题（前3条消息后）
    if (this.currentSession!.messageCount === 3 && !this.currentSession!.title.includes('对话')) {
      this.currentSession!.title = this.generateSessionTitle(this.currentSession!.messages);
    }

    // 保存到storage
    await this.saveCurrentSession();

    // 学习用户习惯
    if (message.role === 'user') {
      await this.learnFromUserMessage(newMessage);
    }

    return newMessage;
  }

  /**
   * 获取当前会话消息
   */
  getCurrentMessages(): ConversationMessage[] {
    return this.currentSession?.messages || [];
  }

  /**
   * 获取最近N条消息作为上下文
   */
  getRecentContext(count: number = 10): ConversationMessage[] {
    const messages = this.currentSession?.messages || [];
    return messages.slice(-count);
  }

  /**
   * 获取用户偏好
   */
  getUserPreferences(): UserPreferences | null {
    return this.userPreferences;
  }

  /**
   * 获取知识图谱
   */
  getKnowledgeGraph(): KnowledgeGraph | null {
    return this.knowledgeGraph;
  }

  /**
   * 清空当前会话（开始新对话）
   */
  async startNewSession(): Promise<void> {
    // 保存旧会话到历史
    if (this.currentSession && this.currentSession.messageCount > 0) {
      await this.saveSessionToHistory(this.currentSession);
    }

    // 创建新会话
    this.currentSession = this.createNewSession();
    await this.saveCurrentSession();

    console.log('[AgentMemory] Started new session:', this.currentSession.id);
  }

  /**
   * 获取历史会话列表
   */
  async getConversationHistory(limit: number = 10): Promise<ConversationSession[]> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.CONVERSATIONS);
      const conversations: ConversationSession[] = result[STORAGE_KEYS.CONVERSATIONS] || [];
      
      // 按时间倒序，返回最近的N个
      return conversations
        .sort((a, b) => b.lastUpdateTime - a.lastUpdateTime)
        .slice(0, limit);
    } catch (error) {
      console.error('[AgentMemory] Failed to load history:', error);
      return [];
    }
  }

  /**
   * 加载历史会话
   */
  async loadSession(sessionId: string): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.CONVERSATIONS);
      const conversations: ConversationSession[] = result[STORAGE_KEYS.CONVERSATIONS] || [];
      
      const session = conversations.find(s => s.id === sessionId);
      if (session) {
        this.currentSession = session;
        await this.saveCurrentSession();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[AgentMemory] Failed to load session:', error);
      return false;
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.CONVERSATIONS);
      const conversations: ConversationSession[] = result[STORAGE_KEYS.CONVERSATIONS] || [];
      
      const filtered = conversations.filter(s => s.id !== sessionId);
      await chrome.storage.local.set({ [STORAGE_KEYS.CONVERSATIONS]: filtered });
      
      return true;
    } catch (error) {
      console.error('[AgentMemory] Failed to delete session:', error);
      return false;
    }
  }

  /**
   * 保存当前会话
   */
  private async saveCurrentSession(): Promise<void> {
    if (!this.currentSession) return;

    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.CURRENT_SESSION]: this.currentSession,
      });
    } catch (error) {
      console.error('[AgentMemory] Failed to save current session:', error);
    }
  }

  /**
   * 保存会话到历史
   */
  private async saveSessionToHistory(session: ConversationSession): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.CONVERSATIONS);
      const conversations: ConversationSession[] = result[STORAGE_KEYS.CONVERSATIONS] || [];
      
      // 添加到历史（最多保留50个）
      conversations.unshift(session);
      if (conversations.length > 50) {
        conversations.pop();
      }
      
      await chrome.storage.local.set({ [STORAGE_KEYS.CONVERSATIONS]: conversations });
    } catch (error) {
      console.error('[AgentMemory] Failed to save to history:', error);
    }
  }

  /**
   * 从用户消息中学习
   */
  private async learnFromUserMessage(message: ConversationMessage): Promise<void> {
    if (!this.userPreferences) return;

    const content = message.content.toLowerCase();
    
    // 学习常用搜索
    if (message.intent === 'search' && message.metadata?.searchQuery) {
      const query = message.metadata.searchQuery;
      const existing = this.userPreferences.commonSearches.find(s => s.query === query);
      
      if (existing) {
        existing.count++;
        existing.lastUsed = Date.now();
      } else {
        this.userPreferences.commonSearches.push({
          query,
          count: 1,
          lastUsed: Date.now(),
        });
      }
      
      // 只保留前50个
      this.userPreferences.commonSearches
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);
    }

    // 学习常用操作
    if (message.action) {
      const existing = this.userPreferences.commonActions.find(a => a.action === message.action);
      
      if (existing) {
        existing.count++;
      } else {
        this.userPreferences.commonActions.push({
          action: message.action,
          count: 1,
          context: message.intent,
        });
      }
      
      // 只保留前30个
      this.userPreferences.commonActions
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);
    }

    // 学习活跃时段
    const hour = new Date().getHours();
    if (!this.userPreferences.interactionPatterns.activeHours) {
      this.userPreferences.interactionPatterns.activeHours = [];
    }
    if (!this.userPreferences.interactionPatterns.activeHours.includes(hour)) {
      this.userPreferences.interactionPatterns.activeHours.push(hour);
    }

    // 保存偏好
    await this.saveUserPreferences();
  }

  /**
   * 保存用户偏好
   */
  private async saveUserPreferences(): Promise<void> {
    if (!this.userPreferences) return;

    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.USER_PREFERENCES]: this.userPreferences,
      });
    } catch (error) {
      console.error('[AgentMemory] Failed to save preferences:', error);
    }
  }

  /**
   * 生成会话标题
   */
  private generateSessionTitle(messages: ConversationMessage[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) return '新对话';

    const firstMessage = userMessages[0].content;
    
    // 提取关键词作为标题
    if (firstMessage.length <= 30) {
      return firstMessage;
    }
    
    return `${firstMessage.substring(0, 27)}...`;
  }

  /**
   * 生成会话摘要（使用AI）
   */
  async generateSessionSummary(sessionId?: string): Promise<string | null> {
    const session = sessionId 
      ? (await this.getConversationHistory(100)).find(s => s.id === sessionId)
      : this.currentSession;

    if (!session || session.messageCount < 5) return null;

    // TODO: 调用AI生成摘要
    // 这里可以集成MCP或其他AI服务
    
    return `讨论了${session.messageCount}条消息，主要内容: ${session.title}`;
  }

  /**
   * 导出记忆数据（用于备份）
   */
  async exportMemory(): Promise<object> {
    const conversations = await this.getConversationHistory(100);
    
    return {
      currentSession: this.currentSession,
      conversations,
      userPreferences: this.userPreferences,
      knowledgeGraph: this.knowledgeGraph,
      exportTime: Date.now(),
      version: '1.0',
    };
  }

  /**
   * 导入记忆数据（从备份恢复）
   */
  async importMemory(data: any): Promise<boolean> {
    try {
      if (data.currentSession) {
        this.currentSession = data.currentSession;
        await this.saveCurrentSession();
      }
      
      if (data.conversations) {
        await chrome.storage.local.set({
          [STORAGE_KEYS.CONVERSATIONS]: data.conversations,
        });
      }
      
      if (data.userPreferences) {
        this.userPreferences = data.userPreferences;
        await this.saveUserPreferences();
      }
      
      if (data.knowledgeGraph) {
        this.knowledgeGraph = data.knowledgeGraph;
        await chrome.storage.local.set({
          [STORAGE_KEYS.KNOWLEDGE_GRAPH]: this.knowledgeGraph,
        });
      }
      
      return true;
    } catch (error) {
      console.error('[AgentMemory] Failed to import memory:', error);
      return false;
    }
  }
}

// 导出单例
export const agentMemory = new AgentMemoryManager();
