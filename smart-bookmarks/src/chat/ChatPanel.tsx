/**
 * AI聊天面板组件
 * 提供对话界面和智能书签功能
 */

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, BookOpen, Lightbulb, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from './chatStore';
import '../i18n/config';
import './ChatPanel.css';

interface ChatPanelProps {
  bookmarks?: any[];
  onAnalyzeBookmark?: (bookmark: any) => void;
  className?: string;
}

export default function ChatPanel({ bookmarks = [], onAnalyzeBookmark, className = '' }: ChatPanelProps) {
  const { t } = useTranslation();
  const {
    messages,
    isLoading,
    isOpen,
    error,
    sendMessage,
    requestBookmarkRecommendation,
    analyzeBookmark,
    getCollectionSuggestion,
    setOpen,
    clearMessages
  } = useChatStore();

  const [input, setInput] = useState('');
  const [currentMode, setCurrentMode] = useState<'chat' | 'analysis' | 'recommendation'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 自动聚焦输入框
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');

    if (currentMode === 'chat') {
      await sendMessage(message);
    } else if (currentMode === 'recommendation' && bookmarks.length > 0) {
      await requestBookmarkRecommendation(message, bookmarks);
    } else if (currentMode === 'analysis') {
      // 分析模式需要选择书签
      addMessage('assistant', t('chat.suggestions.analyze'));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    const message = {
      role,
      content,
      id: `msg_${Date.now()}`,
      timestamp: Date.now()
    };
    // 这里需要调用store的addMessage方法，但为了简化直接创建
  };

  const quickActions = [
    {
      icon: <Search size={16} />,
      label: t('chat.suggestions.find'),
      action: () => setCurrentMode('recommendation'),
      active: currentMode === 'recommendation'
    },
    {
      icon: <BookOpen size={16} />,
      label: t('chat.suggestions.analyze'),
      action: () => setCurrentMode('analysis'),
      active: currentMode === 'analysis'
    },
    {
      icon: <Lightbulb size={16} />,
      label: t('chat.suggestions.organize'),
      action: () => getCollectionSuggestion(t('chat.suggestions.organize')),
      active: currentMode === 'chat'
    }
  ];

  if (!isOpen) {
    return (
      <button
        className={`chat-fab ${className}`}
        onClick={() => setOpen(true)}
        title={t('chat.title')}
      >
        <MessageCircle size={24} />
      </button>
    );
  }

  return (
    <div className={`chat-panel ${className}`}>
      {/* 头部 */}
      <div className="chat-header">
        <div className="chat-title">
          <MessageCircle size={20} />
          <span>{t('chat.title')}</span>
        </div>
        <div className="chat-actions">
          <button
            className="btn-clear"
            onClick={clearMessages}
            title={t('chat.clear')}
          >
            {t('chat.clear')}
          </button>
          <button
            className="btn-close"
            onClick={() => setOpen(false)}
            title={t('chat.close')}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 快速操作 */}
      <div className="chat-modes">
        {quickActions.map((action, index) => (
          <button
            key={index}
            className={`mode-btn ${action.active ? 'active' : ''}`}
            onClick={action.action}
            disabled={isLoading}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}
          >
            <div className="message-avatar">
              {message.role === 'user' ? t('chat.user') : t('chat.assistant')}
            </div>
            <div className="message-content">
              <div className="message-text">
                {message.content.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line}
                    {i < message.content.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
              </div>
              <div className="message-time">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-avatar">{t('chat.assistant')}</div>
            <div className="message-content">
              <div className="message-text loading">
                <Loader2 size={16} className="spinner" />
                {t('chat.thinking')}
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="message error">
            <div className="message-avatar">!</div>
            <div className="message-content">
              <div className="message-text">{error}</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="chat-input-container">
        <div className="mode-hint">
          {currentMode === 'chat' && `💬 ${t('chat.title')}`}
          {currentMode === 'recommendation' && `🔍 ${t('chat.suggestions.find')}`}
          {currentMode === 'analysis' && `📊 ${t('chat.suggestions.analyze')}`}
        </div>
        <div className="chat-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t('chat.inputPlaceholder')}
            disabled={isLoading}
            className="chat-input"
            id="chat-input"
            name="chatInput"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="btn-send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
