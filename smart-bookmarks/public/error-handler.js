// 全局错误捕获
window.addEventListener('error', function(e) {
  console.error('[Global Error]', e.message, e.filename, e.lineno, e.colno, e.error);
  const root = document.getElementById('root');
  if (root && !root.innerHTML) {
    root.innerHTML = 
      '<div class="error-container">' +
        '<h3>❌ 加载失败</h3>' +
        '<p><strong>错误信息:</strong> ' + e.message + '</p>' +
        '<p><strong>文件:</strong> ' + e.filename + '</p>' +
        '<p><strong>行号:</strong> ' + e.lineno + ':' + e.colno + '</p>' +
        '<pre>' + (e.error ? e.error.stack : '无详细信息') + '</pre>' +
        '<hr />' +
        '<p><strong>解决方案:</strong></p>' +
        '<ol>' +
          '<li>重新加载扩展（chrome://extensions/）</li>' +
          '<li>检查控制台是否有更多错误信息</li>' +
          '<li>尝试清除缓存后重试</li>' +
        '</ol>' +
      '</div>';
  }
});

window.addEventListener('unhandledrejection', function(e) {
  console.error('[Unhandled Promise Rejection]', e.reason);
});

console.log('[Sidebar HTML] Page loaded');
console.log('[Sidebar HTML] Chrome API available:', typeof chrome !== 'undefined');
