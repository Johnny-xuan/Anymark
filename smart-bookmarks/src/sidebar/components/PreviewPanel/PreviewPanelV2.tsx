/**
 * 预览面板组件 V2 - 适配新架构
 * 显示书签详情和AI摘要
 */

import React, { useState } from 'react';
import {
  Globe,
  Activity,
  Tags,
  Zap,
  ExternalLink,
  Edit2,
  Copy,
  Clock,
  Calendar,
  TrendingUp,
  ChevronRight,
  Folder,
  Star,
  Trash2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../../i18n/config';
import { useBookmarkStoreV2 } from '../../store/bookmarkStoreV2';
import { showToast } from '../../../components/Toast/ToastContainer';
import { getOptimizedFaviconUrl } from '../../../utils/faviconUtils';
import PixelBuddyIcon from '../PixelBuddyIcon/PixelBuddyIcon';
import EditDialog from '../EditDialog/EditDialog';
import type { MergedBookmark } from '../../../types/chromeBookmark';
import './PreviewPanel.css';

const PreviewPanelV2: React.FC = () => {
  const { t } = useTranslation();
  const { 
    selectedId, 
    getBookmarkById,
    updateBookmark,
    deleteBookmark,
    restoreBookmark,
    currentFilter,
    updateMetadata,
    toggleStarred,
    recordVisit,
  } = useBookmarkStoreV2();
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const bookmark = selectedId ? getBookmarkById(selectedId) : null;

  // Reset favicon error when bookmark changes
  React.useEffect(() => {
    setFaviconError(false);
  }, [selectedId]);

  if (!bookmark) {
    return (
      <div className="preview-panel">
        <div className="preview-empty">
          <PixelBuddyIcon size={48} animated />
          <p>{t('sidebar.preview.noSelection')}</p>
          <p className="empty-hint">
            {t('sidebar.preview.selectHint')}
          </p>
        </div>
      </div>
    );
  }

  // 获取面包屑路径（从 parentId 构建）
  const getBreadcrumbs = () => {
    // 简化版：只显示根目录
    return [{ name: t('sidebar.preview.breadcrumb.root'), path: '/' }];
  };

  const breadcrumbs = getBreadcrumbs();

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('sidebar.preview.time.justNow');
    if (minutes < 60) return t('sidebar.preview.time.minutesAgo', { count: minutes });
    if (hours < 24) return t('sidebar.preview.time.hoursAgo', { count: hours });
    if (days < 30) return t('sidebar.preview.time.daysAgo', { count: days });
    return new Date(timestamp).toLocaleDateString();
  };

  const handleOpen = async () => {
    await chrome.tabs.create({ url: bookmark.url });
    // 更新访问统计
    await recordVisit(bookmark.chromeId);
  };

  const handleEdit = () => {
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async (updates: any) => {
    try {
      // 更新标题
      if (updates.title && updates.title !== bookmark.title) {
        await updateBookmark(bookmark.chromeId, { title: updates.title });
      }
      
      // 更新元数据
      const metadataUpdates: any = {};
      if (updates.userTags !== undefined) metadataUpdates.userTags = updates.userTags;
      if (updates.userNotes !== undefined) metadataUpdates.userNotes = updates.userNotes;
      if (updates.starred !== undefined) metadataUpdates.starred = updates.starred;
      
      if (Object.keys(metadataUpdates).length > 0) {
        await updateMetadata(bookmark.chromeId, metadataUpdates);
      }
      
      showToast(t('sidebar.preview.messages.updated'), 'success', 2000);
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error('[PreviewPanelV2] Failed to save edit:', error);
      showToast('保存失败', 'error', 2000);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(bookmark.url);
    showToast(t('sidebar.preview.messages.urlCopied'), 'success', 2000);
  };

  const handleToggleStar = async () => {
    await toggleStarred(bookmark.chromeId);
    showToast(
      !bookmark.starred ? t('sidebar.preview.messages.starred') : t('sidebar.preview.messages.unstarred'),
      'success',
      2000
    );
  };

  const handleDelete = async () => {
    if (currentFilter === 'trash') {
      // 在回收站中，恢复书签
      const action = window.confirm(t('sidebar.preview.messages.confirmRestore'));
      if (action) {
        await restoreBookmark(bookmark.chromeId);
        showToast(t('sidebar.preview.messages.restored'), 'success', 2000);
      }
    } else {
      // 不在回收站，软删除
      const confirmed = window.confirm(t('sidebar.preview.messages.confirmDelete', { title: bookmark.title }));
      if (confirmed) {
        await deleteBookmark(bookmark.chromeId);
        showToast(t('sidebar.preview.messages.deleted'), 'success', 2000);
      }
    }
  };

  // AI 重新分析
  const handleReanalyze = async () => {
    if (isAnalyzing) return;
    
    setIsAnalyzing(true);
    showToast(t('sidebar.preview.ai.startAnalyzing'), 'info', 2000);

    try {
      // 导入 AI 分析器
      const { getDefaultAnalyzer } = await import('../../../utils/aiAnalyzer');
      const analyzer = await getDefaultAnalyzer();

      // 调用 AI 分析
      const pageContent = {
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.aiSummary || bookmark.userNotes || '',
      };

      const analysis = await analyzer.analyzeBookmark(pageContent, { existingFolders: [] });

      if (!analysis) {
        throw new Error(t('sidebar.preview.ai.analyzeEmpty'));
      }

      // 安全的属性访问，提供默认值
      const safeAnalysis = {
        summary: analysis.summary || t('sidebar.preview.ai.noAnalysis'),
        tags: analysis.tags || [],
        confidence: analysis.confidence || 0.5,
      };

      // 更新书签元数据
      await updateMetadata(bookmark.chromeId, {
        aiSummary: safeAnalysis.summary,
        aiTags: safeAnalysis.tags,
        aiConfidence: Math.round(safeAnalysis.confidence * 100),
      });

      showToast(t('sidebar.preview.ai.analyzeComplete'), 'success', 3000);
    } catch (error) {
      console.error('[PreviewPanelV2] Analyze failed:', error);
      showToast(t('sidebar.preview.ai.analyzeFailed', { error: (error as Error).message }), 'error', 3000);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 获取 favicon URL
  const faviconUrl = bookmark.url ? 
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(bookmark.url).hostname)}&sz=32` : 
    undefined;

  return (
    <div className="preview-panel">
      <div className="preview-content">
        {/* 面包屑路径 */}
        <div className="preview-breadcrumb chrome-view">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.path}>
              <div className="breadcrumb-item">
                {index === 0 && <Folder size={14} />}
                <span className="breadcrumb-text">{crumb.name}</span>
              </div>
              {index < breadcrumbs.length - 1 && (
                <ChevronRight size={14} className="breadcrumb-separator" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* 头部信息 */}
        <div className="preview-header">
          <div className="header-icon">
            {faviconUrl && !faviconError ? (
              <img
                src={faviconUrl}
                alt=""
                className="header-favicon"
                onError={() => setFaviconError(true)}
              />
            ) : (
              <Globe size={24} strokeWidth={1.5} />
            )}
          </div>
          <div className="header-info">
            <h2 className="header-title">
              {bookmark.title}
            </h2>
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="header-url"
              onClick={(e) => e.preventDefault()}
            >
              {bookmark.url}
            </a>
          </div>
        </div>

        {/* 快捷操作按钮 */}
        <div className="preview-actions">
          <button className="action-button primary" onClick={handleOpen}>
            <ExternalLink size={16} />
            {t('sidebar.preview.actions.open')}
          </button>
          <button className="action-button" onClick={handleEdit}>
            <Edit2 size={16} />
            {t('sidebar.preview.actions.edit')}
          </button>
          <button className="action-button" onClick={handleToggleStar}>
            <Star size={16} fill={bookmark.starred ? 'currentColor' : 'none'} />
            {bookmark.starred ? t('sidebar.preview.actions.unstar') : t('sidebar.preview.actions.star')}
          </button>
          <button className="action-button" onClick={handleCopyUrl}>
            <Copy size={16} />
            {t('sidebar.preview.actions.copyUrl')}
          </button>
          <button 
            className="action-button" 
            onClick={handleDelete}
            style={{ color: currentFilter === 'trash' ? 'var(--accent-primary)' : 'var(--status-error)' }}
          >
            <Trash2 size={16} />
            {currentFilter === 'trash' ? t('sidebar.preview.actions.restore') : t('sidebar.preview.actions.delete')}
          </button>
        </div>

        {/* 摘要 */}
        <div className="preview-section">
          <div className="section-header">
            <Sparkles size={18} strokeWidth={1.5} />
            <h3>{t('sidebar.preview.sections.summary')}</h3>
            <button
              className={`reanalyze-button ${isAnalyzing ? 'analyzing' : ''}`}
              onClick={handleReanalyze}
              disabled={isAnalyzing}
              title={isAnalyzing ? t('sidebar.preview.ai.analyzing') : t('sidebar.preview.ai.reanalyze')}
            >
              <RefreshCw size={14} className={isAnalyzing ? 'spinning' : ''} />
              {isAnalyzing ? t('sidebar.preview.ai.analyzing') : t('sidebar.preview.ai.reanalyze')}
            </button>
          </div>
          {bookmark.aiSummary ? (
            <div className="summary-content">
              <p>{bookmark.aiSummary}</p>
            </div>
          ) : (
            <div className="summary-empty">
              <p>{t('sidebar.preview.ai.noAnalysis')}</p>
              <button className="analyze-now-button" onClick={handleReanalyze} disabled={isAnalyzing}>
                <Sparkles size={14} />
                {t('sidebar.preview.ai.analyzeNow')}
              </button>
            </div>
          )}
        </div>

        {/* 统计信息 */}
        <div className="preview-section">
          <div className="section-header">
            <Activity size={18} strokeWidth={1.5} />
            <h3>{t('sidebar.preview.sections.statistics')}</h3>
          </div>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-icon">
                <TrendingUp size={16} />
              </div>
              <div className="stat-info">
                <div className="stat-label">{t('sidebar.preview.stats.visits')}</div>
                <div className="stat-value">
                  {t('sidebar.preview.stats.visitsTimes', { count: bookmark.analytics.visitCount })}
                </div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">
                <Clock size={16} />
              </div>
              <div className="stat-info">
                <div className="stat-label">{t('sidebar.preview.stats.lastVisit')}</div>
                <div className="stat-value">
                  {bookmark.analytics.lastVisit
                    ? formatTime(bookmark.analytics.lastVisit)
                    : t('sidebar.preview.stats.never')}
                </div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">
                <Calendar size={16} />
              </div>
              <div className="stat-info">
                <div className="stat-label">{t('sidebar.preview.stats.created')}</div>
                <div className="stat-value">
                  {formatTime(bookmark.dateAdded)}
                </div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">
                <Zap size={16} />
              </div>
              <div className="stat-info">
                <div className="stat-label">{t('sidebar.preview.stats.importance')}</div>
                <div className="stat-value">
                  <div className="importance-bar">
                    <div
                      className="importance-fill"
                      style={{
                        width: `${bookmark.analytics.importance}%`,
                      }}
                    />
                  </div>
                  {bookmark.analytics.importance}/100
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 标签 */}
        {((bookmark.userTags && bookmark.userTags.length > 0) || (bookmark.aiTags && bookmark.aiTags.length > 0)) && (
          <div className="preview-section">
            <div className="section-header">
              <Tags size={18} strokeWidth={1.5} />
              <h3>{t('sidebar.preview.sections.tags')}</h3>
            </div>
            <div className="tags-container">
              {bookmark.userTags?.map((tag) => (
                <span key={tag} className="tag user-tag">
                  {tag}
                </span>
              ))}
              {bookmark.aiTags?.map((tag) => (
                <span key={tag} className="tag ai-tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 快捷键提示 */}
        <div className="preview-shortcuts">
          <div className="shortcut-item">
            <kbd>Enter</kbd>
            <span>{t('sidebar.preview.shortcuts.open')}</span>
          </div>
          <div className="shortcut-item">
            <kbd>O</kbd>
            <span>{t('sidebar.preview.shortcuts.newTab')}</span>
          </div>
          <div className="shortcut-item">
            <kbd>Y</kbd>
            <span>{t('sidebar.preview.shortcuts.copyUrl')}</span>
          </div>
          <div className="shortcut-item">
            <kbd>S</kbd>
            <span>{bookmark.starred ? t('sidebar.preview.shortcuts.unstar') : t('sidebar.preview.shortcuts.star')}</span>
          </div>
          <div className="shortcut-item">
            <kbd>D</kbd>
            <span>{currentFilter === 'trash' ? t('sidebar.preview.shortcuts.restore') : t('sidebar.preview.shortcuts.delete')}</span>
          </div>
        </div>
      </div>

      {/* 编辑对话框 */}
      <EditDialog
        bookmark={bookmark as any}
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSave={handleSaveEdit}
      />
    </div>
  );
};

export default PreviewPanelV2;
