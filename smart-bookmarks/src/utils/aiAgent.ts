/**
 * AI Agent - 智能书签助手核心逻辑
 * 负责意图识别、对话理解和操作执行
 */

import { useBookmarkStore } from '../sidebar/store/bookmarkStore';

// 扩展 Window 接口以支持文件系统访问
declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<any>;
  }
}

// 对话消息类型
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  data?: any;
}

// 用户意图类型
export type IntentType = 'search' | 'add' | 'open' | 'recommend' | 'delete' | 'edit' | 'chat' | 'help' | 'webSearch' | 'fileSearch' | 'collect' | 'organize';

// 意图识别结果
export interface UserIntent {
  type: IntentType;
  entities: {
    keywords?: string[];      // 搜索关键词
    url?: string;             // 网页 URL
    bookmarkId?: string;      // 书签 ID
    category?: string;        // 分类
    tags?: string[];          // 标签
    query?: string;           // 原始查询
  };
  confidence: number;         // 置信度 0-1
}

// AI 响应结果
export interface AIResponse {
  message: string;            // 文本回复
  action?: string;            // 执行的操作
  data?: any;                 // 返回的数据
  suggestions?: string[];     // 建议的后续操作
}

// AI 配置类型
interface AIConfig {
  provider: string;
  apiKey?: string;
  apiKeys?: string[];
  model: string;
  endpoint: string;
  customPrompt?: string;
  customCategories?: string[];
}

// Provider 配置（默认值，会被用户配置覆盖）
const PROVIDER_CONFIGS: Record<string, { endpoint: string; model: string }> = {
  doubao: {
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    model: 'doubao-lite-4k',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
  },
  claude: {
    endpoint: 'https://api.anthropic.com/v1/chat/completions',
    model: 'claude-sonnet-4-20250514',
  },
  // 本地 Ollama - 注意：模型由用户在设置中配置
  ollama: {
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: '', // 用户在设置中自行配置
  },
};

/**
 * 智能书签助手
 */
export class BookmarkAIAgent {
  constructor() {}

  /**
   * 获取用户完整AI配置
   */
  private async getUserAIConfig(): Promise<AIConfig> {
    try {
      const result = await chrome.storage.local.get(['aiConfig', 'userSettings']);
      const aiConfig = result.aiConfig as any;
      const userSettings = result.userSettings as any;

      const provider = aiConfig?.provider || 'doubao';
      const providerConfig = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.doubao;

      return {
        provider,
        apiKey: aiConfig?.apiKey,
        apiKeys: aiConfig?.apiKeys,
        model: aiConfig?.model || providerConfig.model,
        endpoint: aiConfig?.endpoint || providerConfig.endpoint,
        customPrompt: userSettings?.aiPrompt,
        customCategories: userSettings?.aiCategories || []
      };
    } catch (error) {
      console.warn('[AI Agent] Failed to get AI config, using defaults:', error);
      return {
        provider: 'doubao',
        model: PROVIDER_CONFIGS.doubao.model,
        endpoint: PROVIDER_CONFIGS.doubao.endpoint,
        customCategories: []
      };
    }
  }

