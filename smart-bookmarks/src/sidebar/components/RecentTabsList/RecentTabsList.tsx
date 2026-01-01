/**
 * 最近标签页列表组件
 * 显示最近打开的浏览器标签页，支持快速添加到书签
 */

import React, { useEffect, useState } from 'react';
import { Plus, ExternalLink, Clock, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBookmarkStoreV2 } from '../../store/bookmarkStoreV2';
import { getOptimizedFaviconUrl } from '../../../utils/faviconUtils';
import { showToast } from '../../../components/Toast/ToastContainer';
import EditDialog from '../EditDialog/EditDialog';
import type { IRecentTab } from '../../../types/bookmark';
import './RecentTabsList.css';

const RecentTabsList: React.FC = () => {
  const [recentTabs, setRecentTabs] = useState<IRecentTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<IRecentTab | null>(null);
  const { getRecentTabs, bookmarks, addBookmark, anyMarkRootId } = useBookmarkStoreV2();

  // 加载最近标签页
  useEffect(() => {
    loadRecentTabs();
  }, []);

  const loadRecentTabs = async () => {
    setLoading(true);
    try {
      const tabs = await getRecentTabs();
      setRecentTabs(tabs);
    } catch (error) {
      console.error('[RecentTabsList] Failed to load tabs:', error);
      showToast('加载标签页失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 检查 URL 是否已在书签中
  const isBookmarked = (url: string): boolean => {
    return bookmarks.some(b => b.url === url && b.status !== 'deleted');
  };

  // 打开编辑对话框
  const handleAddToBookmarks = (tab: IRecentTab, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isBookmarked(tab.url)) {
      showToast('此页面已在书签中', 'info');
      return;
    }

    // 设置选中的标签页并打开编辑对话框
    setSelectedTab(tab);
    setIsEditDialogOpen(true);
  };

  // 保存书签
  const handleSaveBookmark = async (updates: any) => {
    if (!selectedTab) return;

    try {
      const targetFolderId = anyMarkRootId || undefined;
      
      // 添加书签到 Chrome Native
      const chromeId = await addBookmark(
        selectedTab.url,
        updates.title || selectedTab.title,
        targetFolderId
      );

      if (chromeId) {
        showToast(`已添加: ${updates.title || selectedTab.title}`, 'success');
        setIsEditDialogOpen(false);
        setSelectedTab(null);
        // 重新加载标签页列表
        await loadRecentTabs();
      }
    } catch (error) {
      console.error('[RecentTabsList] Failed to add bookmark:', error);
      showToast('添加失败', 'error');
    }
  };

  // 打开标签页
  const handleOpenTab = async (tab: IRecentTab) => {
    try {
      if (tab.isActive) {
        // 如果标签页已打开，切换到该标签页
        await chrome.tabs.update(tab.tabId, { active: true });
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.windowId) {
          await chrome.windows.update(tabs[0].windowId, { focused: true });
        }
      } else {
        // 否则在新标签页打开
        await chrome.tabs.create({ url: tab.url, active: true });
      }
    } catch (error) {
      console.error('[RecentTabsList] Failed to open tab:', error);
      showToast('打开失败', 'error');
    }
  };

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (recentTabs.length === 0) return;

      // 检查是否在输入框中
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, recentTabs.length - 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (recentTabs[selectedIndex]) {
            handleOpenTab(recentTabs[selectedIndex]);
          }
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          if (recentTabs[selectedIndex]) {
            handleAddToBookmarks(recentTabs[selectedIndex], e as any);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [recentTabs, selectedIndex]);

  // 格式化时间
  const formatTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${days} 天前`;
  };

  if (loading) {
    return (
      <div className="recent-tabs-loading">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  if (recentTabs.length === 0) {
    return (
      <div className="recent-tabs-empty">
        <Clock size={48} strokeWidth={1.5} />
        <h3>暂无最近标签页</h3>
        <p>打开一些网页后，它们会显示在这里</p>
      </div>
    );
  }

  return (
    <div className="recent-tabs-list">
      <div className="recent-tabs-header">
        <div className="header-title">
          <Clock size={18} />
          <span>最近的标签页</span>
          <span className="tab-count">({recentTabs.length})</span>
        </div>
        <div className="header-hint">
          <kbd>Enter</kbd> 打开 · <kbd>A</kbd> 添加到书签
        </div>
      </div>

      <div className="recent-tabs-items">
        {recentTabs.map((tab, index) => {
          const bookmarked = isBookmarked(tab.url);
          
          return (
            <div
              key={tab.id}
              className={`recent-tab-item ${selectedIndex === index ? 'selected' : ''} ${bookmarked ? 'bookmarked' : ''} ${tab.isActive ? 'active' : ''}`}
              onClick={() => handleOpenTab(tab)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="tab-favicon">
                <img
                  src={getOptimizedFaviconUrl(tab.favicon, tab.url) || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(tab.url).hostname)}&sz=32`}
                  alt=""
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/icon-48.png';
                  }}
                />
                {tab.isActive && (
                  <div className="active-indicator" title="当前打开">
                    <div className="pulse"></div>
                  </div>
                )}
              </div>

              <div className="tab-content">
                <div className="tab-title">{tab.title}</div>
                <div className="tab-url">{new URL(tab.url).hostname}</div>
              </div>

              <div className="tab-meta">
                <span className="tab-time">{formatTime(tab.lastAccessed)}</span>
              </div>

              <div className="tab-actions">
                {bookmarked ? (
                  <div className="bookmarked-badge" title="已在书签中">
                    <Sparkles size={16} />
                  </div>
                ) : (
                  <button
                    className="add-bookmark-btn"
                    onClick={(e) => handleAddToBookmarks(tab, e)}
                    title="添加到书签 (A)"
                  >
                    <Plus size={16} />
                  </button>
                )}
                <button
                  className="open-tab-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenTab(tab);
                  }}
                  title="打开"
                >
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 编辑对话框 */}
      {selectedTab && (
        <EditDialog
          bookmark={{
            chromeId: selectedTab.id,
            url: selectedTab.url,
            title: selectedTab.title,
            dateAdded: selectedTab.lastAccessed,
            parentId: anyMarkRootId || '',
            index: 0,
            favicon: selectedTab.favicon,
            userTags: [],
            aiTags: [],
            starred: false,
            pinned: false,
            analytics: {
              visitCount: 0,
              importance: 50,
            },
            status: 'active',
          } as any}
          isOpen={isEditDialogOpen}
          onClose={() => {
            setIsEditDialogOpen(false);
            setSelectedTab(null);
          }}
          onSave={handleSaveBookmark}
        />
      )}
    </div>
  );
};

export default RecentTabsList;
