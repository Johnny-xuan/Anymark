/**
 * Sidebar入口文件
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import Sidebar from './Sidebar';
import '../styles/globals.css';

console.log('[Sidebar Entry] Script loaded');
console.log('[Sidebar Entry] Document ready state:', document.readyState);
console.log('[Sidebar Entry] Chrome API available:', typeof chrome !== 'undefined');
console.log('[Sidebar Entry] chrome.storage available:', typeof chrome !== 'undefined' && chrome.storage !== undefined);

const root = document.getElementById('root');

console.log('[Sidebar Entry] Root element:', root);

if (root) {
  try {
    console.log('[Sidebar Entry] Creating React root and rendering...');
    ReactDOM.createRoot(root).render(
      <Sidebar />
    );
    console.log('[Sidebar Entry] React render called successfully');
  } catch (error) {
    console.error('[Sidebar Entry] Failed to render:', error);
    // 显示错误信息在页面上
    root.innerHTML = `
      <div style="color: #ff5555; padding: 20px; font-family: monospace;">
        <h3>Render Failed</h3>
        <pre>${error instanceof Error ? error.message : String(error)}</pre>
        <pre>${error instanceof Error && error.stack ? error.stack : ''}</pre>
      </div>
    `;
  }
} else {
  console.error('[Sidebar Entry] Root element not found!');
  document.body.innerHTML = '<div style="color: red;">Root element not found</div>';
}
