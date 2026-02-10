/**
 * Popup 菜单 - 点击扩展图标时显示
 * 与侧边栏风格一致的简洁菜单，含快速搜索功能
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Bookmark,
  PanelLeftOpen,
  Settings,
  ExternalLink,
  Search,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../i18n/config';
import './PopupMenu.css';

const PopupMenu: React.FC = () => {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 5;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // 初始化主题 - 从 chrome.storage 同步
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const result = await chrome.storage.local.get('theme');
        const savedTheme = result.theme as 'light' | 'dark' | undefined;
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

  // 自动聚焦搜索框
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // 搜索书签（防抖 300ms）
  const handleSearch = useCallback((query: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      setShowResults(false);
      setHasSearched(false);
      setCurrentPage(0);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await chrome.bookmarks.search(query);
        const filtered = results.filter(r => r.url);
        setSearchResults(filtered);
        setShowResults(filtered.length > 0);
        setCurrentPage(0);
        setHasSearched(true);
      } catch (error) {
        console.error('[PopupMenu] Search failed:', error);
        setSearchResults([]);
        setShowResults(false);
        setHasSearched(true);
      }
    }, 300);
  }, []);

  // 点击搜索结果跳转
  const handleResultClick = async (url: string) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.update(tab.id, { url });
      }
      window.close();
    } catch (error) {
      console.error('[PopupMenu] Failed to navigate:', error);
    }
  };

  // 获取 favicon URL
  const getFaviconUrl = (url: string) => {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;
    } catch {
      return '';
    }
  };

  // 截断 URL 显示
  const truncateUrl = (url: string, maxLen = 40) => {
    try {
      const u = new URL(url);
      const display = u.hostname + u.pathname;
      return display.length > maxLen ? display.slice(0, maxLen) + '...' : display;
    } catch {
      return url.length > maxLen ? url.slice(0, maxLen) + '...' : url;
    }
  };

  // 切换主题 - 同步到 chrome.storage 和 localStorage
  const handleToggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    try {
      await chrome.storage.local.set({ theme: newTheme });
    } catch (e) {
      console.warn('[PopupMenu] Failed to save theme to storage:', e);
    }
  };

  // 打开详细保存面板 - 在同一窗口中切换模式
  const handleDetailedSave = () => {
    try {
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
          title={theme === 'dark' ? t('popup.toggleLightMode') : t('popup.toggleDarkMode')}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* 搜索框 */}
      <div className="menu-search">
        <Search size={14} className="search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          className="search-input"
          placeholder={t('popup.menu.searchPlaceholder', 'Search bookmarks...')}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            handleSearch(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearchQuery('');
              setSearchResults([]);
              setShowResults(false);
              setHasSearched(false);
              setCurrentPage(0);
            }
          }}
        />
      </div>

      {/* 搜索结果 */}
      {showResults && (
        <div className="search-results">
          {searchResults.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((result) => (
            <button
              key={result.id}
              className="search-result-item"
              onClick={() => result.url && handleResultClick(result.url)}
            >
              {result.url && (
                <img
                  src={getFaviconUrl(result.url)}
                  alt=""
                  className="result-favicon"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="result-text">
                <div className="result-title">{result.title || result.url}</div>
                {result.url && <div className="result-url">{truncateUrl(result.url)}</div>}
              </div>
            </button>
          ))}
          {/* 翻页栏 */}
          {searchResults.length > PAGE_SIZE && (
            <div className="search-pagination">
              <button
                className="pagination-btn"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="pagination-info">
                {currentPage + 1} / {Math.ceil(searchResults.length / PAGE_SIZE)}
              </span>
              <button
                className="pagination-btn"
                disabled={(currentPage + 1) * PAGE_SIZE >= searchResults.length}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 无结果提示 */}
      {hasSearched && searchQuery.trim() && searchResults.length === 0 && (
        <div className="search-no-results">
          {t('popup.menu.noResults', 'No results found')}
        </div>
      )}

      <div className="menu-items">
        <button className="menu-item primary" onClick={handleDetailedSave}>
          <Bookmark size={18} />
          <span>{t('popup.menu.saveCurrentTab', 'Save Current Tab')}</span>
        </button>

        <div className="menu-divider" />

        <button className="menu-item" onClick={handleOpenSidebar}>
          <PanelLeftOpen size={18} />
          <span>{t('popup.menu.openSidebar', 'Open Sidebar')}</span>
        </button>

        <button className="menu-item" onClick={handleOpenInTab}>
          <ExternalLink size={18} />
          <span>{t('popup.menu.openInTab', 'Open in New Tab')}</span>
        </button>

        <div className="menu-divider" />

        <button className="menu-item" onClick={handleOpenSettings}>
          <Settings size={18} />
          <span>{t('popup.menu.settings', 'Settings')}</span>
        </button>
      </div>
    </div>
  );
};

export default PopupMenu;
