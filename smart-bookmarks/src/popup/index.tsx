/**
 * Popup入口文件
 * 根据 URL 参数决定显示菜单还是详细保存面板
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import Popup from './Popup';
import PopupMenu from './PopupMenu';
import '../styles/globals.css';

console.log('[Popup Entry] Script loaded');

// 检查 URL 参数，决定显示哪个组件
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode') || 'menu'; // 默认菜单模式

console.log('[Popup Entry] Mode:', mode);

// 设置 data-mode 属性，用于 CSS 样式控制
document.documentElement.setAttribute('data-mode', mode);

const root = document.getElementById('root');

if (root) {
  try {
    // mode=detailed 显示详细保存面板，否则显示菜单
    const Component = mode === 'detailed' ? Popup : PopupMenu;
    
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <Component />
      </React.StrictMode>
    );
    console.log('[Popup Entry] Rendered:', mode === 'detailed' ? 'Popup' : 'PopupMenu');
  } catch (error) {
    console.error('[Popup Entry] Failed to render:', error);
  }
} else {
  console.error('[Popup Entry] Root element not found!');
}
