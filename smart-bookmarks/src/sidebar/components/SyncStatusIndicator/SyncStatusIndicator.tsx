/**
 * 同步状态指示器组件
 * 显示 Chrome 书签同步状态，点击可打开冲突解决对话框
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SyncStatus } from '../../../utils/chromeSyncCompat';
import './SyncStatusIndicator.css';

export type SyncStatusType = SyncStatus['status'] | 'disabled';

interface SyncStatusIndicatorProps {
  /** 同步状态 */
  status: SyncStatusType;
  /** 冲突数量 */
  conflictCount?: number;
  /** 点击回调 */
  onClick?: () => void;
  /** 是否紧凑模式 */
  compact?: boolean;
  /** 是否仅显示图标 */
  iconOnly?: boolean;
  /** 自定义类名 */
  className?: string;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  status,
  conflictCount = 0,
  onClick,
  compact = false,
  iconOnly = false,
  className = '',
}) => {
  const { t } = useTranslation();

  // 获取状态图标
  const getIcon = () => {
    switch (status) {
      case 'synced': return '✓';
      case 'syncing': return '↻';
      case 'has_conflicts': return '⚠️';
      case 'error': return '✗';
      case 'disabled': return '○';
      default: return '?';
    }
  };

  // 获取状态文本
  const getText = () => {
    switch (status) {
      case 'synced': return t('sync.status.synced');
      case 'syncing': return t('sync.status.syncing');
      case 'has_conflicts': return t('sync.status.hasConflicts');
      case 'error': return t('sync.status.error');
      case 'disabled': return t('sync.status.disabled');
      default: return '';
    }
  };

  // 获取工具提示
  const getTooltip = () => {
    switch (status) {
      case 'synced': return t('sync.tooltip.synced');
      case 'syncing': return t('sync.tooltip.syncing');
      case 'has_conflicts': return t('sync.tooltip.hasConflicts', { count: conflictCount });
      case 'error': return t('sync.tooltip.error');
      case 'disabled': return t('sync.tooltip.disabled');
      default: return '';
    }
  };

  const classNames = [
    'sync-status-indicator',
    status,
    compact ? 'compact' : '',
    iconOnly ? 'icon-only' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      onClick={status !== 'disabled' ? onClick : undefined}
      title={getTooltip()}
      role="button"
      tabIndex={status !== 'disabled' ? 0 : -1}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (status !== 'disabled' && onClick) {
            onClick();
          }
        }
      }}
    >
      <span className={`sync-status-icon ${status === 'syncing' ? 'spinning' : ''}`}>
        {getIcon()}
      </span>
      {!iconOnly && (
        <>
          <span className="sync-status-text">{getText()}</span>
          {status === 'has_conflicts' && conflictCount > 0 && (
            <span className="sync-conflict-badge">{conflictCount}</span>
          )}
        </>
      )}
    </div>
  );
};

export default SyncStatusIndicator;
