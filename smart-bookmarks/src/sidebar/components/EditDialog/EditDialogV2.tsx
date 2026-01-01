/**
 * EditDialogV2 - 使用新架构的编辑书签对话框
 * 
 * 基于 Chrome Native 作为唯一数据源
 * 使用 chromeId 作为主键
 */

import React, { useState, useEffect } from 'react';
import { X, Save, Link, FileText, FolderTree, Tags as TagsIcon, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../../i18n/config';
import type { MergedBookmark, MergedFolder } from '../../../types/chromeBookmark';
import FolderSelectorV2 from '../FolderSelector/FolderSelectorV2';
import { useBookmarkStoreV2 } from '../../store/bookmarkStoreV2';
import './EditDialog.css';

interface EditDialogV2Props {
  bookmark: MergedBookmark;
  isOpen: boolean;
  onClose: () => void;
  onSave: (chromeId: string, updates: { title?: string; url?: string }, metadataUpdates: { aiSummary?: string; userTags?: string[] }) => void;
}

const EditDialogV2: React.FC<EditDialogV2Props> = ({ bookmark, isOpen, onClose, onSave }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [targetFolderId, setTargetFolderId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [userTags, setUserTags] = useState<string[]>([]);

  // 从 store 获取文件夹列表
  const folders = useBookmarkStoreV2((state) => state.folders);
  const anyMarkRootId = useBookmarkStoreV2((state) => state.anyMarkRootId);
  const moveBookmark = useBookmarkStoreV2((state) => state.moveBookmark);

  useEffect(() => {
    if (isOpen && bookmark) {
      setTitle(bookmark.title);
      setUrl(bookmark.url);
      setSummary(bookmark.aiSummary || '');
      setTargetFolderId(bookmark.parentId);

      // 标签逻辑：优先使用用户标签，否则使用 AI 标签
      if (bookmark.userTags.length > 0) {
        setUserTags([...bookmark.userTags]);
      } else if (bookmark.aiTags && bookmark.aiTags.length > 0) {
        setUserTags([...bookmark.aiTags]);
      } else {
        setUserTags([]);
      }
    }
  }, [isOpen, bookmark]);

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !userTags.includes(tag)) {
      setUserTags([...userTags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setUserTags(userTags.filter(tag => tag !== tagToRemove));
  };

  const handleSave = async () => {
    // 保存书签基本信息和元数据
    onSave(
      bookmark.chromeId,
      { title, url },
      { aiSummary: summary, userTags }
    );

    // 如果文件夹变更，移动书签
    if (targetFolderId !== bookmark.parentId) {
      await moveBookmark(bookmark.chromeId, targetFolderId);
    }

    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="edit-dialog-overlay" onClick={onClose}>
      <div className="edit-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="edit-dialog-header">
          <h2>{t('sidebar.editDialog.title')}</h2>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="edit-dialog-body">
          {/* 标题 */}
          <div className="form-group">
            <label>
              <FileText size={16} />
              {t('sidebar.editDialog.fields.title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('sidebar.editDialog.fields.titlePlaceholder')}
              autoFocus
            />
          </div>

          {/* URL */}
          <div className="form-group">
            <label>
              <Link size={16} />
              {t('sidebar.editDialog.fields.url')}
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('sidebar.editDialog.fields.urlPlaceholder')}
            />
          </div>

          {/* 文件夹选择器 */}
          <div className="form-group">
            <label>
              <FolderTree size={16} />
              {t('sidebar.editDialog.fields.folder')}
            </label>
            <FolderSelectorV2
              value={targetFolderId}
              onChange={setTargetFolderId}
              folders={folders}
              rootId={anyMarkRootId}
              placeholder={t('sidebar.editDialog.fields.folderPlaceholder')}
            />
          </div>

          {/* 标签 */}
          <div className="form-group">
            <label>
              <TagsIcon size={16} />
              {t('sidebar.editDialog.fields.tags')}
              {bookmark.userTags.length === 0 && bookmark.aiTags && bookmark.aiTags.length > 0 && (
                <span className="ai-badge-small">{t('sidebar.editDialog.badges.aiGenerated')}</span>
              )}
            </label>
            <div className="tags-input-container">
              <div className="tags-list">
                {userTags.map(tag => (
                  <span key={tag} className="tag user-tag">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)}>×</button>
                  </span>
                ))}
              </div>
              <div className="tag-input-wrapper">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder={t('sidebar.editDialog.fields.tagsPlaceholder')}
                />
                <button onClick={handleAddTag} disabled={!tagInput.trim()}>
                  {t('sidebar.editDialog.buttons.add')}
                </button>
              </div>
            </div>
          </div>

          {/* 摘要 */}
          <div className="form-group">
            <label>
              <Sparkles size={16} />
              {t('sidebar.editDialog.fields.summary')}
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t('sidebar.editDialog.fields.summaryPlaceholder')}
              rows={4}
            />
          </div>
        </div>

        <div className="edit-dialog-footer">
          <button className="button secondary" onClick={onClose}>
            {t('sidebar.editDialog.buttons.cancel')}
          </button>
          <button className="button primary" onClick={handleSave}>
            <Save size={16} />
            {t('sidebar.editDialog.buttons.save')}
          </button>
          <div className="shortcut-hint">
            <kbd>Esc</kbd> {t('sidebar.editDialog.shortcuts.cancel')} · <kbd>Cmd/Ctrl + Enter</kbd> {t('sidebar.editDialog.shortcuts.save')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditDialogV2;
