/**
 * 增强的消息气泡组件
 * 支持 Markdown 渲染（语法高亮）、复制、重新生成等功能
 * 可访问性增强：ARIA 标签、键盘导航、焦点管理
 */

import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../../../utils/chatArchiveManager';
import 'highlight.js/styles/github-dark.min.css';
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
  const actionsRef = useRef<HTMLDivElement>(null);

  // 键盘焦点时显示操作按钮
  const handleFocus = () => setShowActions(true);
  const handleBlur = (e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as Node;
    if (!relatedTarget || !actionsRef.current?.contains(relatedTarget)) {
      setShowActions(false);
    }
  };

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

  // 生成唯一 ID 用于 ARIA 关联
  const messageId = `message-${message.timestamp}-${message.role}`;
  const actionsId = `${messageId}-actions`;

  // 处理链接点击
  const handleLinkClick = (href: string) => {
    chrome.tabs.create({ url: href });
  };

  return (
    <div
      className={`message-bubble ${message.role}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <div
        className="message-bubble-content"
        role="article"
        aria-labelledby={`${messageId}-content`}
        id={messageId}
      >
        {message.role === 'assistant' ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              // 自定义段落渲染
              p: ({ node, children, ...props }) => (
                <p className="message-paragraph" {...props}>
                  {children}
                </p>
              ),
              // 自定义加粗渲染
              strong: ({ node, children, ...props }) => (
                <strong className="message-bold" {...props}>
                  {children}
                </strong>
              ),
              // 自定义斜体渲染
              em: ({ node, children, ...props }) => (
                <em className="message-italic" {...props}>
                  {children}
                </em>
              ),
              // 自定义删除线渲染
              del: ({ node, children, ...props }) => (
                <del className="message-strikethrough" {...props}>
                  {children}
                </del>
              ),
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
              // 自定义代码块渲染（带语言标签 + 复制按钮）
              pre: ({ node, children, ...props }) => {
                // 提取语言类名
                const codeEl = (children as any)?.[0];
                const className = codeEl?.props?.className || '';
                const langMatch = className.match(/language-(\w+)/);
                const lang = langMatch ? langMatch[1] : '';

                // 提取纯文本用于复制
                const extractText = (el: any): string => {
                  if (typeof el === 'string') return el;
                  if (el?.props?.children) {
                    const c = el.props.children;
                    if (Array.isArray(c)) return c.map(extractText).join('');
                    return extractText(c);
                  }
                  return '';
                };
                const codeText = extractText(codeEl);

                return (
                  <div className="code-block-wrapper">
                    {lang && <span className="code-block-lang">{lang}</span>}
                    <CopyCodeButton text={codeText} />
                    <pre className="code-block" {...props}>
                      {children}
                    </pre>
                  </div>
                );
              },
              code: ({ node, className, children, inline, ...props }) => {
                if (inline) {
                  return (
                    <code className="inline-code" {...props}>
                      {children}
                    </code>
                  );
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
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
              li: ({ node, children, ...props }) => (
                <li className="message-list-item" {...props}>
                  {children}
                </li>
              ),
              // 自定义标题渲染
              h1: ({ node, children, ...props }) => (
                <h1 className="message-heading h1" {...props}>{children}</h1>
              ),
              h2: ({ node, children, ...props }) => (
                <h2 className="message-heading h2" {...props}>{children}</h2>
              ),
              h3: ({ node, children, ...props }) => (
                <h3 className="message-heading h3" {...props}>{children}</h3>
              ),
              h4: ({ node, children, ...props }) => (
                <h4 className="message-heading h4" {...props}>{children}</h4>
              ),
              h5: ({ node, children, ...props }) => (
                <h5 className="message-heading h5" {...props}>{children}</h5>
              ),
              h6: ({ node, children, ...props }) => (
                <h6 className="message-heading h6" {...props}>{children}</h6>
              ),
              // 自定义引用渲染
              blockquote: ({ node, children, ...props }) => (
                <blockquote className="message-quote" {...props}>
                  {children}
                </blockquote>
              ),
              // 自定义分隔线
              hr: ({ node, ...props }) => (
                <hr className="message-hr" {...props} />
              ),
              // 自定义表格渲染
              table: ({ node, children, ...props }) => (
                <div className="table-wrapper">
                  <table className="message-table" {...props}>
                    {children}
                  </table>
                </div>
              ),
              thead: ({ node, children, ...props }) => (
                <thead {...props}>{children}</thead>
              ),
              tbody: ({ node, children, ...props }) => (
                <tbody {...props}>{children}</tbody>
              ),
              th: ({ node, children, ...props }) => (
                <th {...props}>{children}</th>
              ),
              td: ({ node, children, ...props }) => (
                <td {...props}>{children}</td>
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
      {message.role === 'assistant' && (
        <div
          ref={actionsRef}
          className="message-actions"
          id={actionsId}
          role="toolbar"
          aria-label={t('messageBubble.actionsLabel', '消息操作')}
        >
          <button
            className="action-btn"
            onClick={handleCopy}
            aria-label={copied ? t('messageBubble.copied') : t('messageBubble.copy')}
            title={copied ? t('messageBubble.copied') : t('messageBubble.copy')}
          >
            <span className="sr-only">{copied ? t('messageBubble.copied') : t('messageBubble.copy')}</span>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          </button>
          {onRegenerate && (
            <button
              className="action-btn"
              onClick={onRegenerate}
              aria-label={t('messageBubble.regenerate')}
              title={t('messageBubble.regenerate')}
            >
              <span className="sr-only">{t('messageBubble.regenerate')}</span>
              <RefreshCw size={14} aria-hidden="true" />
            </button>
          )}
          {onFeedback && (
            <>
              <button
                className="action-btn"
                onClick={() => onFeedback('like')}
                aria-label={t('messageBubble.helpful')}
                title={t('messageBubble.helpful')}
              >
                <span className="sr-only">{t('messageBubble.helpful')}</span>
                <ThumbsUp size={14} aria-hidden="true" />
              </button>
              <button
                className="action-btn"
                onClick={() => onFeedback('dislike')}
                aria-label={t('messageBubble.notHelpful')}
                title={t('messageBubble.notHelpful')}
              >
                <span className="sr-only">{t('messageBubble.notHelpful')}</span>
                <ThumbsDown size={14} aria-hidden="true" />
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

/** 代码块内的复制按钮 */
const CopyCodeButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <button className="code-copy-btn" onClick={handleCopy} aria-label="Copy code">
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
};

export default MessageBubble;