  /**
   * 调用AI API（统一入口）
   */
  private async callAI(prompt: string): Promise<string> {
    const config = await this.getUserAIConfig();
    const provider = config.provider;
    const providerConfig = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.doubao;

    // Ollama 本地模型不需要 API Key
    const isLocalOllama = provider === 'ollama';
    const apiKey = config.apiKeys?.[0] || config.apiKey;

    if (!isLocalOllama && !apiKey) {
      throw new Error('API Key not configured. Please set your API Key in Settings.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 非本地模型添加 Authorization header
    if (!isLocalOllama && apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(config.endpoint || providerConfig.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model || providerConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * 分析用户输入，识别意图
   */
  async parseIntent(userInput: string, _messageHistory: Message[] = []): Promise<UserIntent> {
    const prompt = `你是一个专业的书签管理助手。你的任务是根据用户输入，准确判断用户的真实意图。

## 意图判断规则：

**search（搜索书签）** - 用户想在自己的书签库中查找内容
- "找一个 Python 教程"
- "我之前收藏过关于机器学习的"
- "搜索我的前端书签"
- "查找 React 文档"

**add（添加书签）** - 用户想把当前网页收藏到书签库
- "把当前网页收藏"
- "保存这个页面"
- "收藏这个链接"

**open（打开书签）** - 用户想打开某个已收藏的书签
- "打开那个 React 文档"
- "打开我收藏的 Python 教程"

**webSearch（网页搜索）** - 用户想搜索互联网上的内容
- "搜索网络上的 Python 教程"
- "查找最新的AI资讯"
- "全网搜索 JavaScript 最新特性"

**collect（收集书签）** - 用户想把多个相关书签归类到同一个文件夹
- "把所有Python教程收集到一个文件夹"
- "把AI相关书签归类"
- "把前端资料整理到一起"

**organize（智能整理）** - 用户想对所有书签进行AI自动分类整理
- "智能整理所有书签"
- "AI自动整理书签"
- "帮我整理书签分类"

**recommend（推荐）** - 用户想根据某个主题获得书签推荐
- "推荐一些前端学习资源"
- "有哪些好的 React 教程"

**help（帮助）** - 用户想了解功能
- "你能做什么"
- "如何使用"

**chat（对话）** - 普通聊天、问候
- "你好"
- "谢谢"

当前用户输入: "${userInput}"

返回格式（必须是有效的 JSON）：
{
  "type": "search",
  "entities": {
    "keywords": ["Python", "教程"],
    "query": "${userInput}"
  },
  "confidence": 0.95
}

只返回 JSON，不要其他内容。`;

    try {
      const content = await this.callAI(prompt);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid JSON response');
      }

      const intent = JSON.parse(jsonMatch[0]);
      return intent;
    } catch (error) {
      console.error('[AIAgent] Intent parsing error:', error);
      return this.fallbackIntentRecognition(userInput);
    }
  }

  /**
   * 降级方案：基于规则的意图识别
   */
  private fallbackIntentRecognition(input: string): UserIntent {
    const lower = input.toLowerCase();

    if (lower.includes('找') || lower.includes('搜') || lower.includes('查')) {
      // 检查是否为网页搜索
      if (lower.includes('网络') || lower.includes('网页') || lower.includes('在线') || lower.includes('最新') || lower.includes('全网')) {
        return {
          type: 'webSearch',
          entities: { keywords: [input], query: input },
          confidence: 0.8,
        };
      }
      // 检查是否为文件系统搜索
      if (lower.includes('文件') || lower.includes('PDF') || lower.includes('文档') || lower.includes('我的')) {
        return {
          type: 'fileSearch',
          entities: { keywords: [input], query: input },
          confidence: 0.8,
        };
      }
      // 默认书签搜索
      return {
        type: 'search',
        entities: { keywords: [input], query: input },
        confidence: 0.7,
      };
    }

    if (lower.includes('收藏') || lower.includes('保存')) {
      return {
        type: 'add',
        entities: { query: input },
        confidence: 0.8,
      };
    }

    if (lower.includes('打开')) {
      return {
        type: 'open',
        entities: { query: input },
        confidence: 0.7,
      };
    }

    if (lower.includes('推荐')) {
      return {
        type: 'recommend',
        entities: { query: input },
        confidence: 0.7,
      };
    }

    // 收集书签到文件夹
    if (lower.includes('收集') || lower.includes('归类') || lower.includes('整理到') || lower.includes('移动到文件夹')) {
      return {
        type: 'collect',
        entities: { query: input },
        confidence: 0.8,
      };
    }

    // 智能整理
    if (lower.includes('智能整理') || lower.includes('自动整理') || lower.includes('AI整理') || lower.includes('全部整理')) {
      return {
        type: 'organize',
        entities: { query: input },
        confidence: 0.8,
      };
    }

    // 明确的网络搜索关键词
    if (lower.includes('搜索网络') || lower.includes('全网搜索') || lower.includes('在线搜索')) {
      return {
        type: 'webSearch',
        entities: { query: input },
        confidence: 0.9,
      };
    }

    // 明确的文件系统搜索关键词
    if (lower.includes('搜索文件') || lower.includes('查找本地') || lower.includes('我的文件')) {
      return {
        type: 'fileSearch',
        entities: { query: input },
        confidence: 0.9,
      };
    }

    if (lower.includes('帮助') || lower.includes('能做什么')) {
      return {
        type: 'help',
        entities: {},
        confidence: 0.9,
      };
    }

    return {
      type: 'chat',
      entities: { query: input },
      confidence: 0.5,
    };
  }

  /**
   * 执行意图对应的操作
   */
  async executeIntent(intent: UserIntent, context?: any): Promise<AIResponse> {
    console.log('[AIAgent] Executing intent:', intent);

    switch (intent.type) {
      case 'search':
        return await this.handleSearch(intent);
      case 'add':
        return await this.handleAdd(intent, context);
      case 'open':
        return await this.handleOpen(intent);
      case 'recommend':
        return await this.handleRecommend(intent);
      case 'webSearch':
        return await this.handleWebSearch(intent);
      case 'fileSearch':
        return await this.handleFileSearch(intent);
      case 'collect':
        return await this.handleCollect(intent);
      case 'organize':
        return await this.handleOrganize(intent);
      case 'help':
        return this.handleHelp();
      case 'chat':
        return await this.handleChat(intent);
      default:
        return {
          message: '抱歉，我还不太理解你的意思。你可以试试：\n- "找一个 Python 教程"\n- "搜索网络上的最新资讯"\n- "把当前网页收藏"\n- "推荐一些前端资源"\n- "把所有AI相关书签收集到文件夹"',
        };
    }
  }

  /**
   * 处理搜索意图
   */
  private async handleSearch(intent: UserIntent): Promise<AIResponse> {
    const { keywords, query } = intent.entities;
    const store = useBookmarkStore.getState();

    // 检测是否搜索特定文件类型
    const lowerQuery = (query || '').toLowerCase();
    const fileTypePattern = this.detectFileType(lowerQuery);

    const results = store.bookmarks.filter(bookmark => {
      const searchText = `${bookmark.title} ${bookmark.aiSummary || ''} ${bookmark.aiTags.join(' ')} ${bookmark.userTags.join(' ')} ${bookmark.aiCategory || ''}`.toLowerCase();
      const urlLower = bookmark.url.toLowerCase();

      // 基础搜索匹配
      const keywordMatch = (keywords || []).some(kw => {
        const kwLower = kw.toLowerCase();
        return searchText.includes(kwLower) ||
               urlLower.includes(kwLower) ||
               bookmark.title.toLowerCase().includes(kwLower);
      });

      // 文件类型匹配
      const fileTypeMatch = fileTypePattern ? this.matchFileType(urlLower, fileTypePattern) : true;

      return keywordMatch && fileTypeMatch;
    });

    if (results.length === 0) {
      return {
        message: `😔 没有找到相关的书签。\n\n试试其他关键词？`,
        data: { results: [] },
      };
    }

    const topResults = results.slice(0, 5);
    const message = `✅ 为您找到 ${results.length} 个相关书签：\n\n${topResults
      .map((b, i) => `${i + 1}. ${b.title}\n   ${b.url}\n   ${b.aiCategory ? `📂 ${b.aiCategory}` : ''}`)
      .join('\n\n')}${results.length > 5 ? `\n\n...还有 ${results.length - 5} 个结果` : ''}`;

    return {
      message,
      action: 'search',
      data: { results: topResults },
      suggestions: topResults.length > 0 ? ['打开第一个', '查看全部'] : [],
    };
  }

  /**
   * 处理添加书签意图
   */
  private async handleAdd(_intent: UserIntent, _context?: any): Promise<AIResponse> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url) {
        return {
          message: '❌ 无法获取当前页面信息，请重试',
        };
      }

      const store = useBookmarkStore.getState();
      const exists = store.bookmarks.some(b => b.url === tab.url);
      if (exists) {
        return {
          message: `ℹ️ 这个页面已经在书签库中了\n\n${tab.title}`,
          suggestions: ['打开书签列表', '编辑这个书签'],
        };
      }

      chrome.runtime.sendMessage({
        type: 'SAVE_BOOKMARK',
        data: {
          url: tab.url,
          title: tab.title || 'Untitled',
        },
      });

      return {
        message: `✅ 已收藏《${tab.title}》\n\n正在进行 AI 分析和分类...`,
        action: 'add',
        suggestions: ['查看书签', '继续浏览'],
      };
    } catch (error) {
      console.error('[AIAgent] Add bookmark error:', error);
      return {
        message: '❌ 添加书签失败，请重试',
      };
    }
  }

  /**
   * 处理打开书签意图
   */
  private async handleOpen(intent: UserIntent): Promise<AIResponse> {
    const { query } = intent.entities;
    const store = useBookmarkStore.getState();

    const results = store.bookmarks.filter(bookmark => {
      const searchText = `${bookmark.title} ${bookmark.aiSummary || ''} ${bookmark.aiTags.join(' ')} ${bookmark.userTags.join(' ')} ${bookmark.aiCategory || ''}`.toLowerCase();
      return searchText.includes(query?.toLowerCase() || '');
    });

    if (results.length === 0) {
      return {
        message: '😔 没有找到匹配的书签',
        suggestions: ['搜索书签', '查看全部书签'],
      };
    }

    const bookmark = results[0];
    chrome.tabs.create({ url: bookmark.url });

    return {
      message: `✅ 正在打开《${bookmark.title}》`,
      action: 'open',
      data: { bookmark },
    };
  }

  /**
   * 处理推荐意图
   */
  private async handleRecommend(intent: UserIntent): Promise<AIResponse> {
    const { query } = intent.entities;
    const store = useBookmarkStore.getState();

    const keywords = query?.toLowerCase().split(/\s+/) || [];
    const recommendations = store.bookmarks
      .filter(bookmark => {
        const searchText = `${bookmark.title} ${bookmark.aiSummary || ''} ${bookmark.aiCategory || ''} ${bookmark.aiTags.join(' ')} ${bookmark.userTags.join(' ')}`.toLowerCase();
        const keywordsLower = keywords.map(kw => kw.toLowerCase());

        return keywordsLower.some(kw => {
          if (searchText.includes(kw)) return true;
          if (kw.includes(searchText)) return true;
          if (bookmark.title.toLowerCase().includes(kw)) return true;
          if (searchText && searchText.includes(kw)) return true;
          return false;
        });
      })
      .slice(0, 5);

    if (recommendations.length === 0) {
      return {
        message: '😔 暂时没有相关的推荐\n\n试试添加更多书签，我会有更好的推荐哦',
      };
    }

    const message = `🌟 根据「${query}」为您推荐：\n\n${recommendations
      .map((b, i) => `${i + 1}. ${b.title}\n   ${b.aiCategory ? `📂 ${b.aiCategory}` : ''}`)
      .join('\n\n')}`;

    return {
      message,
      action: 'recommend',
      data: { recommendations },
    };
  }

  /**
   * 处理网页搜索意图
   */
  private async handleWebSearch(intent: UserIntent): Promise<AIResponse> {
    const { query } = intent.entities;
    const searchQuery = query || intent.entities.keywords?.join(' ') || '';

    if (!searchQuery) {
      return {
        message: '❌ 请提供要搜索的关键词',
        suggestions: ['输入搜索内容', '使用书签搜索'],
      };
    }

    try {
      // 使用用户配置的AI API进行搜索增强
      const searchPrompt = `请为以下查询提供最佳的网络搜索建议：
查询：${searchQuery}

请返回JSON格式：
{
  "query": "优化的搜索关键词",
  "engines": ["Google", "Bing"],
  "results": [
    {"title": "搜索结果标题", "url": "网站URL", "summary": "结果摘要"}
  ],
  "suggestions": ["相关搜索建议"]
}`;

      const content = await this.callAI(searchPrompt);

      // 尝试解析AI返回的搜索建议
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      let searchResults: any = null;

      if (jsonMatch) {
        try {
          searchResults = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.warn('Failed to parse search results:', e);
        }
      }

      if (searchResults) {
        const message = `🔍 网络搜索结果：${searchQuery}\n\n${searchResults.results?.map((r: any, i: number) =>
          `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.summary || ''}`
        ).join('\n\n') || '正在为您搜索相关内容...'}

${searchResults.suggestions ? `\n💡 相关搜索：\n${searchResults.suggestions.map((s: string) => `- ${s}`).join('\n')}` : ''}

🌐 建议搜索引擎：${searchResults.engines?.join('、') || 'Google、Bing'}`;

        return {
          message,
          action: 'webSearch',
          data: {
            query: searchResults.query || searchQuery,
            results: searchResults.results || [],
            suggestions: searchResults.suggestions || []
          },
          suggestions: ['打开第一个结果', '使用其他搜索引擎', '保存为书签'],
        };
      } else {
        // 默认返回搜索引擎链接
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}`;
        const duckUrl = `https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}`;

        return {
          message: `🔍 网络搜索：${searchQuery}\n\n🌐 可用搜索引擎：\n\n1. Google\n   ${googleUrl}\n\n2. Bing\n   ${bingUrl}\n\n3. DuckDuckGo\n   ${duckUrl}`,
          action: 'webSearch',
          data: {
            query: searchQuery,
            engines: [
              { name: 'Google', url: googleUrl },
              { name: 'Bing', url: bingUrl },
              { name: 'DuckDuckGo', url: duckUrl }
            ]
          },
          suggestions: ['打开Google', '打开Bing', '使用隐私搜索引擎'],
        };
      }
    } catch (error) {
      console.error('[AIAgent] Web search error:', error);
      return {
        message: '❌ 网络搜索暂时不可用，请稍后重试\n\n或者直接使用搜索引擎：\n- Google: https://www.google.com\n- Bing: https://www.bing.com',
        action: 'webSearch',
        suggestions: ['稍后重试', '使用书签搜索', '手动打开搜索引擎'],
      };
    }
  }

  /**
   * 处理文件系统搜索意图
   */
  private async handleFileSearch(intent: UserIntent): Promise<AIResponse> {
    const { query } = intent.entities;
    const fileQuery = query || intent.entities.keywords?.join(' ') || '';

    if (!fileQuery) {
      return {
        message: '❌ 请提供要搜索的文件关键词',
        suggestions: ['输入文件类型', '指定搜索路径'],
      };
    }

    try {
      // 检查是否支持文件系统访问API
      if (!('showDirectoryPicker' in window)) {
        return {
          message: `❌ Chrome扩展限制：无法直接访问本地文件系统\n\n📁 您可以：\n1. 使用系统搜索\n   - Windows: 按 Win + S\n   - macOS: 按 Cmd + Space\n   - Linux: 按 Super + S\n\n2. 手动输入文件路径\n   示例：file:///Users/username/Documents/document.pdf\n\n3. 将文件拖拽到扩展保存链接\n   - 右键拖拽文件 → "在Chrome中打开" → 收藏`,
          action: 'fileSearch',
          suggestions: ['使用系统搜索', '手动输入路径', '书签搜索'],
        };
      }

      // Chrome扩展的文件系统访问限制说明
      return {
        message: `📂 Chrome扩展文件搜索功能\n\n由于浏览器安全限制，Chrome扩展无法直接搜索您的本地文件。但我可以帮您：\n\n🔍 **推荐方案**：\n1. 使用系统搜索（最快）\n   - Windows: Win + S\n   - macOS: Cmd + Space\n   - 搜索："${fileQuery}"\n\n2. 手动搜索特定位置\n   - Documents文件夹\n   - Downloads文件夹\n   - Desktop桌面\n\n3. 使用书签管理\n   - 将常用文件拖拽保存为书签\n   - 支持file://协议\n   - 下次可直接搜索书签\n\n💡 提示：如果找到文件，可以将其拖拽到扩展保存为书签，方便下次快速访问。`,
        action: 'fileSearch',
        data: {
          query: fileQuery,
          supportedActions: ['systemSearch', 'bookmarkFile', 'manualPath']
        },
        suggestions: [
          '打开系统搜索',
          '查看Documents文件夹',
          '查看Downloads文件夹',
          '保存文件路径为书签'
        ],
      };
    } catch (error) {
      console.error('[AIAgent] File search error:', error);
      return {
        message: `❌ 文件搜索功能出错\n\n💡 **解决方案**：\n- 使用系统搜索：Windows (Win + S) / macOS (Cmd + Space)\n- 手动搜索：Documents、Downloads、Desktop文件夹\n- 将文件拖拽保存为书签`,
        action: 'fileSearch',
        suggestions: ['使用系统搜索', '书签搜索', '手动输入路径'],
      };
    }
  }

  /**
   * 处理收集书签到文件夹意图
   */
  private async handleCollect(intent: UserIntent): Promise<AIResponse> {
    const { query } = intent.entities;
    const store = useBookmarkStore.getState();

    if (!query) {
      return {
        message: '❌ 请提供要收集的主题或关键词',
        suggestions: ['输入收集主题', '指定关键词'],
      };
    }

    try {
      // 从查询中提取关键词
      const keywords = query.toLowerCase().split(/\s+/).filter(kw => kw.length > 1);

      // 匹配相关书签
      const matchedBookmarks = store.bookmarks.filter(bookmark => {
        const searchText = `${bookmark.title} ${bookmark.aiSummary || ''} ${bookmark.aiTags.join(' ')} ${bookmark.userTags.join(' ')} ${bookmark.aiCategory || ''}`.toLowerCase();
        return keywords.some(kw => searchText.includes(kw));
      });

      if (matchedBookmarks.length === 0) {
        return {
          message: `😔 没有找到与「${query}」相关的书签\n\n建议：\n- 检查关键词是否正确\n- 先添加一些相关书签`,
          suggestions: ['添加相关书签', '使用其他关键词', '查看所有书签'],
        };
      }

      // 生成文件夹名称
      const folderName = this.generateFolderName(query, matchedBookmarks);

      // 检查文件夹是否已存在
      const existingFolder = store.folders.find(f => f.name === folderName);
      let folderId = existingFolder?.id;

      if (!folderId) {
        // 创建新文件夹
        const newFolder = {
          id: `folder-${Date.now()}`,
          name: folderName,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          color: this.generateFolderColor(),
          bookmarkCount: matchedBookmarks.length,
        };

        store.addFolder(newFolder);
        folderId = newFolder.id;
      }

      // 移动匹配的书签到文件夹
      let movedCount = 0;
      matchedBookmarks.forEach(bookmark => {
        // 只有当书签不在该文件夹中时才移动
        if (bookmark.folderId !== folderId) {
          store.moveBookmarkToFolder(bookmark.id, folderId);
          movedCount++;
        }
      });

      const message = `✅ 成功收集书签到「${folderName}」文件夹\n\n📊 统计：\n- 找到 ${matchedBookmarks.length} 个相关书签\n- 已移动 ${movedCount} 个书签\n- 文件夹现有 ${store.folders.find(f => f.id === folderId)?.bookmarkCount || 0} 个书签`;

      return {
        message,
        action: 'collect',
        data: {
          folderName,
          folderId,
          collectedCount: movedCount,
          totalMatched: matchedBookmarks.length,
          bookmarks: matchedBookmarks.map(b => ({ id: b.id, title: b.title })),
        },
        suggestions: ['查看文件夹', '重命名文件夹', '继续添加书签'],
      };
    } catch (error) {
      console.error('[AIAgent] Collect error:', error);
      return {
        message: '❌ 收集书签失败，请重试',
        suggestions: ['重新尝试', '检查网络连接'],
      };
    }
  }

  /**
   * 处理智能整理意图
   */
  private async handleOrganize(intent: UserIntent): Promise<AIResponse> {
    const store = useBookmarkStore.getState();

    if (store.bookmarks.length === 0) {
      return {
        message: '📭 暂无书签可整理\n\n建议：\n- 先添加一些书签\n- 让AI分析后再进行整理',
        suggestions: ['添加书签', '导入Chrome书签'],
      };
    }

    try {
      // 按AI分类统计书签
      const categories = new Map<string, number>();
      store.bookmarks.forEach(bookmark => {
        const category = bookmark.aiCategory || '未分类';
        categories.set(category, (categories.get(category) || 0) + 1);
      });

      // 生成整理建议
      const suggestions = Array.from(categories.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      if (suggestions.length === 0) {
        return {
          message: `🤔 暂无可整理的分类\n\n当前状态：\n- 总书签数：${store.bookmarks.length} 个\n- 已分类：${categories.size} 个分类\n\n建议：\n- 先使用AI分析书签\n- 让AI自动生成分类和标签`,
          suggestions: ['使用AI分析', '查看所有书签', '手动创建分类'],
        };
      }

      // 执行自动整理（创建文件夹并移动书签）
      let createdFolders = 0;
      let organizedBookmarks = 0;

      for (const [category, count] of suggestions) {
        if (count >= 3) { // 只为有3个或以上书签的分类创建文件夹
          // 检查文件夹是否已存在
          const existingFolder = store.folders.find(f => f.name === category);

          if (!existingFolder) {
            // 创建文件夹
            const newFolder = {
              id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: category,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              color: this.generateFolderColor(),
              bookmarkCount: 0,
            };

            store.addFolder(newFolder);
            createdFolders++;
          }

          const folderId = existingFolder?.id || store.folders.find(f => f.name === category)?.id;

          // 移动未分类书签到对应文件夹
          store.bookmarks
            .filter(b => (b.aiCategory === category) && b.folderId !== folderId)
            .forEach(bookmark => {
              store.moveBookmarkToFolder(bookmark.id, folderId!);
              organizedBookmarks++;
            });
        }
      }

      const message = `✅ 智能整理完成！\n\n📊 整理统计：\n- 创建文件夹：${createdFolders} 个\n- 整理书签：${organizedBookmarks} 个\n- 发现分类：${suggestions.length} 个\n\n📁 主要分类：\n${suggestions.slice(0, 5).map(([cat, count], i) => `${i + 1}. ${cat} (${count}个)`).join('\n')}`;

      return {
        message,
        action: 'organize',
        data: {
          createdFolders,
          organizedBookmarks,
          totalCategories: suggestions.length,
          categories: suggestions,
        },
        suggestions: ['查看整理结果', '微调分类', '继续添加书签'],
      };
    } catch (error) {
      console.error('[AIAgent] Organize error:', error);
      return {
        message: '❌ 智能整理失败，请重试',
        suggestions: ['重新整理', '手动整理'],
      };
    }
  }

  /**
   * 处理帮助意图
   */
  private async handleHelp(): Promise<AIResponse> {
    try {
      await this.getUserAIConfig(); // 确保配置已加载
      const prompt = `你是一个智能书签助手。用户向你打招呼并询问你能做什么。

请用友好、简洁的方式介绍你的功能，格式如下：

👋 你好！我是智能书签助手

我可以帮你：

📌 搜索书签
"找一个 Python 教程"
"我之前收藏过关于 React 的"

💾 快速收藏
"把当前网页收藏"
"保存这个页面"

🌟 智能推荐
"推荐一些机器学习资源"
"有哪些前端工具"

📁 智能整理
"把所有AI相关书签收集到文件夹"
"智能整理所有书签"

🔗 打开书签
"打开那个 React 文档"

试试和我聊天吧！

请直接返回介绍内容，不要添加JSON或其他格式。`;

      const message = await this.callAI(prompt);
      return {
        message,
        action: 'help',
      };
    } catch (error) {
      // 如果AI调用失败，返回硬编码的默认回复
      console.warn('[AIAgent] Help AI failed, using fallback:', error);
      return {
        message: `👋 你好！我是智能书签助手\n\n我可以帮你：\n\n📌 搜索书签\n"找一个 Python 教程"\n"我之前收藏过关于 React 的"\n\n💾 快速收藏\n"把当前网页收藏"\n"保存这个页面"\n\n🌟 智能推荐\n"推荐一些机器学习资源"\n"有哪些前端工具"\n\n📁 智能整理\n"把所有AI相关书签收集到文件夹"\n"智能整理所有书签"\n\n🔗 打开书签\n"打开那个 React 文档"\n\n试试和我聊天吧！`,
        action: 'help',
      };
    }
  }

  /**
   * 处理普通对话
   */
  private async handleChat(intent: UserIntent): Promise<AIResponse> {
    const { query } = intent.entities;

    // 对于简单的问候和感谢，使用快速回复（避免不必要的API调用）
    const greetings = ['你好', 'hi', 'hello', '嗨', '在吗', '在不在'];
    const thanks = ['谢谢', 'thanks', '感谢', '感恩'];

    if (greetings.some(g => query?.toLowerCase().includes(g.toLowerCase()))) {
      return {
        message: '👋 你好！有什么可以帮你的吗？\n\n试试对我说：\n- "找一个 Python 教程"\n- "把当前网页收藏"\n- "推荐一些前端资源"',
        action: 'chat',
      };
    }

    if (thanks.some(t => query?.toLowerCase().includes(t.toLowerCase()))) {
      return {
        message: '😊 不客气！随时为你服务',
        action: 'chat',
      };
    }

    // 其他对话使用 AI 生成回复
    try {
      await this.getUserAIConfig(); // 确保配置已加载
      const prompt = `你是一个智能书签助手。用户对你说："${query}"。

请用友好、有帮助的方式回复。你可以：
1. 理解用户的意图
2. 引导用户使用书签管理功能
3. 提供有用的建议

请直接回复，不需要添加JSON格式。`;

      const message = await this.callAI(prompt);
      return {
        message,
        action: 'chat',
      };
    } catch (error) {
      // 如果AI调用失败，返回降级回复
      console.warn('[AIAgent] Chat AI failed, using fallback:', error);
      return {
        message: `🤔 我理解你的意思，但我还在学习中...\n\n你可以试试问我：\n- "找一个 Python 教程"\n- "把当前网页收藏"\n- "推荐一些前端资源"\n- "把所有AI相关书签收集到文件夹"`,
        action: 'chat',
      };
    }
  }

  /**
   * 检测查询中的文件类型
   */
  private detectFileType(query: string): string | null {
    const fileTypes = {
      'pdf': ['pdf', 'Adobe', 'Acrobat', '文档'],
      'doc': ['doc', 'docx', 'Word', '文档'],
      'excel': ['xls', 'xlsx', 'Excel', '表格'],
      'ppt': ['ppt', 'pptx', 'PowerPoint', '演示'],
      'image': ['jpg', 'jpeg', 'png', 'gif', '图片', '图片文件'],
      'video': ['mp4', 'avi', 'mov', '视频', '录像'],
      'audio': ['mp3', 'wav', '音频', '音乐', '歌曲'],
      'code': ['js', 'ts', 'py', 'java', 'cpp', '代码', '源码'],
      'zip': ['zip', 'rar', '压缩', '压缩包'],
      'txt': ['txt', '文本', '笔记', '日志']
    };

    for (const [type, keywords] of Object.entries(fileTypes)) {
      if (keywords.some(keyword => query.includes(keyword))) {
        return type;
      }
    }
    return null;
  }

  /**
   * 匹配书签URL中的文件类型
   */
  private matchFileType(url: string, fileType: string): boolean {
    const typePatterns = {
      'pdf': /\.pdf(\?|$)/i,
      'doc': /\.(doc|docx)(\?|$)/i,
      'excel': /\.(xls|xlsx)(\?|$)/i,
      'ppt': /\.(ppt|pptx)(\?|$)/i,
      'image': /\.(jpg|jpeg|png|gif|svg|webp)(\?|$)/i,
      'video': /\.(mp4|avi|mov|mkv|webm)(\?|$)/i,
      'audio': /\.(mp3|wav|m4a|flac)(\?|$)/i,
      'code': /\.(js|ts|py|java|cpp|c|cs|php|rb|go|rs)(\?|$)/i,
      'zip': /\.(zip|rar|7z|tar|gz)(\?|$)/i,
      'txt': /\.(txt|md|log)(\?|$)/i
    };

    return typePatterns[fileType as keyof typeof typePatterns]?.test(url) || false;
  }

  /**
   * 生成文件夹名称
   */
  private generateFolderName(query: string, bookmarks: any[]): string {
    // 提取查询中的主要关键词
    const keywords = query.toLowerCase().split(/\s+/).filter(kw => kw.length > 1);

    // 如果有AI分类，使用分类名
    const aiCategories = bookmarks.map(b => b.aiCategory).filter(cat => cat && cat !== '未分类');
    if (aiCategories.length > 0) {
      // 返回出现最频繁的分类
      const categoryCount = new Map<string, number>();
      aiCategories.forEach(cat => {
        categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
      });
      const mostCommon = Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0];
      if (mostCommon && mostCommon[1] >= 2) {
        return mostCommon[0];
      }
    }

    // 否则使用用户输入作为文件夹名
    return query.length > 20 ? `${query.substring(0, 20)}...` : query;
  }

  /**
   * 生成文件夹颜色
   */
  private generateFolderColor(): string {
    const colors = [
      '#0ea5e9', // sky blue
      '#10b981', // emerald
      '#f59e0b', // amber
      '#ef4444', // red
      '#8b5cf6', // violet
      '#ec4899', // pink
      '#14b8a6', // teal
      '#6366f1', // indigo
      '#f97316', // orange
      '#06b6d4', // cyan
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

// 导出单例
export const aiAgent = new BookmarkAIAgent();