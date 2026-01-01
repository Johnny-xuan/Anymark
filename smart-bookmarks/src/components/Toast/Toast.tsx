/**
 * Toast 提示组件
 * 支持撤销按钮、重试按钮和进度条
 */

import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, AlertCircle, X, Undo2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
  canUndo?: boolean;
  onUndo?: () => Promise<void>;
  canRetry?: boolean;
  onRetry?: () => Promise<void>;
}

const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 3000,
  onClose,
  canUndo = false,
  onUndo,
  canRetry = false,
  onRetry,
}) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(100);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [undoSuccess, setUndoSuccess] = useState(false);
  const [retrySuccess, setRetrySuccess] = useState(false);

  useEffect(() => {
    if (duration > 0 && !undoSuccess && !retrySuccess) {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
        setProgress(remaining);

        if (remaining <= 0) {
          clearInterval(interval);
          onClose?.();
        }
      }, 50);

      return () => clearInterval(interval);
    }
  }, [duration, onClose, undoSuccess, retrySuccess]);

  const handleUndo = useCallback(async () => {
    if (!canUndo || isUndoing || !onUndo) return;

    setIsUndoing(true);
    try {
      await onUndo();
      setUndoSuccess(true);
      // 2秒后自动关闭
      setTimeout(() => {
        onClose?.();
      }, 2000);
    } catch (error) {
      console.error('[Toast] Undo failed:', error);
    } finally {
      setIsUndoing(false);
    }
  }, [canUndo, isUndoing, onUndo, onClose]);

  const handleRetry = useCallback(async () => {
    if (!canRetry || isRetrying || !onRetry) return;

    setIsRetrying(true);
    try {
      await onRetry();
      setRetrySuccess(true);
      // 2秒后自动关闭
      setTimeout(() => {
        onClose?.();
      }, 2000);
    } catch (error) {
      console.error('[Toast] Retry failed:', error);
    } finally {
      setIsRetrying(false);
    }
  }, [canRetry, isRetrying, onRetry, onClose]);

  const getIcon = () => {
    if (undoSuccess || retrySuccess) {
      return <CheckCircle2 size={20} />;
    }
    switch (type) {
      case 'success':
        return <CheckCircle2 size={20} />;
      case 'error':
        return <XCircle size={20} />;
      case 'warning':
        return <AlertCircle size={20} />;
      default:
        return <Info size={20} />;
    }
  };

  const getDisplayMessage = () => {
    if (undoSuccess) return t('toast.undoSuccess', '已撤销');
    if (retrySuccess) return t('toast.retrySuccess', '重试成功');
    return message;
  };

  return (
    <div className={`toast toast-${type} ${undoSuccess || retrySuccess ? 'toast-undo-success' : ''}`}>
      <div className="toast-icon">{getIcon()}</div>
      <div className="toast-message">
        {getDisplayMessage()}
      </div>
      <div className="toast-actions">
        {canRetry && !undoSuccess && !retrySuccess && (
          <button 
            className="toast-retry-button" 
            onClick={handleRetry}
            disabled={isRetrying}
            title={t('toast.retry', '重试')}
          >
            {isRetrying ? (
              <span className="retry-loading">...</span>
            ) : (
              <>
                <RefreshCw size={14} />
                <span>{t('toast.retry', '重试')}</span>
              </>
            )}
          </button>
        )}
        {canUndo && !undoSuccess && !retrySuccess && (
          <button 
            className="toast-undo-button" 
            onClick={handleUndo}
            disabled={isUndoing}
            title={t('toast.undo', '撤销')}
          >
            {isUndoing ? (
              <span className="undo-loading">...</span>
            ) : (
              <>
                <Undo2 size={14} />
                <span>{t('toast.undo', '撤销')}</span>
              </>
            )}
          </button>
        )}
        <button className="toast-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {/* 进度条 */}
      {!undoSuccess && !retrySuccess && duration > 0 && (
        <div className="toast-progress">
          <div 
            className="toast-progress-bar" 
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default Toast;
