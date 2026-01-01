/**
 * 浮动 AI 助手聊天窗口
 * 支持流式响应和进度显示
 */

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, RefreshCw, Archive, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { bookmarkAgent } from '../../../utils/agent/bookmarkAgent';
import { useBookmarkStore } from '../../store/bookmarkStore';
import SaveConfirmDialog from '../SaveConfirmDialog/SaveConfirmDialog';
import { QuickActionBar, type QuickAction } from '../QuickActionBar';
import { ChatArchive } from '../ChatArchive';
import { PixelBuddyIcon } from '../PixelBuddyIcon';
import { chatArchiveManager, type ChatSession } from '../../../utils/chatArchiveManager';
import MessageBubble from '../MessageBubble/MessageBubble';
import ProgressIndicator from '../ProgressIndicator/ProgressIndicator';
import ThinkingCard from '../ThinkingCard/ThinkingCard';
import type { ProgressInfo, ThinkingStep } from '../../../utils/agent/types';
import './FloatingChat.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  data?: any;  // 附加数据（如搜索结果）
}

const FloatingChat: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [isThinkingComplete, setIsThinkingComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 获取书签 Store，用于动态显示书签数量和状态
  const { bookmarks, folders } = useBookmarkStore();

  // 从 localStorage 加载历史记录
  useEffect(() => {
    const loadHistory = () => {
      try {
        const saved = localStorage.getItem('floatingChatHistory');
        if (saved) {
          const history = JSON.parse(saved);
          // 最多保留 50 条历史记录
          setMessages(history.slice(-50));
        }
      } catch (error) {
        console.error('[FloatingChat] Failed to load history:', error);
      }
    };
    loadHistory();
  }, []);

  // 保存历史记录到 localStorage（实时保存）
  useEffect(() => {
    if (messages.length > 0) {
      try {
        // 只保存最近 50 条
        const toSave = messages.slice(-50);
        localStorage.setItem('floatingChatHistory', JSON.stringify(toSave));
        
        // 同时自动存档到 chatArchiveManager（防止数据丢失）
        const autoSave = async () => {
          try {
            await chatArchiveManager.archiveSession(toSave, currentSessionId || undefined);
          } catch (error) {
            console.error('[FloatingChat] Auto-save failed:', error);
          }
        };
        
        // 延迟保存，避免频繁写入
        const timer = setTimeout(autoSave, 2000);
        return () => clearTimeout(timer);
      } catch (error) {
        console.error('[FloatingChat] Failed to save history:', error);
      }
    }
  }, [messages, currentSessionId]);

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
      // 窗口关闭时，确保对话已存档
      const saveOnClose = async () => {
        try {
          await chatArchiveManager.archiveSession(messages, currentSessionId || undefined);
          console.log('[FloatingChat] Conversation archived on close');
        } catch (error) {
          console.error('[FloatingChat] Failed to archive on close:', error);
        }
      };
      saveOnClose();
    }
  }, [isOpen, messages, currentSessionId]);

  // 监听 AI 分析完成消息
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'ANALYZE_COMPLETE') {
        console.log('[FloatingChat] AI 分析完成:', message.data);
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

    // 不在消息中添加标记，只传递 quickAction 给 agent
    const messageContent = input;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    const currentAction = selectedAction; // 保存当前选择
    setSelectedAction(null); // 发送后清除选择
    setIsLoading(true);
    setStreamingContent('');
    setProgress(null);
    setThinkingSteps([]);
    setIsThinkingComplete(false);

    try {
      // 调用新的 BookmarkAIAgent（带流式回调）
      const response = await bookmarkAgent.chat(messageContent, {
        quickAction: currentAction?.label,
      }, {
        onProgress: (progressInfo) => {
          setProgress(progressInfo);
        },
        onToken: (token) => {
          setStreamingContent(prev => prev + token);
        },
        onThinkingStep: (step) => {
          setThinkingSteps(prev => [...prev, step]);
        },
        onComplete: (agentResponse) => {
          // 流式完成后，添加完整消息
          const assistantMessage: Message = {
            role: 'assistant',
            content: agentResponse.message,
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, assistantMessage]);
          setStreamingContent('');
          setProgress(null);
          setIsThinkingComplete(true);
        },
        onError: (error) => {
          console.error('[FloatingChat] Stream error:', error);
        },
      });
      console.log('[FloatingChat] Response:', response);

      // 如果没有使用流式（fallback），直接添加消息
      if (!streamingContent) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.message,
          timestamp: Date.now(),
        };
        setMessages(prev => {
          // 避免重复添加（onComplete 可能已经添加）
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg?.content === response.message) {
            return prev;
          }
          return [...prev, assistantMessage];
        });
      }

      // 如果使用了整理工具，显示刷新提示
      if (response.toolsUsed?.includes('organize_bookmarks') ||
          response.toolsUsed?.includes('collect_bookmarks') ||
          response.toolsUsed?.includes('create_folder')) {
        const refreshMessage: Message = {
          role: 'assistant',
          content: t('floatingChat.operationComplete'),
          timestamp: Date.now() + 1,
        };
        setTimeout(() => {
          setMessages(prev => [...prev, refreshMessage]);
        }, 500);
      }
    } catch (error) {
      console.error('[FloatingChat] Error:', error);

      const errorMessage: Message = {
        role: 'assistant',
        content: t('floatingChat.errorOccurred'),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setProgress(null);
      setStreamingContent('');
      // 保留思考步骤，但标记为完成
      setIsThinkingComplete(true);
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 点击快捷操作
  const handleQuickAction = (action: string) => {
    setInput(action);
    inputRef.current?.focus();
  };

  // 处理快捷功能选择
  const handleQuickActionSelect = (action: QuickAction) => {
    if (selectedAction?.id === action.id) {
      // 取消选择
      setSelectedAction(null);
    } else {
      setSelectedAction(action);
    }
    inputRef.current?.focus();
  };

  // 清空对话历史
  const handleClearChat = () => {
    if (window.confirm(t('floatingChat.clearChatConfirm'))) {
      setMessages([]);
      setInput('');
      setCurrentSessionId(null);
      // 清除 localStorage
      localStorage.removeItem('floatingChatHistory');
      inputRef.current?.focus();
    }
  };

  // 新建对话
  const handleNewChat = async () => {
    // 如果有消息，先存档当前对话
    if (messages.length > 0) {
      await chatArchiveManager.archiveSession(messages, currentSessionId || undefined);
    }
    setMessages([]);
    setInput('');
    setCurrentSessionId(null);
    localStorage.removeItem('floatingChatHistory');
    inputRef.current?.focus();
  };

  // 恢复存档
  const handleRestoreArchive = (session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    localStorage.setItem('floatingChatHistory', JSON.stringify(session.messages));
  };

  // 打开存档面板
  const handleOpenArchive = () => {
    setShowArchive(true);
  };

  // 确认保存书签
  const handleConfirmSave = async (data: any) => {
    console.log('[FloatingChat] 确认保存书签:', data);
    
    try {
      // 发送保存请求
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
        // 关闭对话框
        setShowConfirmDialog(false);
        setAnalysisData(null);

        // 添加成功消息
        const successMessage: Message = {
          role: 'assistant',
          content: t('floatingChat.saveSuccess', {
            title: data.title,
            folderPath: data.folderPath,
            tags: data.aiTags.join(', ')
          }),
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, successMessage]);
      } else {
        throw new Error(response?.error || 'Save failed');
      }
    } catch (error) {
      console.error('[FloatingChat] Save failed:', error);

      const errorMessage: Message = {
        role: 'assistant',
        content: t('floatingChat.saveFailed'),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // 取消保存
  const handleCancelSave = () => {
    setShowConfirmDialog(false);
    setAnalysisData(null);

    const cancelMessage: Message = {
      role: 'assistant',
      content: t('floatingChat.saveCancelled'),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, cancelMessage]);
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
                <h4>{t('floatingChat.greeting', '👋 你好！我是 AnyMark 智能助手')}</h4>
                <p className="welcome-desc">{t('floatingChat.welcomeDesc', '我可以帮你搜索书签、发现新资源、整理收藏')}</p>
                <div className="welcome-capabilities">
                  <span>📚 搜索书签</span>
                  <span>🌐 发现资源</span>
                  <span>🔥 热门项目</span>
                  <span>📂 智能整理</span>
                </div>
                <div className="quick-actions">
                  <button onClick={() => handleQuickAction(t('floatingChat.examples.searchBookmarks', '找我的 React 书签'))}>
                    🔍 {t('floatingChat.examples.searchBookmarks', '找我的 React 书签')}
                  </button>
                  <button onClick={() => handleQuickAction(t('floatingChat.examples.discoverResources', '推荐一些 Python 学习资源'))}>
                    🌐 {t('floatingChat.examples.discoverResources', '推荐一些 Python 学习资源')}
                  </button>
                  <button onClick={() => handleQuickAction(t('floatingChat.examples.trending', '最近最火的项目'))}>
                    🔥 {t('floatingChat.examples.trending', '最近最火的项目')}
                  </button>
                  <button onClick={() => handleQuickAction(t('floatingChat.examples.organize', '帮我整理书签'))}>
                    📂 {t('floatingChat.examples.organize', '帮我整理书签')}
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <MessageBubble
                key={idx}
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
            ))}

            {/* 思考过程卡片 */}
            {thinkingSteps.length > 0 && (
              <ThinkingCard steps={thinkingSteps} isComplete={isThinkingComplete} />
            )}

            {/* 进度显示 */}
            {progress && (
              <div className="progress-wrapper">
                <ProgressIndicator progress={progress} />
              </div>
            )}

            {/* 流式内容显示 */}
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

            {isLoading && !progress && !streamingContent && (
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
          <div className="chat-input">
            {selectedAction && (
              <span className="input-tag">{selectedAction.tag}</span>
            )}
            <input
              ref={inputRef}
              type="text"
              placeholder={selectedAction ? `${selectedAction.description}...` : t('floatingChat.placeholder')}
              value={input}
              onChange={e => setInput(e.target.value)}
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
