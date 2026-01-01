/**
 * React错误边界组件
 * 捕获组件树中的JavaScript错误，显示友好的错误界面
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught an error:', error, errorInfo);
    
    // 记录错误到控制台和Chrome Storage（如果可用）
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: Date.now(),
    };
    
    console.error('[ErrorBoundary] Error details:', errorDetails);
    
    // 调用自定义错误回调
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // 可选：将错误信息保存到Chrome Storage用于调试
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['errorLog']).then(result => {
        const errorLog = (result.errorLog || []) as Array<any>;
        errorLog.push(errorDetails);
        // 只保留最近50条错误
        const trimmedLog = errorLog.slice(-50);
        chrome.storage.local.set({ errorLog: trimmedLog });
      }).catch(err => {
        console.warn('[ErrorBoundary] Failed to save error to storage:', err);
      });
    }
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // 如果提供了自定义fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误UI
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-icon">
              <AlertCircle size={48} />
            </div>
            <h2 className="error-title">
              {this.props.children.type?.displayName 
                ? `${this.props.children.type.displayName} 出错` 
                : '组件出错'}
            </h2>
            <p className="error-message">
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <p className="error-hint">
              您可以尝试刷新页面或重试操作
            </p>
            <div className="error-actions">
              <button 
                className="error-button primary"
                onClick={this.handleRetry}
              >
                <RefreshCw size={16} />
                重试
              </button>
              <button 
                className="error-button"
                onClick={() => window.location.reload()}
              >
                刷新页面
              </button>
            </div>
            <details className="error-details">
              <summary>查看详细信息</summary>
              <pre>
                {this.state.error?.stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
