/**
 * AI 聊天面板组件 - 增强版本
 * 支持流式响应和进度显示
 */

import React, { useState, useEffect, useRef } from 'react';
import { Send, X, Archive, Plus, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../../i18n/config';
import { bookmarkAgent } from '../../../utils/agent/bookmarkAgent';
import type { Message, ProgressInfo, ThinkingStep } from '../../../utils/agent/types';
import { QuickActionBar, type QuickAction } from '../QuickActionBar';
import { ChatArchive } from '../ChatArchive';
import PixelBuddyIcon from '../PixelBuddyIcon/PixelBuddyIcon';
import { chatArchiveManager, type ChatSession } from '../../../utils/chatArchiveManager';
import MessageBubble from '../MessageBubble/MessageBubble';
import ProgressIndicator from '../ProgressIndicator/ProgressIndicator';
import ThinkingCard from '../ThinkingCard/ThinkingCard';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import './AIChatPanel.css';

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIChatPanel: React.FC<AIChatPanelProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestHistory, setRequestHistory] = useState<string[]>([]);
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [isThinkingComplete, setIsThinkingComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 实时保存消息（防止数据丢失）
  useEffect(() => {
    if (messages.length > 0) {
      const autoSave = async () => {
        try {
          await chatArchiveManager.archiveSession(messages, currentSessionId || undefined);
          console.log('[AIChatPanel] Auto-saved conversation');
        } catch (error) {
          console.error('[AIChatPanel] Auto-save failed:', error);
        }
      };
      
      // 延迟保存，避免频繁写入
      const timer = setTimeout(autoSave, 2000);
      return () => clearTimeout(timer);
    }
  }, [messages, currentSessionId]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // 窗口关闭时自动存档
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const saveOnClose = async () => {
        try {
          await chatArchiveManager.archiveSession(messages, currentSessionId || undefined);
          console.log('[AIChatPanel] Conversation archived on close');
        } catch (error) {
          console.error('[AIChatPanel] Failed to archive on close:', error);
        }
      };
      saveOnClose();
    }
  }, [isOpen, messages, currentSessionId]);

  // 快捷操作
  const handleQuickAction = (action: string) => {
    if (isProcessing || isLoading) return;
    setInput(action);
    inputRef.current?.focus();
  };

  // 处理快捷功能选择
  const handleQuickActionSelect = (action: QuickAction) => {
    if (isProcessing || isLoading) return;
    if (selectedAction?.id === action.id) {
      setSelectedAction(null);
    } else {
      setSelectedAction(action);
    }
    inputRef.current?.focus();
  };

  // 新建对话
  const handleNewChat = async () => {
    if (messages.length > 0) {
      await chatArchiveManager.archiveSession(messages, currentSessionId || undefined);
    }
    setMessages([]);
    setInput('');
    setCurrentSessionId(null);
    inputRef.current?.focus();
  };

  // 恢复存档
  const handleRestoreArchive = (session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
  };

  // 清空对话
  const handleClearChat = () => {
    if (window.confirm(t('sidebar.aiChat.confirm.clearChat'))) {
      setMessages([]);
      setInput('');
      setCurrentSessionId(null);
      inputRef.current?.focus();
    }
  };

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      // 浏览历史消息
      if (requestHistory.length > 0) {
        const previousQuery = requestHistory[requestHistory.length - 1];
        setInput(previousQuery);
        inputRef.current?.setSelectionRange(previousQuery.length, previousQuery.length);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // 可以实现浏览历史消息
      // 暂时保留给未来实现
    }
  };

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || isLoading || isProcessing) return;

    // 不在消息中添加标记，只传递 quickAction 给 agent
    const messageContent = input;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    // 添加到请求历史
    const userQuery = input.trim();
    if (!requestHistory.includes(userQuery)) {
      setRequestHistory(prev => [...prev.slice(-9), userQuery]);
    }

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    const currentAction = selectedAction; // 保存当前选择
    setSelectedAction(null); // 发送后清除选择
    setIsLoading(true);
    setIsProcessing(true);
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
          console.error('[AIChatPanel] Stream error:', error);
        },
      });

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
    } catch (error) {
      console.error('[AIChatPanel] AI request failed:', error);

      // 错误消息
      const errorMessage: Message = {
        role: 'assistant',
        content: t('sidebar.aiChat.messages.error'),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
      setProgress(null);
      setStreamingContent('');
      // 保留思考步骤，但标记为完成
      setIsThinkingComplete(true);
    }
  };

  // 获取当前标签页信息
  const getCurrentTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab ? {
        url: tab.url,
        title: tab.title,
        id: tab.id
      } : null;
    } catch (error) {
      console.warn('[AIChatPanel] Failed to get current tab:', error);
      return null;
    }
  };

  if (!isOpen) return null;

  return (
    <ErrorBoundary>
      <div className="ai-chat-panel">
      {/* 头部 */}
      <div className="ai-chat-header">
        <div className="ai-chat-title">
          <PixelBuddyIcon size={20} />
          <h3>{t('sidebar.aiChat.title')}</h3>
        </div>
        <div className="ai-chat-header-actions">
          <button 
            className="ai-chat-action-btn" 
            onClick={() => setShowArchive(true)}
            title={t('sidebar.aiChat.archive')}
          >
            <Archive size={16} />
          </button>
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
      </div>

      {/* 消息列表 */}
      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-chat-welcome">
            <div className="welcome-icon">
              <PixelBuddyIcon size={56} animated />
            </div>
            <h4>{t('sidebar.aiChat.welcome.greeting')}</h4>
            <p className="welcome-desc">{t('sidebar.aiChat.welcome.tryAsking')}</p>
            <div className="quick-actions">
              <button onClick={() => handleQuickAction(t('sidebar.aiChat.welcome.examples.findTutorial'))}>
                {t('sidebar.aiChat.welcome.examples.findTutorial')}
              </button>
              <button onClick={() => handleQuickAction(t('sidebar.aiChat.welcome.examples.saveCurrentPage'))}>
                {t('sidebar.aiChat.welcome.examples.saveCurrentPage')}
              </button>
              <button onClick={() => handleQuickAction(t('sidebar.aiChat.welcome.examples.recommendResources'))}>
                {t('sidebar.aiChat.welcome.examples.recommendResources')}
              </button>
              <button onClick={() => handleQuickAction(t('sidebar.aiChat.welcome.examples.whatCanYouDo'))}>
                {t('sidebar.aiChat.welcome.examples.whatCanYouDo')}
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
                    // 重新生成最后一条消息
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
              console.log(`[AIChatPanel] Feedback: ${type} for message ${idx}`);
              // TODO: 实现反馈记录
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
          <div className="ai-message assistant">
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
        disabled={isLoading || isProcessing}
      />

      {/* 输入框 */}
      <div className="ai-chat-input">
        {selectedAction && (
          <span className="input-tag">{selectedAction.tag}</span>
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder={selectedAction ? t('sidebar.aiChat.input.placeholderWithAction', { description: selectedAction.description }) : t('sidebar.aiChat.input.placeholder')}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          id="ai-chat-input"
          name="aiChatInput"
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isLoading || isProcessing}
        >
          <Send size={16} />
        </button>
      </div>

      {/* 对话存档面板 */}
      <ChatArchive
        isOpen={showArchive}
        onClose={() => setShowArchive(false)}
        onRestore={handleRestoreArchive}
        onNewChat={handleNewChat}
      />
    </div>
    </ErrorBoundary>
  );
};

export default AIChatPanel;