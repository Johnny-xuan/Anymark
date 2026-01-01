/**
 * 冲突解决对话框组件
 * 显示书签冲突并让用户选择解决方案
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookmarkConflict, ResolutionStrategy, ResolutionResult } from '../../../utils/chromeSyncCompat';
import './ConflictDialog.css';

interface ConflictDialogProps {
  isOpen: boolean;
  conflicts: BookmarkConflict[];
  onResolve: (conflicts: BookmarkConflict[]) => Promise<ResolutionResult>;
  onCancel: () => void;
}

type ApplyState = 'idle' | 'applying' | 'done';

export const ConflictDialog: React.FC<ConflictDialogProps> = ({
  isOpen,
  conflicts: initialConflicts,
  onResolve,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [conflicts, setConflicts] = useState<BookmarkConflict[]>(initialConflicts);
  const [applyState, setApplyState] = useState<ApplyState>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ResolutionResult | null>(null);

  // 同步外部冲突变化
  useEffect(() => {
    setConflicts(initialConflicts);
  }, [initialConflicts]);

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // 设置单个冲突的解决策略
  const setResolution = useCallback((conflictId: string, strategy: ResolutionStrategy) => {
    setConflicts(prev => prev.map(c => 
      c.id === conflictId ? { ...c, resolution: strategy } : c
    ));
  }, []);

  // 批量设置解决策略
  const setBatchResolution = useCallback((strategy: ResolutionStrategy | 'newer') => {
    setConflicts(prev => prev.map(c => ({
      ...c,
      resolution: strategy === 'newer' 
        ? (c.isNewer === 'chrome' ? 'use_chrome' : 'use_plugin')
        : strategy,
    })));
  }, []);

  // 应用解决方案
  const handleApply = useCallback(async () => {
    // 检查是否所有冲突都已选择解决策略
    const unresolved = conflicts.filter(c => !c.resolution);
    if (unresolved.length > 0) {
      alert(t('conflict.unresolvedWarning', { count: unresolved.length }));
      return;
    }

    setApplyState('applying');
    setProgress(0);

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const result = await onResolve(conflicts);
      
      clearInterval(progressInterval);
      setProgress(100);
      setResult(result);
      setApplyState('done');

      // 成功后自动关闭
      if (result.success) {
        setTimeout(() => {
          onCancel();
        }, 1500);
      }
    } catch (error) {
      setApplyState('idle');
      setResult({
        success: false,
        resolved: 0,
        failed: conflicts.length,
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }, [conflicts, onResolve, onCancel, t]);

  // 获取冲突类型显示文本
  const getConflictTypeText = (type: BookmarkConflict['conflictType']) => {
    switch (type) {
      case 'title': return t('conflict.type.title');
      case 'path': return t('conflict.type.path');
      case 'both': return t('conflict.type.both');
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // 计算摘要
  const getSummary = () => {
    const usePlugin = conflicts.filter(c => c.resolution === 'use_plugin').length;
    const useChrome = conflicts.filter(c => c.resolution === 'use_chrome').length;
    const keepBoth = conflicts.filter(c => c.resolution === 'keep_both').length;
    const unresolved = conflicts.filter(c => !c.resolution).length;

    const parts: string[] = [];
    if (usePlugin > 0) parts.push(t('conflict.summary.usePlugin', { count: usePlugin }));
    if (useChrome > 0) parts.push(t('conflict.summary.useChrome', { count: useChrome }));
    if (keepBoth > 0) parts.push(t('conflict.summary.keepBoth', { count: keepBoth }));
    if (unresolved > 0) parts.push(t('conflict.summary.unresolved', { count: unresolved }));

    return parts.join('，') || t('conflict.summary.none');
  };

  if (!isOpen) return null;

  return (
    <div className="conflict-dialog-overlay" onClick={onCancel}>
      <div className="conflict-dialog" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="conflict-dialog-header">
          <div className="conflict-dialog-title">
            <span className="icon">⚠️</span>
            {t('conflict.title', { count: conflicts.length })}
          </div>
          <button className="conflict-dialog-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        {/* 批量操作 */}
        {applyState === 'idle' && conflicts.length > 0 && (
          <div className="conflict-batch-actions">
            <span>{t('conflict.batchActions')}:</span>
            <button 
              className="batch-action-btn"
              onClick={() => setBatchResolution('use_plugin')}
            >
              {t('conflict.batch.useAllPlugin')}
            </button>
            <button 
              className="batch-action-btn"
              onClick={() => setBatchResolution('use_chrome')}
            >
              {t('conflict.batch.useAllChrome')}
            </button>
            <button 
              className="batch-action-btn"
              onClick={() => setBatchResolution('newer')}
            >
              {t('conflict.batch.useAllNewer')}
            </button>
            <button 
              className="batch-action-btn"
              onClick={() => setBatchResolution('keep_both')}
            >
              {t('conflict.batch.keepAllBoth')}
            </button>
          </div>
        )}

        {/* 冲突列表 */}
        <div className="conflict-list">
          {conflicts.length === 0 ? (
            <div className="conflict-empty">
              <span className="icon">✓</span>
              <span>{t('conflict.noConflicts')}</span>
            </div>
          ) : (
            conflicts.map(conflict => (
              <div key={conflict.id} className="conflict-item">
                {/* 冲突头部 */}
                <div className="conflict-item-header">
                  <span className="icon">📖</span>
                  <span className="conflict-item-title">
                    {conflict.pluginVersion.title || conflict.chromeVersion.title}
                  </span>
                  <span className="conflict-type-badge">
                    {getConflictTypeText(conflict.conflictType)}
                  </span>
                </div>
                <div className="conflict-item-url">{conflict.url}</div>

                {/* 版本对比 */}
                <div className="conflict-versions">
                  {/* 插件版本 */}
                  <div className={`version-card ${conflict.isNewer === 'plugin' ? 'newer' : ''}`}>
                    <div className="version-header">
                      <span className="version-label">{t('conflict.pluginVersion')}</span>
                      {conflict.isNewer === 'plugin' && (
                        <span className="newer-badge">⭐ {t('conflict.newer')}</span>
                      )}
                    </div>
                    <div className="version-detail">
                      <span className="version-detail-label">{t('conflict.field.title')}:</span>
                      <span className={`version-detail-value ${conflict.conflictType !== 'path' ? 'diff' : ''}`}>
                        {conflict.pluginVersion.title}
                      </span>
                    </div>
                    <div className="version-detail">
                      <span className="version-detail-label">{t('conflict.field.path')}:</span>
                      <span className={`version-detail-value ${conflict.conflictType !== 'title' ? 'diff' : ''}`}>
                        {conflict.pluginVersion.folderPath}
                      </span>
                    </div>
                    <div className="version-detail">
                      <span className="version-detail-label">{t('conflict.field.time')}:</span>
                      <span className="version-detail-value">
                        {formatTime(conflict.pluginVersion.updateTime)}
                      </span>
                    </div>
                  </div>

                  {/* Chrome 版本 */}
                  <div className={`version-card ${conflict.isNewer === 'chrome' ? 'newer' : ''}`}>
                    <div className="version-header">
                      <span className="version-label">{t('conflict.chromeVersion')}</span>
                      {conflict.isNewer === 'chrome' && (
                        <span className="newer-badge">⭐ {t('conflict.newer')}</span>
                      )}
                    </div>
                    <div className="version-detail">
                      <span className="version-detail-label">{t('conflict.field.title')}:</span>
                      <span className={`version-detail-value ${conflict.conflictType !== 'path' ? 'diff' : ''}`}>
                        {conflict.chromeVersion.title}
                      </span>
                    </div>
                    <div className="version-detail">
                      <span className="version-detail-label">{t('conflict.field.path')}:</span>
                      <span className={`version-detail-value ${conflict.conflictType !== 'title' ? 'diff' : ''}`}>
                        {conflict.chromeVersion.folderPath}
                      </span>
                    </div>
                    <div className="version-detail">
                      <span className="version-detail-label">{t('conflict.field.time')}:</span>
                      <span className="version-detail-value">
                        {formatTime(conflict.chromeVersion.updateTime)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 解决选项 */}
                {applyState === 'idle' && (
                  <div className="conflict-resolution">
                    <label className="resolution-option">
                      <input
                        type="radio"
                        name={`resolution-${conflict.id}`}
                        checked={conflict.resolution === 'use_plugin'}
                        onChange={() => setResolution(conflict.id, 'use_plugin')}
                      />
                      {t('conflict.option.usePlugin')}
                    </label>
                    <label className="resolution-option">
                      <input
                        type="radio"
                        name={`resolution-${conflict.id}`}
                        checked={conflict.resolution === 'use_chrome'}
                        onChange={() => setResolution(conflict.id, 'use_chrome')}
                      />
                      {t('conflict.option.useChrome')}
                    </label>
                    <label className="resolution-option">
                      <input
                        type="radio"
                        name={`resolution-${conflict.id}`}
                        checked={conflict.resolution === 'keep_both'}
                        onChange={() => setResolution(conflict.id, 'keep_both')}
                      />
                      {t('conflict.option.keepBoth')}
                    </label>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 进度条 */}
        {applyState === 'applying' && (
          <div className="conflict-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">{t('conflict.applying')}...</span>
          </div>
        )}

        {/* 结果显示 */}
        {applyState === 'done' && result && (
          <div className="conflict-progress">
            <span className="progress-text">
              {result.success 
                ? t('conflict.result.success', { count: result.resolved })
                : t('conflict.result.partial', { resolved: result.resolved, failed: result.failed })
              }
            </span>
          </div>
        )}

        {/* 底部 */}
        {applyState === 'idle' && (
          <div className="conflict-dialog-footer">
            <div className="conflict-summary">{getSummary()}</div>
            <div className="conflict-dialog-actions">
              <button className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
                {t('common.cancel')}
              </button>
              <button 
                className="dialog-btn dialog-btn-apply"
                onClick={handleApply}
                disabled={conflicts.some(c => !c.resolution)}
              >
                {t('conflict.apply')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConflictDialog;
