/**
 * 增强的消息气泡组件
 * 支持 Markdown 渲染、复制、重新生成等功能
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../../../utils/agent/types';
import './MessageBubble.css';

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
  onFeedback?: (type: 'like' | 'dislike') => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onRegenerate,
  onFeedback,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // 复制消息内容
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[MessageBubble] Failed to copy:', error);
    }
  };

  // 处理链接点击
  const handleLinkClick = (href: string) => {
    chrome.tabs.create({ url: href });
  };

  return (
    <div
      className={`message-bubble ${message.role}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="message-bubble-content">
        {message.role === 'assistant' ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // 自定义链接渲染
              a: ({ node, href, children, ...props }) => (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    if (href) handleLinkClick(href);
                  }}
                  className="message-link"
                  {...props}
                >
                  {children}
                </a>
              ),
              // 自定义代码块渲染
              code: ({ node, inline, className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || '');
                return inline ? (
                  <code className="inline-code" {...props}>
                    {children}
                  </code>
                ) : (
                  <pre className="code-block">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                );
              },
              // 自定义列表渲染
              ul: ({ node, children, ...props }) => (
                <ul className="message-list" {...props}>
                  {children}
                </ul>
              ),
              ol: ({ node, children, ...props }) => (
                <ol className="message-list ordered" {...props}>
                  {children}
                </ol>
              ),
              // 自定义标题渲染
              h1: ({ node, children, ...props }) => (
                <h1 className="message-heading h1" {...props}>
                  {children}
                </h1>
              ),
              h2: ({ node, children, ...props }) => (
                <h2 className="message-heading h2" {...props}>
                  {children}
                </h2>
              ),
              h3: ({ node, children, ...props }) => (
                <h3 className="message-heading h3" {...props}>
                  {children}
                </h3>
              ),
              // 自定义引用渲染
              blockquote: ({ node, children, ...props }) => (
                <blockquote className="message-quote" {...props}>
                  {children}
                </blockquote>
              ),
              // 自定义表格渲染
              table: ({ node, children, ...props }) => (
                <div className="table-wrapper">
                  <table className="message-table" {...props}>
                    {children}
                  </table>
                </div>
              ),
            }}
          >
            {message.content || ''}
          </ReactMarkdown>
        ) : (
          <div className="message-text">{message.content}</div>
        )}
      </div>

      {/* 操作按钮 */}
      {message.role === 'assistant' && showActions && (
        <div className="message-actions">
          <button
            className="action-btn"
            onClick={handleCopy}
            title={copied ? t('messageBubble.copied') : t('messageBubble.copy')}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {onRegenerate && (
            <button
              className="action-btn"
              onClick={onRegenerate}
              title={t('messageBubble.regenerate')}
            >
              <RefreshCw size={14} />
            </button>
          )}
          {onFeedback && (
            <>
              <button
                className="action-btn"
                onClick={() => onFeedback('like')}
                title={t('messageBubble.helpful')}
              >
                <ThumbsUp size={14} />
              </button>
              <button
                className="action-btn"
                onClick={() => onFeedback('dislike')}
                title={t('messageBubble.notHelpful')}
              >
                <ThumbsDown size={14} />
              </button>
            </>
          )}
        </div>
      )}

      {/* 复制成功提示 */}
      {copied && (
        <div className="copy-toast">
          <Check size={12} />
          {t('messageBubble.copied')}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
