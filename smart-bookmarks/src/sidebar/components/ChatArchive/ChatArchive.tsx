/**
 * ChatArchive - 对话存档组件
 * 显示存档列表、存储使用情况、恢复和删除操作
 */

import React, { useState, useEffect } from 'react';
import { Archive, Trash2, RotateCcw, Plus, X, Edit2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { chatArchiveManager, type ChatSession, type StorageUsage } from '../../../utils/chatArchiveManager';
import './ChatArchive.css';

interface ChatArchiveProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore: (session: ChatSession) => void;
  onNewChat: () => void;
}

const ChatArchive: React.FC<ChatArchiveProps> = ({
  isOpen,
  onClose,
  onRestore,
  onNewChat,
}) => {
  const { t } = useTranslation();
  const [archives, setArchives] = useState<ChatSession[]>([]);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // 加载存档列表
  const loadArchives = async () => {
    setIsLoading(true);
    try {
      const [archiveList, usage] = await Promise.all([
        chatArchiveManager.getArchives(),
        chatArchiveManager.getStorageUsage(),
      ]);
      setArchives(archiveList);
      setStorageUsage(usage);
    } catch (error) {
      console.error('[ChatArchive] Failed to load archives:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadArchives();
    }
  }, [isOpen]);

  // 恢复存档
  const handleRestore = async (session: ChatSession) => {
    onRestore(session);
    onClose();
  };

  // 删除存档
  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t('chatArchive.deleteConfirm'))) {
      await chatArchiveManager.deleteArchive(sessionId);
      await loadArchives();
    }
  };

  // 开始编辑标题
  const handleStartEdit = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  // 保存标题
  const handleSaveTitle = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      await chatArchiveManager.updateTitle(sessionId, editTitle.trim());
      await loadArchives();
    }
    setEditingId(null);
    setEditTitle('');
  };

  // 取消编辑
  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditTitle('');
  };

  // 新建对话
  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  // 格式化日期
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return t('chatArchive.yesterday');
    } else if (days < 7) {
      return t('chatArchive.daysAgo', { count: days });
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="chat-archive-overlay" onClick={onClose}>
      <div className="chat-archive-panel" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="archive-header">
          <div className="archive-title">
            <Archive size={18} />
            <h3>{t('chatArchive.title')}</h3>
          </div>
          <div className="archive-actions">
            <button className="new-chat-btn" onClick={handleNewChat} title={t('chatArchive.newChat')}>
              <Plus size={16} />
              <span>{t('chatArchive.new')}</span>
            </button>
            <button className="close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 存档列表 */}
        <div className="archive-list">
          {isLoading ? (
            <div className="archive-loading">{t('chatArchive.loading')}</div>
          ) : archives.length === 0 ? (
            <div className="archive-empty">
              <Archive size={32} />
              <p>{t('chatArchive.empty')}</p>
              <span>{t('chatArchive.emptyDesc')}</span>
            </div>
          ) : (
            archives.map(session => (
              <div
                key={session.id}
                className="archive-item"
                onClick={() => handleRestore(session)}
              >
                <div className="archive-item-content">
                  {editingId === session.id ? (
                    <div className="edit-title-wrapper" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        className="edit-title-input"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveTitle(session.id, e as any);
                          if (e.key === 'Escape') handleCancelEdit(e as any);
                        }}
                      />
                      <button
                        className="edit-action-btn save"
                        onClick={e => handleSaveTitle(session.id, e)}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="edit-action-btn cancel"
                        onClick={handleCancelEdit}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="archive-item-title">{session.title}</span>
                      <span className="archive-item-date">{formatDate(session.updatedAt)}</span>
                    </>
                  )}
                </div>
                <div className="archive-item-actions">
                  <span className="message-count">{t('chatArchive.messages', { count: session.messages.length })}</span>
                  {editingId !== session.id && (
                    <>
                      <button
                        className="item-action-btn"
                        onClick={e => handleStartEdit(session, e)}
                        title={t('chatArchive.editTitle')}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="item-action-btn restore"
                        onClick={e => { e.stopPropagation(); handleRestore(session); }}
                        title={t('chatArchive.restoreChat')}
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        className="item-action-btn delete"
                        onClick={e => handleDelete(session.id, e)}
                        title={t('chatArchive.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 存储使用情况 */}
        {storageUsage && (
          <div className="storage-usage">
            <div className="storage-bar">
              <div
                className="storage-bar-fill"
                style={{ width: `${Math.min(storageUsage.percentage, 100)}%` }}
              />
            </div>
            <span className="storage-text">
              {t('chatArchive.storage', {
                used: chatArchiveManager.formatSize(storageUsage.used),
                total: chatArchiveManager.formatSize(storageUsage.total)
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatArchive;
