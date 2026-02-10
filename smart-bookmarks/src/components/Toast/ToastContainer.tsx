/**
 * Toast 容器组件 - 管理多个 Toast 显示
 */

import React, { useState, useCallback } from 'react';
import Toast, { type ToastType } from './Toast';
import './ToastContainer.css';

export interface ToastItem {
  id: string;
  message: string;
  type?: ToastType;
  duration?: number;
  canRetry?: boolean;
  retryAction?: () => Promise<void>;
}

interface ToastContainerProps {
  position?: 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';
}

const ToastContainer: React.FC<ToastContainerProps> = ({ position = 'top-right' }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // 暴露给外部调用的方法
  React.useEffect(() => {
    // @ts-ignore
    window.showToast = (message: string, type: ToastType = 'info', duration: number = 3000) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, message, type, duration }]);
    };

    // 显示操作成功 Toast
    // @ts-ignore
    window.showOperationToast = (message: string) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, {
        id,
        message,
        type: 'success',
        duration: 3000,
      }]);
    };

    // 显示带重试按钮的错误 Toast
    // @ts-ignore
    window.showErrorToast = (message: string, canRetry: boolean = false, retryAction?: () => Promise<void>) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, {
        id,
        message,
        type: canRetry ? 'warning' : 'error',
        duration: canRetry ? 8000 : 5000,
        canRetry,
        retryAction,
      }]);
    };

    return () => {
      // @ts-ignore
      delete window.showToast;
      // @ts-ignore
      delete window.showOperationToast;
      // @ts-ignore
      delete window.showErrorToast;
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className={`toast-container toast-container-${position}`}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
          canRetry={toast.canRetry}
          onRetry={toast.retryAction}
        />
      ))}
    </div>
  );
};

export default ToastContainer;

// 工具函数
export const showToast = (message: string, type: ToastType = 'info', duration: number = 3000) => {
  // @ts-ignore
  if (window.showToast) {
    // @ts-ignore
    window.showToast(message, type, duration);
  } else {
    console.warn('[Toast] ToastContainer not mounted');
  }
};

// 显示操作成功 Toast
export const showOperationToast = (message: string) => {
  // @ts-ignore
  if (window.showOperationToast) {
    // @ts-ignore
    window.showOperationToast(message);
  } else {
    console.warn('[Toast] ToastContainer not mounted');
  }
};

// 显示带重试按钮的错误 Toast
export const showErrorToast = (message: string, canRetry: boolean = false, retryAction?: () => Promise<void>) => {
  // @ts-ignore
  if (window.showErrorToast) {
    // @ts-ignore
    window.showErrorToast(message, canRetry, retryAction);
  } else {
    console.warn('[Toast] ToastContainer not mounted');
    console.error(`[Error] ${message}`);
  }
};
