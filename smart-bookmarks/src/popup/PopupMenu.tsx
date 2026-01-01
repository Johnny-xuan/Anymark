/**
 * Popup 菜单 - 点击扩展图标时显示
 * 与侧边栏风格一致的简洁菜单
 */

import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  PanelLeftOpen,
  Settings,
  ExternalLink,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../i18n/config';
import './PopupMenu.css';

const PopupMenu: React.FC = () => {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // 初始化主题 - 从 chrome.storage 同步
  useEffect(() => {
    const loadTheme = async () => {
      try {
        // 优先从 chrome.storage 读取（与 sidebar 同步）
        const result = await chrome.storage.local.get('theme');
        const savedTheme = result.theme as 'light' | 'dark' | undefined;
        
        // 如果 storage 没有，尝试 localStorage
        const localTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
        
        const initialTheme = savedTheme || localTheme || 'dark';
        setTheme(initialTheme);
        document.documentElement.setAttribute('data-theme', initialTheme);
      } catch (e) {
        console.warn('[PopupMenu] Failed to load theme:', e);
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    };
    loadTheme();
  }, []);

  // 切换主题 - 同步到 chrome.storage 和 localStorage
  const handleToggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // 同步到两个存储
    localStorage.setItem('theme', newTheme);
    try {
      await chrome.storage.local.set({ theme: newTheme });
    } catch (e) {
      console.warn('[PopupMenu] Failed to save theme to storage:', e);
    }
  };

  // 快速保存当前页面
  const handleQuickSave = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'QUICK_SAVE_CURRENT_PAGE' });
      window.close();
    } catch (error) {
      console.error('[PopupMenu] Quick save failed:', error);
    }
  };

  // 打开详细保存面板 - 在同一窗口中切换模式
  const handleDetailedSave = () => {
    try {
      // 不创建新窗口，而是切换到详细模式
      const url = new URL(window.location.href);
      url.searchParams.set('mode', 'detailed');
      window.location.href = url.toString();
    } catch (error) {
      console.error('[PopupMenu] Failed to switch to detailed mode:', error);
    }
  };

  // 打开侧边栏
  const handleOpenSidebar = async () => {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow?.id) {
        await chrome.sidePanel.open({ windowId: currentWindow.id });
      }
      window.close();
    } catch (error) {
      console.error('[PopupMenu] Failed to open sidebar:', error);
    }
  };

  // 在新标签页打开
  const handleOpenInTab = async () => {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('sidebar.html') });
      window.close();
    } catch (error) {
      console.error('[PopupMenu] Failed to open in tab:', error);
    }
  };

  // 打开设置 - 在新标签页打开 sidebar 并自动显示设置
  const handleOpenSettings = async () => {
    try {
      await chrome.tabs.create({ 
        url: chrome.runtime.getURL('sidebar.html?openSettings=true') 
      });
      window.close();
    } catch (error) {
      console.error('[PopupMenu] Failed to open settings:', error);
    }
  };

  return (
    <div className="popup-menu">
      <div className="menu-header">
        <img src="/icon-48.png" alt="AnyMark" className="menu-logo" />
        <span className="menu-title">AnyMark</span>
        <button 
          className="menu-item" 
          onClick={handleToggleTheme}
          style={{ 
            width: 'auto', 
            padding: '6px',
            marginLeft: 'auto',
            borderRadius: '6px'
          }}
          title={theme === 'dark' ? '切换到白天模式' : '切换到夜晚模式'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <div className="menu-items">
        <button className="menu-item primary" onClick={handleQuickSave}>
          <Sparkles size={18} />
          <span>{t('popup.menu.quickSave', '快速保存当前页')}</span>
          <kbd>⌥⇧S</kbd>
        </button>

        <button className="menu-item" onClick={handleDetailedSave}>
          <Bookmark size={18} />
          <span>{t('popup.menu.detailedSave', '详细保存...')}</span>
          <kbd>⌥⇧D</kbd>
        </button>

        <div className="menu-divider" />

        <button className="menu-item" onClick={handleOpenSidebar}>
          <PanelLeftOpen size={18} />
          <span>{t('popup.menu.openSidebar', '打开侧边栏')}</span>
        </button>

        <button className="menu-item" onClick={handleOpenInTab}>
          <ExternalLink size={18} />
          <span>{t('popup.menu.openInTab', '在新标签页打开')}</span>
          <kbd>⌥⇧B</kbd>
        </button>

        <div className="menu-divider" />

        <button className="menu-item" onClick={handleOpenSettings}>
          <Settings size={18} />
          <span>{t('popup.menu.settings', '设置')}</span>
        </button>
      </div>
    </div>
  );
};

export default PopupMenu;
