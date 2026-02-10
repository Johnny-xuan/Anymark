/**
 * 在页面上显示浮动提示 Toast
 */

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SHOW_TOAST') {
    showToast(message.data);
  }
});

interface ToastOptions {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}

function showToast(options: ToastOptions) {
  const { message, type = 'success', duration = 3000 } = options;

  // 创建 Toast 容器
  const toast = document.createElement('div');
  toast.className = `smart-bookmarks-toast smart-bookmarks-toast-${type}`;
  
  // 图标
  const icon = document.createElement('span');
  icon.className = 'smart-bookmarks-toast-icon';
  icon.textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  
  // 消息文本
  const text = document.createElement('span');
  text.className = 'smart-bookmarks-toast-text';
  text.textContent = message;
  
  toast.appendChild(icon);
  toast.appendChild(text);
  
  // 添加到页面
  document.body.appendChild(toast);
  
  // 触发动画
  setTimeout(() => {
    toast.classList.add('smart-bookmarks-toast-show');
  }, 10);
  
  // 自动移除
  setTimeout(() => {
    toast.classList.remove('smart-bookmarks-toast-show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, duration);
}

// 注入样式
const style = document.createElement('style');
style.textContent = `
  .smart-bookmarks-toast {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 24px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: #333;
    opacity: 0;
    transform: translateX(100px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }

  .smart-bookmarks-toast-show {
    opacity: 1;
    transform: translateX(0);
  }

  .smart-bookmarks-toast-success {
    border-left: 4px solid #10b981;
  }

  .smart-bookmarks-toast-error {
    border-left: 4px solid #ef4444;
  }

  .smart-bookmarks-toast-info {
    border-left: 4px solid #3b82f6;
  }

  .smart-bookmarks-toast-icon {
    font-size: 20px;
    line-height: 1;
  }

  .smart-bookmarks-toast-text {
    line-height: 1.4;
    max-width: 300px;
  }
`;
document.head.appendChild(style);
