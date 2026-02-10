/**
 * 保存书签确认对话框
 */

import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Edit2, Folder, Tag, FileText, Sparkles, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './SaveConfirmDialog.css';

interface SaveConfirmDialogProps {
  isOpen: boolean;
  data: {
    url: string;
    title: string;
    favicon?: string;
    suggestedFolder: string;
    aiSummary?: string;
    aiTags: string[];
    aiCategory?: string;
    aiConfidence?: number;
    aiDifficulty?: string;
    aiTechStack?: string[];
  };
  onConfirm: (data: any) => void;
  onCancel: () => void;
}

const SaveConfirmDialog: React.FC<SaveConfirmDialogProps> = ({
  isOpen,
  data,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(data.title);
  const [editedFolder, setEditedFolder] = useState(data.suggestedFolder);
  const [editedTags, setEditedTags] = useState<string[]>(data.aiTags);
  const [editedSummary, setEditedSummary] = useState(data.aiSummary || '');
  const [newTag, setNewTag] = useState('');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // 重置编辑状态
  useEffect(() => {
    if (isOpen) {
      setEditedTitle(data.title);
      setEditedFolder(data.suggestedFolder);
      setEditedTags(data.aiTags);
      setEditedSummary(data.aiSummary || '');
      setNewTag('');
      setIsEditing(false);
    }
  }, [isOpen, data]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        if (!isEditing) {
          onCancel();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isEditing, onCancel]);

  if (!isOpen) return null;

  const handleAddTag = () => {
    if (newTag.trim() && !editedTags.includes(newTag.trim())) {
      setEditedTags([...editedTags, newTag.trim()]);
      setNewTag('');
      tagInputRef.current?.focus();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditedTags(editedTags.filter(tag => tag !== tagToRemove));
  };

  const handleConfirm = () => {
    onConfirm({
      ...data,
      title: editedTitle,
      folderPath: editedFolder,
      aiTags: editedTags,
      aiSummary: editedSummary,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <div className="save-confirm-overlay">
      <div className="save-confirm-dialog" ref={dialogRef}>
        {/* 头部 */}
        <div className="dialog-header">
          <div className="dialog-title">
            <Sparkles size={20} />
            <h3>{t('saveConfirm.title')}</h3>
            {data.aiConfidence && (
              <span className="confidence-badge">
                {t('saveConfirm.confidence', { value: data.aiConfidence })}
              </span>
            )}
          </div>
          <button className="dialog-close" onClick={onCancel} title={t('saveConfirm.cancel')}>
            <X size={18} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="dialog-content">
          {/* 页面信息 */}
          <div className="page-info">
            {data.favicon && (
              <img src={data.favicon} alt="" className="page-favicon" />
            )}
            <div className="page-details">
              {isEditing ? (
                <input
                  type="text"
                  className="edit-input title-input"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  placeholder={t('saveConfirm.pageTitlePlaceholder')}
                />
              ) : (
                <h4 className="page-title">{editedTitle}</h4>
              )}
              <p className="page-url">{data.url}</p>
            </div>
          </div>

          {/* AI 分类信息 */}
          {data.aiCategory && (
            <div className="info-section">
              <div className="section-header">
                <Sparkles size={16} />
                <span>{t('saveConfirm.aiCategory')}</span>
              </div>
              <div className="category-badges">
                <span className="category-badge primary">{data.aiCategory}</span>
                {data.aiDifficulty && (
                  <span className="category-badge difficulty">{data.aiDifficulty}</span>
                )}
                {data.aiTechStack && data.aiTechStack.length > 0 && (
                  data.aiTechStack.map((tech, i) => (
                    <span key={i} className="category-badge tech">{tech}</span>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 推荐文件夹 */}
          <div className="info-section">
            <div className="section-header">
              <Folder size={16} />
              <span>{t('saveConfirm.location')}</span>
            </div>
            {isEditing ? (
              <div className="folder-input-wrapper">
                <input
                  type="text"
                  className="edit-input"
                  value={editedFolder}
                  onChange={(e) => setEditedFolder(e.target.value)}
                  placeholder={t('saveConfirm.folderPathPlaceholder')}
                />
                <button
                  className="dropdown-toggle"
                  onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            ) : (
              <div className="folder-display">
                <Folder size={14} />
                <span>{editedFolder}</span>
              </div>
            )}
          </div>

          {/* AI 标签 */}
          <div className="info-section">
            <div className="section-header">
              <Tag size={16} />
              <span>{t('saveConfirm.smartTags')}</span>
            </div>
            <div className="tags-container">
              {editedTags.map((tag, index) => (
                <span key={index} className="tag-item">
                  {tag}
                  {isEditing && (
                    <button
                      className="tag-remove"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
              {isEditing && (
                <input
                  ref={tagInputRef}
                  type="text"
                  className="tag-input"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('saveConfirm.addTagPlaceholder')}
                />
              )}
            </div>
          </div>

          {/* AI 摘要 */}
          {editedSummary && (
            <div className="info-section">
              <div className="section-header">
                <FileText size={16} />
                <span>{t('saveConfirm.contentSummary')}</span>
              </div>
              {isEditing ? (
                <textarea
                  className="edit-textarea"
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  placeholder={t('saveConfirm.summaryPlaceholder')}
                  rows={3}
                />
              ) : (
                <p className="summary-text">{editedSummary}</p>
              )}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="dialog-actions">
          {isEditing ? (
            <>
              <button
                className="action-btn btn-secondary"
                onClick={() => setIsEditing(false)}
              >
                {t('saveConfirm.cancelEdit')}
              </button>
              <button
                className="action-btn btn-primary"
                onClick={handleConfirm}
              >
                <Check size={18} />
                {t('saveConfirm.saveBookmark')}
              </button>
            </>
          ) : (
            <>
              <button
                className="action-btn btn-text"
                onClick={onCancel}
              >
                <X size={18} />
                {t('saveConfirm.cancel')}
              </button>
              <button
                className="action-btn btn-secondary"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 size={18} />
                {t('saveConfirm.edit')}
              </button>
              <button
                className="action-btn btn-primary"
                onClick={handleConfirm}
              >
                <Check size={18} />
                {t('saveConfirm.confirmSave')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaveConfirmDialog;
