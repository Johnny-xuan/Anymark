/**
 * 浮动按钮 - 快速打开侧边栏
 */

let floatingButton: HTMLElement | null = null;
let isDragging = false;
let currentX = 0;
let currentY = 0;
let initialX = 0;
let initialY = 0;

// 创建浮动按钮
function createFloatingButton() {
  if (floatingButton) return;

  floatingButton = document.createElement('div');
  floatingButton.id = 'smart-bookmarks-floating-btn';
  floatingButton.title = '打开 AnyMark - 收藏自由 侧边栏';
  floatingButton.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
    </svg>
  `;
  
  // 样式
  Object.assign(floatingButton.style, {
    position: 'fixed',
    bottom: '80px',
    right: '20px',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    boxShadow: '0 4px 12px rgba(14, 165, 233, 0.4)',
    zIndex: '2147483647',
    transition: 'all 0.3s ease',
    opacity: '0.9',
    userSelect: 'none',
  });

  // 点击事件 - 发消息给 background 打开侧边栏
  floatingButton.addEventListener('click', (e) => {
    if (isDragging) return;
    
    e.stopPropagation();
    
    // 发送消息给 background script
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Floating Button] Failed to send message:', chrome.runtime.lastError);
      }
    });
  });

  // 拖拽功能
  floatingButton.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  // 悬停效果
  floatingButton.addEventListener('mouseenter', () => {
    if (floatingButton && !isDragging) {
      floatingButton.style.transform = 'scale(1.1)';
      floatingButton.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.6)';
      floatingButton.style.opacity = '1';
    }
  });

  floatingButton.addEventListener('mouseleave', () => {
    if (floatingButton && !isDragging) {
      floatingButton.style.transform = 'scale(1)';
      floatingButton.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
      floatingButton.style.opacity = '0.9';
    }
  });

  document.body.appendChild(floatingButton);
}

// 拖拽开始
function dragStart(e: MouseEvent) {
  if (e.button !== 0) return; // 只响应左键
  
  initialX = e.clientX - currentX;
  initialY = e.clientY - currentY;
  
  if (e.target === floatingButton) {
    isDragging = true;
    if (floatingButton) {
      floatingButton.style.cursor = 'grabbing';
      floatingButton.style.transition = 'none';
    }
  }
}

// 拖拽中
function drag(e: MouseEvent) {
  if (!isDragging || !floatingButton) return;
  
  e.preventDefault();
  
  currentX = e.clientX - initialX;
  currentY = e.clientY - initialY;
  
  // 限制在视口内
  const maxX = window.innerWidth - 56;
  const maxY = window.innerHeight - 56;
  
  currentX = Math.max(0, Math.min(currentX, maxX));
  currentY = Math.max(0, Math.min(currentY, maxY));
  
  floatingButton.style.left = currentX + 'px';
  floatingButton.style.top = currentY + 'px';
  floatingButton.style.right = 'auto';
  floatingButton.style.bottom = 'auto';
}

// 拖拽结束
function dragEnd() {
  if (!floatingButton) return;
  
  initialX = currentX;
  initialY = currentY;
  
  if (isDragging) {
    floatingButton.style.cursor = 'grab';
    floatingButton.style.transition = 'all 0.3s ease';
    
    // 延迟重置拖拽状态，防止触发点击
    setTimeout(() => {
      isDragging = false;
    }, 100);
  }
}

// 初始化
createFloatingButton();

console.log('[AnyMark - 收藏自由] Floating button initialized and visible');
