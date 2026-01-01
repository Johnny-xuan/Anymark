/**
 * 编辑书签对话框 - 完整编辑功能
 */

import React, { useState, useEffect } from 'react';
import { X, Save, Link, FileText, FolderTree, Tags as TagsIcon, Sparkles, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../../i18n/config';
import type { IBookmark } from '../../../types/bookmark';
import FolderSelector from '../FolderSelector/FolderSelector';
import { useBookmarkStoreV2 } from '../../store/bookmarkStoreV2';
import { showToast } from '../../../components/Toast/ToastContainer';
import './EditDialog.css';

interface EditDialogProps {
  bookmark: IBookmark;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<IBookmark>) => void;
}

const EditDialog: React.FC<EditDialogProps> = ({ bookmark, isOpen, onClose, onSave }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [userTags, setUserTags] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 从 V2 store 获取文件夹列表
  const folders = useBookmarkStoreV2((state) => state.folders);

  // 提取现有文件夹路径
  const existingFolders = React.useMemo(() => {
    return folders
      .map((f) => f.path)
      .filter((path) => path && path !== '/')
      .sort();
  }, [folders]);

  useEffect(() => {
    if (isOpen && bookmark) {
      setTitle(bookmark.title);
      setUrl(bookmark.url);
      // 直接使用 aiSummary
      setSummary(bookmark.aiSummary || '');
      setFolderPath(bookmark.folderPath || '/');

      // 标签逻辑：如果用户已有标签使用用户的，否则默认使用AI建议的全部标签
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

  const handleSave = () => {
    const updates: Partial<IBookmark> = {
      title,
      url,
      aiSummary: summary,
      folderPath,
      userTags,
      updateTime: Date.now(),
    };
    onSave(updates);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  };

  // AI 分析功能
  const handleAIAnalyze = async () => {
    if (isAnalyzing) return;
    
    setIsAnalyzing(true);
    showToast('正在分析...', 'info', 2000);

    try {
      // 导入 AI 分析器
      const { getDefaultAnalyzer } = await import('../../../utils/aiAnalyzer');
      const analyzer = await getDefaultAnalyzer();

      // 调用 AI 分析
      const pageContent = {
        url: url || bookmark.url,
        title: title || bookmark.title,
        description: summary || '',
      };

      const analysis = await analyzer.analyzeBookmark(pageContent, { existingFolders: [] });

      if (!analysis) {
        throw new Error('AI 分析失败');
      }

      // 更新摘要和标签
      const aiSummary = analysis.summary || '';
      const aiTags = analysis.tags || [];

      setSummary(aiSummary);
      
      // 如果用户还没有添加标签，使用 AI 标签
      if (userTags.length === 0 && aiTags.length > 0) {
        setUserTags(aiTags);
      }

      showToast('AI 分析完成！', 'success', 2000);
    } catch (error) {
      console.error('[EditDialog] AI analyze failed:', error);
      showToast('AI 分析失败: ' + (error as Error).message, 'error', 3000);
    } finally {
      setIsAnalyzing(false);
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

          {/* 文件夹路径（智能选择器） */}
          <div className="form-group">
            <label>
              <FolderTree size={16} />
              {t('sidebar.editDialog.fields.folder')}
            </label>
            <FolderSelector
              value={folderPath}
              onChange={setFolderPath}
              existingFolders={existingFolders}
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
            <label style={{ marginBottom: 'var(--space-sm)' }}>
              <Sparkles size={16} />
              {t('sidebar.editDialog.fields.summary')}
              <button
                className={`ai-analyze-button ${isAnalyzing ? 'analyzing' : ''}`}
                onClick={handleAIAnalyze}
                disabled={isAnalyzing}
                title={isAnalyzing ? '分析中...' : 'AI 智能分析'}
                type="button"
                style={{
                  marginLeft: '10px',
                  padding: '4px 8px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--accent-primary)',
                  borderRadius: '6px',
                  cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  opacity: isAnalyzing ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                  verticalAlign: 'middle',
                }}
                onMouseEnter={(e) => {
                  if (!isAnalyzing) {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAnalyzing) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <Wand2 
                  size={13} 
                  className={isAnalyzing ? 'spinning' : ''} 
                  style={{ flexShrink: 0, color: 'var(--accent-primary)', stroke: 'var(--accent-primary)', fill: 'none' }}
                />
                <span style={{ lineHeight: 1 }}>{isAnalyzing ? '分析中' : 'AI分析'}</span>
              </button>
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

export default EditDialog;
