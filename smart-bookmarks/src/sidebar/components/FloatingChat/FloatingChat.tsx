/**
 * 浮动 AI 助手聊天窗口
 * 支持流式响应和进度显示
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send, RefreshCw, Archive, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Agent } from '../../../agent-v3';
import { useBookmarkStore } from '../../store/bookmarkStore';
import SaveConfirmDialog from '../SaveConfirmDialog/SaveConfirmDialog';
import { QuickActionBar, type QuickAction } from '../QuickActionBar';
import { ChatArchive } from '../ChatArchive';
import PixelBuddyIcon from '../PixelBuddyIcon/PixelBuddyIcon';
import { chatArchiveManager, type ChatSession, type Message } from '../../../utils/chatArchiveManager';
import MessageBubble from '../MessageBubble/MessageBubble';
import { SlashToolsMenu, SLASH_TOOLS, type SlashTool } from '../SlashToolsMenu';
import { Thinking, type ThinkingEntry } from '../Thinking';
import './FloatingChat.css';

const FloatingChat: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [analysisData, setAnalysisData] = useState<Record<string, unknown> | null>(null);
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingEntries, setThinkingEntries] = useState<ThinkingEntry[]>([]);
  const [isAgentActive, setIsAgentActive] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const thinkingEntriesRef = useRef<ThinkingEntry[]>([]);

  // 获取书签 Store
  const { bookmarks, folders } = useBookmarkStore();

  // Agent 实例
  const agent = useMemo(() => new Agent(), []);

  // 同步 sessionIdRef
  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // 从 localStorage 加载历史记录
  useEffect(() => {
    const loadHistory = () => {
      try {
        const saved = localStorage.getItem('floatingChatHistory');
        if (saved) {
          const history = JSON.parse(saved);
          setMessages(history.slice(-50));
        }
      } catch (error) {
        console.error('[FloatingChat] Failed to load history:', error);
      }
    };
    loadHistory();
  }, []);

  // 保存历史记录到 localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        const toSave = messages.slice(-50);
        localStorage.setItem('floatingChatHistory', JSON.stringify(toSave));
        
        const autoSave = async () => {
          try {
            const sessionId = sessionIdRef.current;
            const session = await chatArchiveManager.archiveSession(toSave, sessionId || undefined);
            if (!sessionId && session.id) {
              setCurrentSessionId(session.id);
              sessionIdRef.current = session.id;
            }
          } catch (error) {
            console.error('[FloatingChat] Auto-save failed:', error);
          }
        };
        
        const timer = setTimeout(autoSave, 2000);
        return () => clearTimeout(timer);
      } catch (error) {
        console.error('[FloatingChat] Failed to save history:', error);
      }
    }
  }, [messages]);

  // 打开窗口时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 全局快捷键 Alt+A
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'a') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 窗口关闭时自动存档
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const saveOnClose = async () => {
        try {
          const sessionId = sessionIdRef.current;
          const session = await chatArchiveManager.archiveSession(messages, sessionId || undefined);
          if (!sessionId && session.id) {
            setCurrentSessionId(session.id);
            sessionIdRef.current = session.id;
          }
        } catch (error) {
          console.error('[FloatingChat] Failed to archive on close:', error);
        }
      };
      saveOnClose();
    }
  }, [isOpen, messages]);

  // 监听 AI 分析完成消息
  useEffect(() => {
    const handleMessage = (message: { type: string; data: Record<string, unknown> }) => {
      if (message.type === 'ANALYZE_COMPLETE') {
        setAnalysisData(message.data);
        setShowConfirmDialog(true);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const messageContent = input;
    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSelectedAction(null);
    setIsLoading(true);
    setStreamingContent('');
    setThinkingEntries([]);
    thinkingEntriesRef.current = [];
    setIsAgentActive(true);

    try {
      // 设置回调
      agent.setCallbacks({
        onStep: (step) => {
          let entryType: ThinkingEntry['type'] = 'thought';
          let success = true;

          if (step.type === 'action') {
            entryType = 'action';
          } else if (step.type === 'observation') {
            entryType = 'observation';
            success = step.toolResult?.success ?? true;
          } else if (step.type === 'answer') {
            entryType = 'answer';
          }

          const entry: ThinkingEntry = {
            type: entryType,
            content: step.content,
            timestamp: step.timestamp,
            success,
          };
          setThinkingEntries(prev => [...prev, entry]);
          thinkingEntriesRef.current = [...thinkingEntriesRef.current, entry];
        },
        onToken: (token) => {
          setStreamingContent(prev => prev + token);
        },
        onError: (error) => {
          console.error('[FloatingChat] Agent error:', error);
        },
      });

      const response = await agent.process(messageContent);

      const currentThinking = thinkingEntriesRef.current.length > 0 
        ? [...thinkingEntriesRef.current] 
        : undefined;

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        thinkingEntries: currentThinking,
      }]);

    } catch (error) {
      console.error('[FloatingChat] Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('floatingChat.errorOccurred'),
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
      setStreamingContent('');
      setThinkingEntries([]);
      thinkingEntriesRef.current = [];
      setIsAgentActive(false);
    }
  };

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    
    if (value.startsWith('/')) {
      setShowSlashMenu(true);
      setSlashMenuIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  };

  // 获取过滤后的工具列表
  const getFilteredTools = () => {
    if (!input.startsWith('/')) return SLASH_TOOLS;
    const searchTerm = input.toLowerCase().replace('/', '');
    return SLASH_TOOLS.filter(tool =>
      tool.command.toLowerCase().includes(searchTerm) ||
      tool.label.toLowerCase().includes(searchTerm)
    );
  };

  // 处理 slash 工具选择
  const handleSlashToolSelect = async (tool: SlashTool) => {
    setShowSlashMenu(false);
    
    if (tool.needsInput) {
      setInput(tool.command + ' ');
      inputRef.current?.focus();
    } else {
      setInput('');
      await executeSlashTool(tool, '');
    }
  };

  // 执行 slash 工具
  const executeSlashTool = async (tool: SlashTool, args: string) => {
    const userMessage: Message = {
      role: 'user',
      content: `${tool.command}${args ? ' ' + args : ''}`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setThinkingEntries([]);
    thinkingEntriesRef.current = [];
    setIsAgentActive(true);

    try {
      let prompt = '';
      switch (tool.command) {
        case '/save':
          prompt = t('floatingChat.slashCommands.savePrompt');
          break;
        case '/organize':
          prompt = args ? t('floatingChat.slashCommands.organizeWithArgs', { args }) : t('floatingChat.slashCommands.organizePrompt');
          break;
        case '/cleanup':
          prompt = t('floatingChat.slashCommands.cleanupPrompt');
          break;
        case '/stats':
          prompt = t('floatingChat.slashCommands.statsPrompt');
          break;
        case '/search':
          prompt = t('floatingChat.slashCommands.searchPrompt', { args });
          break;
        case '/github':
          prompt = t('floatingChat.slashCommands.githubPrompt', { args });
          break;
        case '/trending':
          prompt = t('floatingChat.slashCommands.trendingPrompt');
          break;
        case '/help':
          const helpMessage: Message = {
            role: 'assistant',
            content: `## Available Tools

| Command | Description |
|---------|-------------|
| **/save** | Save current page with AI classification |
| **/organize [query]** | Scan and organize bookmarks |
| **/cleanup** | Find duplicates and broken links |
| **/stats** | Bookmark library overview |
| **/search [query]** | Search web resources |
| **/github [query]** | Search GitHub repositories |
| **/trending** | GitHub trending projects |
| **/help** | Show this help |

