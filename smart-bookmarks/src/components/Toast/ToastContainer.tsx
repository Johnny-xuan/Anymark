/**
 * Toast 容器组件 - 管理多个 Toast 显示
 * 支持撤销功能和键盘快捷键 Cmd/Ctrl + Z
 */

import React, { useState, useCallback, useEffect } from 'react';
import Toast, { type ToastType } from './Toast';
import { getOperationHistoryService } from '../../utils/operationHistory';
import { useBookmarkStore } from '../../sidebar/store/bookmarkStore';
import './ToastContainer.css';

/**
 * 从 Chrome Storage 重新加载书签并更新 Zustand store
 * 这是撤销操作后刷新 UI 的关键函数
 */
async function reloadBookmarksToStore(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['bookmarks', 'folders']);
    const bookmarks = result.bookmarks || [];
    const folders = result.folders || [];
    
    // 直接更新 Zustand store
    const store = useBookmarkStore.getState();
    store.setBookmarks(bookmarks);
    store.setFolders(folders);
    
    console.log('[ToastContainer] Reloaded bookmarks to store:', bookmarks.length);
  } catch (error) {
    console.error('[ToastContainer] Failed to reload bookmarks:', error);
  }
}

export interface ToastItem {
  id: string;
  message: string;
  type?: ToastType;
  duration?: number;
  canUndo?: boolean;
  operationId?: string;
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

  // 撤销操作
  const handleUndo = useCallback(async () => {
    try {
      const historyService = getOperationHistoryService();
      const result = await historyService.undo();
      
      if (result.success) {
        // 关键：直接从 Chrome Storage 重新加载数据到 Zustand store
        // 这样 UI 才会正确更新
        await reloadBookmarksToStore();
        
        // 通知其他页面刷新（如果有的话）
        chrome.runtime.sendMessage({ type: 'BOOKMARKS_UPDATED' }).catch(() => {});
        return true;
      } else {
        console.error('[ToastContainer] Undo failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[ToastContainer] Undo error:', error);
      return false;
    }
  }, []);

  // 键盘快捷键 Cmd/Ctrl + Z
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Cmd+Z (Mac) 或 Ctrl+Z (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        // 检查是否在输入框中
        const activeElement = document.activeElement;
        const isInInput = activeElement instanceof HTMLInputElement ||
                          activeElement instanceof HTMLTextAreaElement ||
                          (activeElement as HTMLElement)?.isContentEditable;
        
        // 如果在输入框中，让浏览器处理默认的撤销行为
        if (isInInput) return;

        e.preventDefault();
        
        // 检查是否有可撤销的操作
        const historyService = getOperationHistoryService();
        if (!historyService.canUndo()) {
          // 显示提示
          const id = `toast-${Date.now()}-${Math.random()}`;
          setToasts((prev) => [...prev, { 
            id, 
            message: '没有可撤销的操作', 
            type: 'info', 
            duration: 2000,
            canUndo: false,
          }]);
          return;
        }

        const result = await historyService.undo();
        
        if (result.success) {
          // 关键：直接从 Chrome Storage 重新加载数据到 Zustand store
          await reloadBookmarksToStore();
          
          // 显示撤销成功的 Toast
          const id = `toast-${Date.now()}-${Math.random()}`;
          setToasts((prev) => [...prev, { 
            id, 
            message: result.message, 
            type: 'success', 
            duration: 3000,
            canUndo: false,
          }]);
          
          // 通知其他页面刷新（如果有的话）
          chrome.runtime.sendMessage({ type: 'BOOKMARKS_UPDATED' }).catch(() => {});
        } else {
          // 显示错误
          const id = `toast-${Date.now()}-${Math.random()}`;
          setToasts((prev) => [...prev, { 
            id, 
            message: result.error || '撤销失败', 
            type: 'error', 
            duration: 3000,
            canUndo: false,
          }]);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 暴露给外部调用的方法
  React.useEffect(() => {
    // @ts-ignore
    window.showToast = (message: string, type: ToastType = 'info', duration: number = 3000, canUndo: boolean = false) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, message, type, duration, canUndo }]);
    };

    // 新增：显示带撤销按钮的操作 Toast
    // @ts-ignore
    window.showOperationToast = (message: string, canUndo: boolean = true) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { 
        id, 
        message, 
        type: 'success', 
        duration: 5000, 
        canUndo,
      }]);
    };

    // 新增：显示带重试按钮的错误 Toast
    // @ts-ignore
    window.showErrorToast = (message: string, canRetry: boolean = false, retryAction?: () => Promise<void>) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { 
        id, 
        message, 
        type: canRetry ? 'warning' : 'error', 
        duration: canRetry ? 8000 : 5000, // 可重试的错误显示更长时间
        canUndo: false,
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
          canUndo={toast.canUndo}
          onUndo={toast.canUndo ? handleUndo : undefined}
          canRetry={toast.canRetry}
          onRetry={toast.retryAction}
        />
      ))}
    </div>
  );
};

export default ToastContainer;

// 工具函数
export const showToast = (message: string, type: ToastType = 'info', duration: number = 3000, canUndo: boolean = false) => {
  // @ts-ignore
  if (window.showToast) {
    // @ts-ignore
    window.showToast(message, type, duration, canUndo);
  } else {
    console.warn('[Toast] ToastContainer not mounted');
  }
};

// 显示带撤销按钮的操作 Toast
export const showOperationToast = (message: string, canUndo: boolean = true) => {
  // @ts-ignore
  if (window.showOperationToast) {
    // @ts-ignore
    window.showOperationToast(message, canUndo);
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
