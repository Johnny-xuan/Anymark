/**
 * AI 聊天面板组件 - ChatGPT 风格布局
 * 左侧可折叠历史列表 + 右侧聊天区域
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, X, Plus, RefreshCw, RotateCcw, PanelLeftClose, PanelLeft, Trash2, MessageSquare, Search, Terminal, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../../i18n/config';
// ProgressInfo type removed - using thinkingEntries for progress display
import SlashToolsMenu, { SLASH_TOOLS, type SlashTool } from '../SlashToolsMenu/SlashToolsMenu';
import PixelBuddyIcon from '../PixelBuddyIcon/PixelBuddyIcon';
import { chatArchiveManager, type ChatSession, type Message as ChatMessage } from '../../../utils/chatArchiveManager';
import { getCheckpointService, type Checkpoint } from '../../../services/checkpointService';
import MessageBubble from '../MessageBubble/MessageBubble';
import { Thinking, type ThinkingEntry } from '../Thinking';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { Agent } from '../../../agent-v3';
import '../Accessibility/Accessibility.css';
import './AIChatPanel.css';

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIChatPanel: React.FC<AIChatPanelProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestHistory, setRequestHistory] = useState<string[]>([]);
  // 斜杠命令菜单状态
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingEntries, setThinkingEntries] = useState<ThinkingEntry[]>([]);
  const [isAgentActive, setIsAgentActive] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Map<number, Checkpoint>>(new Map());
  const [isReverting, setIsReverting] = useState(false);
  
  // 历史面板状态
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [archives, setArchives] = useState<ChatSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 输入模式：agent（自然语言）/ terminal（命令）
  const [inputMode, setInputMode] = useState<'agent' | 'terminal'>('agent');
  // Terminal 当前路径
  const [terminalPath, setTerminalPath] = useState<string>('/');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Ref 用于在 agent.process() 完成后读取最终数据保存到消息对象
  const thinkingEntriesRef = useRef<ThinkingEntry[]>([]);
  const streamingContentRef = useRef('');
  const streamingFlushTimerRef = useRef<number | null>(null);

  // Agent 实例（使用 useMemo 保持单例）
  const agent = useMemo(() => {
    return new Agent();
  }, []);

  // 加载历史记录
  const loadArchives = async () => {
    try {
      const archiveList = await chatArchiveManager.getArchives();
      setArchives(archiveList);
    } catch (error) {
      console.error('[AIChatPanel] Failed to load archives:', error);
    }
  };

  // 初始化时加载历史
  useEffect(() => {
    if (isOpen) {
      loadArchives();
    }
  }, [isOpen]);

  // 自动滚动到底部（消息、streaming、thinking、agent状态 变化时均触发）
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, thinkingEntries, isAgentActive]);

  // 同步 sessionIdRef
  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // 实时保存消息
  useEffect(() => {
    if (messages.length > 0 && agent) {
      const autoSave = async () => {
        try {
          const sessionId = sessionIdRef.current;
          const cwd = agent.getCwd();
          const session = await chatArchiveManager.archiveSession(
            messages, 
            sessionId || undefined,
            { path: cwd.path, folderId: cwd.folderId }
          );
          if (!sessionId && session.id) {
            setCurrentSessionId(session.id);
            sessionIdRef.current = session.id;
          }
          // 刷新历史列表
          loadArchives();
        } catch (error) {
          console.error('[AIChatPanel] Auto-save failed:', error);
        }
      };
      const timer = setTimeout(autoSave, 2000);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // 窗口关闭时自动存档
  useEffect(() => {
    if (!isOpen && messages.length > 0 && agent) {
      const saveOnClose = async () => {
        try {
          const sessionId = sessionIdRef.current;
          const cwd = agent.getCwd();
          const session = await chatArchiveManager.archiveSession(
            messages, 
            sessionId || undefined,
            { path: cwd.path, folderId: cwd.folderId }
          );
          if (!sessionId && session.id) {
            setCurrentSessionId(session.id);
            sessionIdRef.current = session.id;
          }
        } catch (error) {
          console.error('[AIChatPanel] Failed to archive on close:', error);
        }
      };
      saveOnClose();
    }
  }, [isOpen, messages]);

  // 快捷操作（欢迎页示例按钮）
  const handleQuickAction = (action: string) => {
    if (isProcessing || isLoading) return;
    setInput(action);
    inputRef.current?.focus();
  };

  // 斜杠命令选择
  const handleSlashSelect = (tool: SlashTool) => {
    setSlashMenuOpen(false);
    if (tool.fillText) {
      // 需要用户补充输入的命令，填入输入框
      setInput(tool.fillText);
      inputRef.current?.focus();
    } else {
      // 直接执行的命令（去掉开头的 /）
      setInput(tool.command.slice(1));
      // 延迟触发发送，让 state 更新完成
      setTimeout(() => {
        const form = inputRef.current?.closest('.ai-chat-input');
        const sendBtn = form?.querySelector('.send-btn') as HTMLButtonElement | null;
        sendBtn?.click();
      }, 50);
    }
  };

  // 新建对话
  const handleNewChat = async () => {
    if (messages.length > 0 && agent) {
      const sessionId = sessionIdRef.current;
      const cwd = agent.getCwd();
      await chatArchiveManager.archiveSession(
        messages, 
        sessionId || undefined,
        { path: cwd.path, folderId: cwd.folderId }
      );
      await loadArchives();
    }
    setMessages([]);
    setInput('');
    setCurrentSessionId(null);
    sessionIdRef.current = null;
    setCheckpoints(new Map());
    setTerminalPath('/');
    // 重置 Agent 状态
    if (agent) {
      agent.clearHistory();
      agent.loadState({ cwd: { path: '/', folderId: null } });
    }
    inputRef.current?.focus();
  };

  // 恢复存档
  const handleRestoreArchive = (session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    sessionIdRef.current = session.id;
    setCheckpoints(new Map());
    
    // 恢复 Agent 状态（历史 + 工作目录）
    if (agent) {
      agent.loadState({
        messages: session.messages,
        cwd: {
          path: session.cwdPath || '/',
          folderId: session.cwdFolderId ?? null,
        },
      });
    }
    
    // 更新 UI 路径显示
    setTerminalPath(session.cwdPath || '/');
  };

  // 删除存档
  const handleDeleteArchive = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t('chatArchive.deleteConfirm', '确定删除这个对话吗？'))) {
      await chatArchiveManager.deleteArchive(sessionId);
      // 如果删除的是当前对话，清空
      if (sessionId === currentSessionId) {
        setMessages([]);
        setCurrentSessionId(null);
        sessionIdRef.current = null;
      }
      await loadArchives();
    }
  };

  // 清空对话
  const handleClearChat = () => {
    if (window.confirm(t('sidebar.aiChat.confirm.clearChat'))) {
      setMessages([]);
      setInput('');
      setCurrentSessionId(null);
      sessionIdRef.current = null;
      setCheckpoints(new Map());
      inputRef.current?.focus();
    }
  };

  // 输入变化处理（斜杠菜单检测）
  const handleInputChange = (value: string) => {
    setInput(value);
    // 检测斜杠命令
    if (value.startsWith('/')) {
      setSlashMenuOpen(true);
      setSlashFilter(value);
      setSlashSelectedIndex(0);
    } else {
      setSlashMenuOpen(false);
    }
  };

  // 过滤后的斜杠命令（供键盘导航使用）
  const filteredSlashTools = SLASH_TOOLS.filter(tool => {
    if (!slashFilter || slashFilter === '/') return true;
    const searchTerm = slashFilter.toLowerCase().replace('/', '');
    return (
      tool.command.toLowerCase().includes(searchTerm) ||
      tool.label.toLowerCase().includes(searchTerm)
    );
  });

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 检查是否在输入法组合状态（如拼音输入中）
    const isComposing = e.nativeEvent.isComposing || (e.nativeEvent as any).keyCode === 229;

    // 斜杠菜单打开时拦截键盘事件
    if (slashMenuOpen && filteredSlashTools.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex(prev => (prev - 1 + filteredSlashTools.length) % filteredSlashTools.length);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex(prev => (prev + 1) % filteredSlashTools.length);
        return;
      }
      if (e.key === 'Enter' && !isComposing) {
        e.preventDefault();
        handleSlashSelect(filteredSlashTools[slashSelectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }

    // 发送消息
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
    // 上箭头 - 历史输入（仅在输入为空时）
    else if (e.key === 'ArrowUp' && !input) {
      e.preventDefault();
      if (requestHistory.length > 0) {
        const previousQuery = requestHistory[requestHistory.length - 1];
        setInput(previousQuery);
      }
    }
  };

  // 撤回到检查点
  const handleRevert = async (messageIndex: number) => {
    const checkpoint = checkpoints.get(messageIndex);
    if (!checkpoint) return;

    if (!window.confirm(t('aiChat.revertConfirm', '确定要撤回到「{{message}}...」之前的状态吗？', { message: checkpoint.userMessage.slice(0, 20) }))) {
      return;
    }

    setIsReverting(true);
    try {
      const checkpointService = getCheckpointService();
      const result = await checkpointService.revertToCheckpoint(checkpoint.id);
      
      if (result.success) {
        setMessages(prev => prev.slice(0, messageIndex));
        setCheckpoints(prev => {
          const newMap = new Map(prev);
          for (const key of newMap.keys()) {
            if (key >= messageIndex) newMap.delete(key);
          }
          return newMap;
        });
      }
    } catch (error) {
      console.error('[AIChatPanel] 撤回失败:', error);
    } finally {
      setIsReverting(false);
    }
  };

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || isLoading || isProcessing) return;

    const messageContent = input;
    
    // Terminal 模式：直接执行命令
    if (inputMode === 'terminal') {
      // 清除可能残留的 Agent 状态
      setThinkingEntries([]);
      setIsAgentActive(false);
      setStreamingContent('');
      
      const userMessage: ChatMessage = {
        role: 'user',
        content: `$ ${input}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      try {
        const result = await agent.process(messageContent);
        
        // 更新当前路径
        const cwd = agent.getCwd();
        setTerminalPath(cwd.path);
        
        // 处理 clear 命令
        if (result === '__CLEAR__') {
          setMessages([]);
          setIsLoading(false);
          return;
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: `\`\`\`\n${result}\n\`\`\``,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, assistantMessage]);
      } catch (error) {
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: `❌ Error: ${(error as Error).message}`,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Agent 模式：使用 AI
    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    const userQuery = input.trim();
    if (!requestHistory.includes(userQuery)) {
      setRequestHistory(prev => [...prev.slice(-9), userQuery]);
    }

    const currentMessageIndex = messages.length;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSlashMenuOpen(false);
    setIsLoading(true);
    setIsProcessing(true);
    setStreamingContent('');

    // 重置思考/流式状态
    setIsAgentActive(true);
    setThinkingEntries([]);
    thinkingEntriesRef.current = [];
    streamingContentRef.current = '';
    if (streamingFlushTimerRef.current !== null) {
      window.clearTimeout(streamingFlushTimerRef.current);
      streamingFlushTimerRef.current = null;
    }

    // 检查点创建不阻塞 UI，避免发送后长时间无反馈
    void (async () => {
      try {
        const checkpointService = getCheckpointService();
        const checkpoint = await checkpointService.createCheckpoint(userQuery);
        setCheckpoints(prev => new Map(prev).set(currentMessageIndex, checkpoint));
      } catch (error) {
        console.warn('[AIChatPanel] 创建检查点失败:', error);
      }
    })();

    try {
      // 使用 Agent V3
      if (agent) {
        // 设置回调
        agent.setCallbacks({
          onStep: (step) => {
            // answer 类型不进入思考过程，它通过 onToken 流式输出到消息气泡
            if (step.type === 'answer') return;

            let entryType: 'thought' | 'action' | 'observation' | 'reflection' | 'answer' = 'thought';
            let success = true;

            if (step.type === 'action') entryType = 'action';
            else if (step.type === 'observation') {
              entryType = 'observation';
              success = step.toolResult?.success ?? true;
            }

            const newEntry: ThinkingEntry = {
              type: entryType,
              content: step.content,
              timestamp: step.timestamp,
              success,
            };

            // 直接更新 state + ref（不使用 RAF，避免 Chrome 扩展侧边栏中 RAF 不可靠的问题）
            thinkingEntriesRef.current = [...thinkingEntriesRef.current, newEntry];
            setThinkingEntries(prev => [...prev, newEntry]);
          },
          onToken: (token) => {
            streamingContentRef.current += token;
            if (streamingFlushTimerRef.current === null) {
              streamingFlushTimerRef.current = window.setTimeout(() => {
                setStreamingContent(streamingContentRef.current);
                streamingFlushTimerRef.current = null;
              }, 33);
            }
          },
          onStreamingReset: () => {
            // FC 循环发现当前流是中间迭代（有 tool_calls），清空已流出的中间文本
            if (streamingFlushTimerRef.current !== null) {
              window.clearTimeout(streamingFlushTimerRef.current);
              streamingFlushTimerRef.current = null;
            }
            streamingContentRef.current = '';
            setStreamingContent('');
          },
          onPathChange: (path, _folderId) => {
            setTerminalPath(path);
          },
          onError: (error) => {
            console.error('[AIChatPanel] Agent error:', error);
          },
        });
        const response = await agent.process(messageContent);

        // 从 ref 读取思考过程（同步值）保存到消息对象
        const currentThinking = thinkingEntriesRef.current.length > 0
          ? [...thinkingEntriesRef.current]
          : undefined;

        // 优先使用流式内容（完整回答），因为 agent.process() 可能仅返回最后的 complete 简短总结
        const streamedText = streamingContentRef.current.trim();
        const finalContent = streamedText.length > response.length ? streamedText : response;

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: finalContent,
          timestamp: Date.now(),
          thinkingEntries: currentThinking,
        }]);

        // 更新路径
        const cwd = agent.getCwd();
        setTerminalPath(cwd.path);
      }
    } catch (error) {
      console.error('[AIChatPanel] AI request failed:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('sidebar.aiChat.messages.error'),
        timestamp: Date.now(),
      }]);
    } finally {
      if (streamingFlushTimerRef.current !== null) {
        window.clearTimeout(streamingFlushTimerRef.current);
        streamingFlushTimerRef.current = null;
      }
      setIsLoading(false);
      setIsProcessing(false);
      setStreamingContent('');
      streamingContentRef.current = '';
      setIsAgentActive(false);
      // 思考数据已保存到消息对象中，清空活跃状态避免重复显示
      setThinkingEntries([]);
      thinkingEntriesRef.current = [];

      const cwd = agent.getCwd();
      setTerminalPath(cwd.path);
    }
  };

  // 过滤历史记录
  const filteredArchives = archives.filter(session => 
    !searchQuery || session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 格式化日期
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return t('chatArchive.yesterday');
    if (days < 7) return t('chatArchive.daysAgo', { count: days });
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <ErrorBoundary>
      <div
        className="ai-chat-panel chatgpt-layout"
        role="region"
        aria-label={t('sidebar.aiChat.ariaLabel', 'AI 聊天面板')}
      >
        {/* 屏幕阅读器公告区域 */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          aria-label={isProcessing ? t('sidebar.aiChat.processing', 'AI 正在处理中') : ''}
        >
          {isProcessing ? t('sidebar.aiChat.processing', 'AI 正在处理中') : ''}
        </div>

        {/* 左侧历史面板 - 折叠时完全不渲染 */}
        {!historyCollapsed && (
          <aside
            className="chat-history-sidebar"
            aria-label={t('sidebar.aiChat.historyLabel', '对话历史')}
          >
            {/* 历史面板头部 */}
            <div className="history-header">
              <button className="new-chat-btn" onClick={handleNewChat}>
                <Plus size={16} />
                <span>{t('sidebar.aiChat.newChat', '新对话')}</span>
              </button>
              <button 
                className="collapse-btn"
                onClick={() => setHistoryCollapsed(true)}
                title={t('sidebar.aiChat.collapseHistory', '收起')}
              >
                <PanelLeftClose size={18} />
              </button>
            </div>

            {/* 搜索框 */}
            <div className="history-search">
              <Search size={14} />
              <input
                type="text"
                placeholder={t('sidebar.aiChat.searchHistory', '搜索对话...')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* 历史列表 */}
            <div className="history-list">
              {filteredArchives.length === 0 ? (
                <div className="history-empty">
                  <MessageSquare size={24} />
                  <span>{t('sidebar.aiChat.noHistory', '暂无对话记录')}</span>
                </div>
              ) : (
                filteredArchives.map(session => (
                  <div
                    key={session.id}
                    className={`history-item ${session.id === currentSessionId ? 'active' : ''}`}
                    onClick={() => handleRestoreArchive(session)}
                  >
                    <div className="history-item-content">
                      <span className="history-item-title">{session.title}</span>
                      <span className="history-item-date">{formatDate(session.updatedAt)}</span>
                    </div>
                    <button
                      className="history-item-delete"
                      onClick={e => handleDeleteArchive(session.id, e)}
                      title={t('chatArchive.delete', '删除')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {/* 右侧聊天区域 */}
        <main className="chat-main" aria-label={t('sidebar.aiChat.chatLabel', '聊天区域')}>
          {/* 聊天头部 */}
          <header className="ai-chat-header">
            <div className="ai-chat-title">
              {historyCollapsed && (
                <button 
                  className="expand-history-btn"
                  onClick={() => setHistoryCollapsed(false)}
                  title={t('sidebar.aiChat.expandHistory', '展开历史')}
                >
                  <PanelLeft size={18} />
                </button>
              )}
              <PixelBuddyIcon size={20} />
              <h3>{t('sidebar.aiChat.title')}</h3>
            </div>
            <div className="ai-chat-header-actions">
              <button 
                className="ai-chat-action-btn" 
                onClick={handleNewChat}
                title={t('sidebar.aiChat.newChat')}
              >
                <Plus size={16} />
              </button>
              {messages.length > 0 && (
                <button 
                  className="ai-chat-action-btn" 
                  onClick={handleClearChat}
                  title={t('sidebar.aiChat.clearChat')}
                >
                  <RefreshCw size={16} />
                </button>
              )}
              <button className="ai-chat-close" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
          </header>

          {/* 消息列表 */}
          <div
            className="ai-chat-messages"
            role="log"
            aria-live="polite"
            aria-atomic="false"
            aria-label={t('sidebar.aiChat.messagesLabel', '对话消息')}
          >
            {messages.length === 0 && (
              <div className="ai-chat-welcome" role="presentation">
                <div className="welcome-icon">
                  <PixelBuddyIcon size={56} animated />
                </div>
                <h4>{t('sidebar.aiChat.welcome.greeting')}</h4>
                <p className="welcome-desc">{t('sidebar.aiChat.welcome.tryAsking')}</p>
                <div className="quick-actions">
                  <button onClick={() => handleQuickAction(t('sidebar.aiChat.welcome.examples.searchBookmarks'))}>
                    {t('sidebar.aiChat.welcome.examples.searchBookmarks')}
                  </button>
                  <button onClick={() => handleQuickAction(t('sidebar.aiChat.welcome.examples.organizeBookmarks'))}>
                    {t('sidebar.aiChat.welcome.examples.organizeBookmarks')}
                  </button>
                  <button onClick={() => handleQuickAction(t('sidebar.aiChat.welcome.examples.browseAll'))}>
                    {t('sidebar.aiChat.welcome.examples.browseAll')}
                  </button>
                  <button onClick={() => handleQuickAction(t('sidebar.aiChat.welcome.examples.cleanupDuplicates'))}>
                    {t('sidebar.aiChat.welcome.examples.cleanupDuplicates')}
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className="message-with-actions">
                {/* 助手消息的思考过程显示在消息上方 */}
                {msg.role === 'assistant' && msg.thinkingEntries && msg.thinkingEntries.length > 0 && (
                  <Thinking entries={msg.thinkingEntries} isActive={false} />
                )}
                <MessageBubble
                  message={msg}
                  onRegenerate={
                    idx === messages.length - 1 && msg.role === 'assistant'
                      ? () => {
                          const lastUserMsg = messages.slice(0, idx).reverse().find(m => m.role === 'user');
                          if (lastUserMsg) {
                            // 截断消息到此助手回复之前，并将用户消息填入输入框
                            setMessages(prev => prev.slice(0, idx));
                            setInput(lastUserMsg.content || '');
                            // 聚焦输入框，让用户手动发送（避免 state 竞态）
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }
                        }
                      : undefined
                  }
                  onFeedback={(type) => console.log(`[AIChatPanel] Feedback: ${type} for message ${idx}`)}
                />
                {msg.role === 'user' && checkpoints.has(idx) && (
                  <button
                    className="revert-btn"
                    onClick={() => handleRevert(idx)}
                    disabled={isReverting || isLoading}
                    title={t('aiChat.revertTitle', '撤回到此消息之前的状态')}
                  >
                    <RotateCcw size={12} />
                    <span>{t('aiChat.revert', '撤回')}</span>
                  </button>
                )}
              </div>
            ))}

            {(thinkingEntries.length > 0 || isAgentActive) && (
              <Thinking
                key={`active-thinking-${messages.length}`}
                entries={thinkingEntries}
                isActive={isAgentActive}
              />
            )}

            {streamingContent && (
              <div className="streaming-wrapper">
                <div className="message-bubble assistant">
                  <div className="message-bubble-content">
                    <div className="message-text streaming-text">{streamingContent}</div>
                  </div>
                </div>
                <span className="cursor-blink">▊</span>
              </div>
            )}

            {isLoading && !streamingContent && thinkingEntries.length === 0 && (
              <div className="agent-waiting" role="status" aria-live="polite">
                <span className="waiting-dot" aria-hidden="true">●</span>
                <span className="waiting-text">{t('sidebar.aiChat.waiting', '思考中')}</span>
                <div className="loading-dots" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入区域（含斜杠菜单） */}
          <div className="input-area-wrapper">
            {/* 斜杠命令菜单 */}
            <SlashToolsMenu
              isOpen={slashMenuOpen}
              filter={slashFilter}
              onSelect={handleSlashSelect}
              onClose={() => setSlashMenuOpen(false)}
              selectedIndex={slashSelectedIndex}
            />

            {/* 输入框 */}
            <div className={`ai-chat-input ${inputMode === 'terminal' ? 'terminal-mode' : ''}`}>
            {/* 模式切换按钮 */}
            <button
              className={`mode-toggle-btn ${inputMode}`}
              onClick={() => setInputMode(prev => prev === 'agent' ? 'terminal' : 'agent')}
              aria-label={inputMode === 'agent'
                ? t('sidebar.aiChat.switchToTerminal', '切换到命令模式')
                : t('sidebar.aiChat.switchToAgent', '切换到对话模式')}
              aria-pressed={inputMode === 'terminal'}
              title={inputMode === 'agent'
                ? t('sidebar.aiChat.switchToTerminal', '切换到命令模式')
                : t('sidebar.aiChat.switchToAgent', '切换到对话模式')}
            >
              {inputMode === 'agent' ? <MessageCircle size={16} /> : <Terminal size={16} />}
            </button>

            <input
              ref={inputRef}
              type="text"
              placeholder={inputMode === 'terminal'
                ? t('aiChat.terminalPlaceholder', '{{path}} $ 输入命令... (help 查看帮助)', { path: terminalPath })
                : t('sidebar.aiChat.input.placeholder')}
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              id="ai-chat-input"
              name="aiChatInput"
              aria-label={inputMode === 'terminal'
                ? t('aiChat.terminalInputAriaLabel', '命令输入')
                : t('aiChat.chatInputAriaLabel', '消息输入')}
              aria-describedby="ai-chat-hint"
              aria-invalid={false}
              aria-autocomplete="list"
              autoCapitalize="off"
              autoComplete="off"
            />
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={!input.trim() || isLoading || isProcessing}
              aria-label={t('aiChat.sendButtonLabel', '发送消息')}
              title={t('aiChat.sendButtonTitle', '发送 (Enter)')}
            >
              <Send size={16} aria-hidden="true" />
            </button>
            </div>
          </div>

          {/* 显示当前路径（两种模式都显示） */}
          <div className="terminal-path-bar" role="status" aria-live="off">
            <span className="path-label" aria-hidden="true">📂</span>
            <span className="path-value" aria-label={t('aiChat.currentPathLabel', '当前路径')}>{terminalPath}</span>
            <span className="path-hint">
              {inputMode === 'terminal' 
                ? t('sidebar.aiChat.terminalHint')
                : t('sidebar.aiChat.chatHint')}
            </span>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default AIChatPanel;