Type \`/\` to see all available tools.`,
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, helpMessage]);
          setIsLoading(false);
          setIsAgentActive(false);
          return;
        default:
          prompt = input;
      }

      agent.setCallbacks({
        onStep: (step) => {
          let entryType: ThinkingEntry['type'] = 'thought';
          let success = true;

          if (step.type === 'action') entryType = 'action';
          else if (step.type === 'observation') {
            entryType = 'observation';
            success = step.toolResult?.success ?? true;
          }

          const entry: ThinkingEntry = {
            type: entryType,
            content: step.content,
            timestamp: step.timestamp,
            success,
          };
          setThinkingEntries(prev => [...prev, entry]);
          thinkingEntriesRef.current = [...thinkingEntriesRef.current, entry];
        },
        onToken: (token) => setStreamingContent(prev => prev + token),
        onError: (error) => console.error('[SlashTool] Error:', error),
      });

      const response = await agent.process(prompt);

      const currentThinking = thinkingEntriesRef.current.length > 0 
        ? [...thinkingEntriesRef.current] 
        : undefined;

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        thinkingEntries: currentThinking,
      }]);
    } catch (error) {
      console.error('[SlashTool] Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('floatingChat.errorOccurred'),
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
      setStreamingContent('');
      setThinkingEntries([]);
      thinkingEntriesRef.current = [];
      setIsAgentActive(false);
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) {
      const filteredTools = getFilteredTools();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenuIndex(prev => Math.min(prev + 1, filteredTools.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenuIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filteredTools.length > 0) {
        e.preventDefault();
        handleSlashToolSelect(filteredTools[slashMenuIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
      if (e.key === 'Tab' && filteredTools.length > 0) {
        e.preventDefault();
        const tool = filteredTools[slashMenuIndex];
        setInput(tool.command + (tool.needsInput ? ' ' : ''));
        setShowSlashMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      
      if (input.startsWith('/')) {
        const parts = input.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        const tool = SLASH_TOOLS.find(t => t.command === cmd);
        
        if (tool) {
          setShowSlashMenu(false);
          executeSlashTool(tool, args);
          setInput('');
          return;
        }
      }
      
      handleSend();
    }
  };

  // 点击快捷操作
  const handleQuickAction = (action: string) => {
    setInput(action);
    inputRef.current?.focus();
  };

  const ACTION_TO_SLASH: Record<string, string> = {
    search: '/search',
    discover: '/search',
    trending: '/trending',
    organize: '/organize',
    chat: '',
  };

  const handleQuickActionSelect = (action: QuickAction) => {
    const slashCommand = ACTION_TO_SLASH[action.id];
    
    if (slashCommand) {
      const tool = SLASH_TOOLS.find(t => t.command === slashCommand);
      if (tool) {
        if (tool.needsInput) {
          setInput(slashCommand + ' ');
          setSelectedAction(action);
        } else {
          setSelectedAction(null);
          executeSlashTool(tool, '');
        }
      }
    } else {
      if (selectedAction?.id === action.id) {
        setSelectedAction(null);
      } else {
        setSelectedAction(action);
      }
    }
    inputRef.current?.focus();
  };

  const handleClearChat = () => {
    if (window.confirm(t('floatingChat.clearChatConfirm'))) {
      setMessages([]);
      setInput('');
      setCurrentSessionId(null);
      sessionIdRef.current = null;
      localStorage.removeItem('floatingChatHistory');
      inputRef.current?.focus();
    }
  };

  const handleNewChat = async () => {
    if (messages.length > 0) {
      const sessionId = sessionIdRef.current;
      await chatArchiveManager.archiveSession(messages, sessionId || undefined);
    }
    setMessages([]);
    setInput('');
    setCurrentSessionId(null);
    sessionIdRef.current = null;
    localStorage.removeItem('floatingChatHistory');
    agent.clearHistory();
    inputRef.current?.focus();
  };

  const handleRestoreArchive = (session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    sessionIdRef.current = session.id;
    localStorage.setItem('floatingChatHistory', JSON.stringify(session.messages));
    agent.loadHistory(session.messages);
  };

  const handleOpenArchive = () => {
    setShowArchive(true);
  };

  const handleConfirmSave = async (data: Record<string, unknown>) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_BOOKMARK',
        data: {
          url: data.url,
          title: data.title,
          folderPath: data.folderPath,
          aiTags: data.aiTags,
          aiSummary: data.aiSummary,
          aiCategory: data.aiCategory,
          aiConfidence: data.aiConfidence,
          aiDifficulty: data.aiDifficulty,
          aiTechStack: data.aiTechStack,
        },
      });

      if (response?.success) {
        setShowConfirmDialog(false);
        setAnalysisData(null);

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: t('floatingChat.saveSuccess', {
            title: data.title,
            folderPath: data.folderPath,
            tags: (data.aiTags as string[]).join(', ')
          }),
          timestamp: Date.now(),
        }]);
      } else {
        throw new Error(response?.error || 'Save failed');
      }
    } catch (error) {
      console.error('[FloatingChat] Save failed:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('floatingChat.saveFailed'),
        timestamp: Date.now(),
      }]);
    }
  };

  const handleCancelSave = () => {
    setShowConfirmDialog(false);
    setAnalysisData(null);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: t('floatingChat.saveCancelled'),
      timestamp: Date.now(),
    }]);
  };

  return (
    <>
      {/* 浮动按钮 */}
      {!isOpen && (
        <button
          className="floating-chat-button"
          onClick={() => setIsOpen(true)}
          title={t('floatingChat.buttonTitle')}
        >
          <PixelBuddyIcon size={28} animated />
        </button>
      )}

      {/* 聊天窗口 */}
      {isOpen && (
        <div className="floating-chat-window">
          {/* 头部 */}
          <div className="chat-header">
            <div className="chat-title">
              <PixelBuddyIcon size={20} />
              <h3>{t('floatingChat.title')}</h3>
              <span className="bookmark-count">
                {t('sidebar.bookmarkList.item.items', { count: bookmarks.length })} · {t('sidebar.bookmarkList.item.folders', { count: folders.length })}
              </span>
            </div>
            <div className="chat-header-actions">
              <button
                className="chat-action-btn"
                onClick={handleOpenArchive}
                title={t('chatArchive.title')}
              >
                <Archive size={16} />
              </button>
              <button
                className="chat-action-btn"
                onClick={handleNewChat}
                title={t('chat.newChat')}
              >
                <Plus size={16} />
              </button>
              {messages.length > 0 && (
                <button
                  className="chat-action-btn"
                  onClick={handleClearChat}
                  title={t('chat.clear')}
                >
                  <RefreshCw size={16} />
                </button>
              )}
              <button className="chat-close" onClick={() => setIsOpen(false)}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* 消息列表 */}
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-welcome">
                <div className="welcome-icon">
                  <PixelBuddyIcon size={48} animated />
                </div>
                <h4>{t('floatingChat.greeting')}</h4>
                <p className="welcome-desc">{t('floatingChat.welcomeDesc')}</p>
                <div className="welcome-capabilities">
                  <span>📚 {t('floatingChat.capabilities.searchBookmarks')}</span>
                  <span>🌐 {t('floatingChat.capabilities.discoverResources')}</span>
                  <span>🔥 {t('floatingChat.capabilities.trendingProjects')}</span>
                  <span>📂 {t('floatingChat.capabilities.smartOrganize')}</span>
                </div>
                <div className="quick-actions">
                  <button onClick={() => handleQuickAction(t('floatingChat.examples.searchBookmarks'))}>
                    🔍 {t('floatingChat.examples.searchBookmarks')}
                  </button>
                  <button onClick={() => handleQuickAction(t('floatingChat.examples.discoverResources'))}>
                    🌐 {t('floatingChat.examples.discoverResources')}
                  </button>
                  <button onClick={() => handleQuickAction(t('floatingChat.examples.trending'))}>
                    🔥 {t('floatingChat.examples.trending')}
                  </button>
                  <button onClick={() => handleQuickAction(t('floatingChat.examples.organize'))}>
                    📂 {t('floatingChat.examples.organize')}
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className="message-with-actions">
                {msg.role === 'assistant' && msg.thinkingEntries && msg.thinkingEntries.length > 0 && (
                  <Thinking entries={msg.thinkingEntries} isActive={false} />
                )}
                <MessageBubble
                  message={msg}
                  onRegenerate={
                    idx === messages.length - 1 && msg.role === 'assistant'
                      ? () => {
                          const lastUserMsg = messages
                            .slice(0, idx)
                            .reverse()
                            .find(m => m.role === 'user');
                          if (lastUserMsg) {
                            setMessages(prev => prev.slice(0, idx));
                            setInput(lastUserMsg.content || '');
                            setTimeout(() => handleSend(), 100);
                          }
                        }
                      : undefined
                  }
                  onFeedback={(type) => {
                    console.log(`[FloatingChat] Feedback: ${type} for message ${idx}`);
                  }}
                />
              </div>
            ))}

            {(thinkingEntries.length > 0 || isAgentActive) && (
              <Thinking entries={thinkingEntries} isActive={isAgentActive} />
            )}

            {streamingContent && (
              <div className="streaming-wrapper">
                <MessageBubble
                  message={{
                    role: 'assistant',
                    content: streamingContent,
                    timestamp: Date.now(),
                  }}
                />
                <span className="cursor-blink">▊</span>
              </div>
            )}

            {isLoading && !streamingContent && thinkingEntries.length === 0 && (
              <div className="message assistant">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 快捷功能选择器 */}
          <QuickActionBar
            onSelect={handleQuickActionSelect}
            selectedAction={selectedAction}
            disabled={isLoading}
          />

          {/* 输入框 */}
          <div className="chat-input-wrapper">
            <SlashToolsMenu
              isOpen={showSlashMenu}
              filter={input}
              onSelect={handleSlashToolSelect}
              onClose={() => setShowSlashMenu(false)}
              selectedIndex={slashMenuIndex}
            />
            
            <div className="chat-input">
              {selectedAction && (
                <span className="input-tag">{selectedAction.tag}</span>
              )}
              <input
                ref={inputRef}
                type="text"
                placeholder={selectedAction ? `${selectedAction.description}...` : t('floatingChat.placeholder')}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <button
                className="send-button"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
              >
                <Send size={18} />
              </button>
            </div>
          </div>

          {/* 提示 */}
          <div className="chat-hint">
            {t('floatingChat.shortcutHint')}
          </div>
        </div>
      )}

      {/* AI 分析确认对话框 */}
      {showConfirmDialog && analysisData && (
        <SaveConfirmDialog
          isOpen={showConfirmDialog}
          data={analysisData}
          onConfirm={handleConfirmSave}
          onCancel={handleCancelSave}
        />
      )}

      {/* 对话存档面板 */}
      <ChatArchive
        isOpen={showArchive}
        onClose={() => setShowArchive(false)}
        onRestore={handleRestoreArchive}
        onNewChat={handleNewChat}
      />
    </>
  );
};

export default FloatingChat;
