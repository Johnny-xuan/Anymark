/**
 * BookmarkListV2 - 使用新架构的书签列表组件
 * 
 * 基于 Chrome Native 作为唯一数据源
 * 使用 chromeId 作为主键
 */

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Folder, FolderOpen, Star, ChevronRight, GripVertical, Sparkles, Download, RefreshCw, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../../i18n/config';
import { useBookmarkStoreV2 } from '../../store/bookmarkStoreV2';
import { showToast, showOperationToast } from '../../../components/Toast/ToastContainer';
import { highlightText } from '../../../utils/highlightText';
import { getBestIcon } from '../../../utils/iconUtils';
import { getOptimizedFaviconUrl } from '../../../utils/faviconUtils';
import type { MergedBookmark, MergedFolder, MergedItem } from '../../../types/chromeBookmark';
import { isMergedBookmark, isMergedFolder } from '../../../types/chromeBookmark';
import './BookmarkList.css';

// ============ BookmarkItem 组件 ============

interface BookmarkItemProps {
  item: MergedItem;
  depth?: number;
  isSelected: boolean;
  isMultiSelected?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
  isDragOver: boolean;
  isDragging: boolean;
  isDragTargetFolder?: boolean;
  dragPosition?: 'top' | 'center' | 'bottom' | null;
  searchQuery?: string;
  onAnalyze?: (bookmark: MergedBookmark) => void;
  isAnalyzing?: boolean;
}

const BookmarkItemV2: React.FC<BookmarkItemProps> = React.memo(({
  item,
  depth = 0,
  isSelected,
  isMultiSelected,
  onClick,
  onDoubleClick,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver,
  isDragging,
  isDragTargetFolder,
  dragPosition,
  searchQuery,
  onAnalyze,
  isAnalyzing,
}) => {
  const { t } = useTranslation();
  const isFolder = isMergedFolder(item);
  const { expandedFolderIds, toggleFolderExpanded } = useBookmarkStoreV2();
  const isExpanded = isFolder && expandedFolderIds.has(item.chromeId);
  const itemRef = useRef<HTMLDivElement>(null);
  const [showRipple, setShowRipple] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      toggleFolderExpanded(item.chromeId);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onClick(e);
    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      itemRef.current.style.setProperty('--ripple-x', `${x}%`);
      itemRef.current.style.setProperty('--ripple-y', `${y}%`);
      setShowRipple(true);
      setTimeout(() => setShowRipple(false), 600);
    }
  };

  // 获取高亮文本
  const getHighlightedTitle = () => {
    return searchQuery ? highlightText(item.title, searchQuery) : item.title;
  };

  const getHighlightedUrl = () => {
    if (isFolder) return null;
    const bookmark = item as MergedBookmark;
    return searchQuery ? highlightText(bookmark.url, searchQuery) : bookmark.url;
  };

  return (
    <div
      ref={itemRef}
      className={`bookmark-item ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${
        isFolder ? 'folder' : 'bookmark'
      } ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''} ${isDragTargetFolder ? 'drag-target-folder' : ''} ${isDragOver && dragPosition ? `drag-position-${dragPosition}` : ''} ${showRipple ? 'ripple' : ''}`}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      {/* 拖拽手柄 */}
      <div className="drag-handle">
        <GripVertical size={16} strokeWidth={1.5} />
      </div>

      {/* 左侧图标 */}
      <div className="item-icon">
        {isFolder ? (
          <>
            <button
              className={`expand-button ${isExpanded ? 'expanded' : ''}`}
              onClick={handleExpandClick}
              aria-label={isExpanded ? t('sidebar.bookmarkList.item.collapseLabel') : t('sidebar.bookmarkList.item.expandLabel')}
            >
              <ChevronRight size={14} />
            </button>
            {isExpanded ? (
              <FolderOpen size={18} strokeWidth={1.5} />
            ) : (
              <Folder size={18} strokeWidth={1.5} />
            )}
          </>
        ) : (
          (() => {
            const bookmark = item as MergedBookmark;
            const favicon = getOptimizedFaviconUrl(bookmark.favicon, bookmark.url);
            
            if (favicon && !faviconError) {
              return (
                <img
                  src={favicon}
                  alt=""
                  className="bookmark-favicon"
                  loading="lazy"
                  onError={() => setFaviconError(true)}
                />
              );
            }
            
            const IconComponent = getBestIcon(bookmark.url, bookmark.title);
            return <IconComponent size={18} strokeWidth={1.5} />;
          })()
        )}
      </div>

      {/* 内容 */}
      <div className="item-content">
        <div className="item-title">{getHighlightedTitle()}</div>
        {!isFolder && (
          <div className="item-meta">
            <span className="item-url">{getHighlightedUrl()}</span>
            {(item as MergedBookmark).analytics.visitCount > 0 && (
              <span className="item-visits">
                {t('sidebar.bookmarkList.item.visits', { count: (item as MergedBookmark).analytics.visitCount })}
              </span>
            )}
          </div>
        )}
        {isFolder && (
          <div className="item-meta">
            <span className="folder-count">
              {t('sidebar.bookmarkList.item.items', { count: (item as MergedFolder).bookmarkCount })}
              {(item as MergedFolder).subfolderCount > 0 && (
                <>, {t('sidebar.bookmarkList.item.folders', { count: (item as MergedFolder).subfolderCount })}</>
              )}
            </span>
          </div>
        )}
      </div>

      {/* 右侧操作 */}
      <div className="item-actions">
        {!isFolder && (item as MergedBookmark).starred && (
          <Star size={14} fill="currentColor" className="star-icon" />
        )}
        {!isFolder && onAnalyze && (
          <button
            className={`analyze-button ${isAnalyzing ? 'analyzing' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onAnalyze(item as MergedBookmark);
            }}
            disabled={isAnalyzing}
            title={isAnalyzing ? t('sidebar.bookmarkList.item.analyzing') : t('sidebar.bookmarkList.item.analyze')}
          >
            <Sparkles size={14} className={isAnalyzing ? 'spinning' : ''} />
          </button>
        )}
      </div>
    </div>
  );
});

BookmarkItemV2.displayName = 'BookmarkItemV2';

// ============ BookmarkListV2 主组件 ============

const BookmarkListV2: React.FC = () => {
  const { t } = useTranslation();
  const {
    bookmarks,
    folders,
    isLoading,
    isInitialized,
    error,
    selectedId,
    selectedIds,
    searchQuery,
    currentFilter,
    currentSort,
    currentFolderId,
    expandedFolderIds,
    anyMarkRootId,
    viewMode,
    initialize,
    refresh,
    setSelectedId,
    clearSelection,
    selectAll,
    deleteBookmark,
    toggleStarred,
    getFilteredItems,
    moveBookmark,
    recordVisit,
  } = useBookmarkStoreV2();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // 虚拟滚动参数
  const OVERSCAN = 5;
  const CONTAINER_HEIGHT = 600;
  const getItemHeight = () => viewMode === 'compact' ? 36 : 48;
  const ITEM_HEIGHT = getItemHeight();

  // 拖拽状态
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<'top' | 'center' | 'bottom' | null>(null);

  // AI 分析状态
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  
  // 导入状态
  const [isImporting, setIsImporting] = useState(false);

  // 初始化
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // 获取过滤后的项目 (使用 useMemo 优化性能，避免滚动时重复计算)
  const filteredItems = useMemo(() => {
    return getFilteredItems();
  }, [
    bookmarks, 
    folders, 
    searchQuery, 
    currentFilter, 
    currentSort, 
    currentFolderId, 
    expandedFolderIds, 
    anyMarkRootId
  ]);

  // 虚拟滚动计算
  const visibleStartIndex = filteredItems.length > 0
    ? Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
    : 0;
  const visibleEndIndex = filteredItems.length > 0
    ? Math.min(filteredItems.length - 1, Math.ceil((scrollTop + CONTAINER_HEIGHT) / ITEM_HEIGHT) + OVERSCAN)
    : -1;
  const visibleItems = filteredItems.slice(visibleStartIndex, visibleEndIndex + 1);
  const totalHeight = filteredItems.length * ITEM_HEIGHT;
  const offsetY = visibleStartIndex * ITEM_HEIGHT;

  // 处理滚动
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    // 使用 requestAnimationFrame 优化滚动事件处理
    requestAnimationFrame(() => {
      setScrollTop(e.currentTarget.scrollTop);
    });
  }, []);

  // 处理项目点击
  const handleItemClick = useCallback((item: MergedItem, e: React.MouseEvent) => {
    const isFolder = isMergedFolder(item);
    
    if (isFolder) {
      setSelectedId(item.chromeId);
      return;
    }

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // 多选逻辑可以在这里扩展
      return;
    }

    clearSelection();
    setSelectedId(item.chromeId);
  }, [setSelectedId, clearSelection]);

  // 处理双击打开
  const handleItemDoubleClick = useCallback((item: MergedItem) => {
    if (isMergedFolder(item)) {
      const { toggleFolderExpanded } = useBookmarkStoreV2.getState();
      toggleFolderExpanded(item.chromeId);
    } else {
      const bookmark = item as MergedBookmark;
      recordVisit(bookmark.chromeId);
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: bookmark.url });
      }
    }
  }, [recordVisit]);

  // AI 分析
  const handleAnalyzeBookmark = async (bookmark: MergedBookmark) => {
    if (analyzingId) return;
    setAnalyzingId(bookmark.chromeId);
    showToast(t('sidebar.bookmarkList.actions.startAnalyzing'), 'info', 2000);

    try {
      const { getDefaultAnalyzer } = await import('../../../utils/aiAnalyzer');
      const analyzer = await getDefaultAnalyzer();
      const analysis = await analyzer.analyzeBookmark({
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.aiSummary || '',
      });

      if (analysis) {
        const { updateMetadata } = useBookmarkStoreV2.getState();
        await updateMetadata(bookmark.chromeId, {
          aiSummary: analysis.summary,
          aiTags: analysis.tags,
          aiConfidence: Math.round((analysis.confidence || 0.5) * 100),
        });
        showToast(t('sidebar.bookmarkList.actions.analyzeComplete'), 'success', 3000);
      }
    } catch (error) {
      console.error('[BookmarkListV2] Analyze failed:', error);
      showToast(t('sidebar.bookmarkList.actions.analyzeFailed', { error: (error as Error).message }), 'error', 3000);
    } finally {
      setAnalyzingId(null);
    }
  };

  // 手动导入 Chrome 书签
  const handleImportChromeBookmarks = async () => {
    if (isImporting) {
      console.log('[BookmarkListV2] Import already in progress, ignoring');
      return;
    }

    setIsImporting(true);
    showToast(t('sidebar.bookmarkList.import.starting') || '正在导入书签...', 'info', 3000);

    try {
      console.log('[BookmarkListV2] Starting manual import from Chrome bookmarks');

      // 检查 Chrome API 是否可用
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        throw new Error('Chrome API not available');
      }

      // 发送消息到 background 触发重新导入
      const response = await chrome.runtime.sendMessage({
        type: 'REIMPORT_BOOKMARKS'
      });

      console.log('[BookmarkListV2] Import response:', response);

      if (response.success) {
        const { data } = response;
        showToast(
          t('sidebar.bookmarkList.import.completed', { count: data?.importedBookmarks || 0 }) ||
          `导入完成！导入了 ${data?.importedBookmarks || 0} 个书签`,
          'success',
          5000
        );

        // 立即刷新数据（导入已在 background 完成）
        await refresh();
      } else {
        throw new Error(response.error || 'Import failed');
      }
    } catch (error) {
      console.error('[BookmarkListV2] Manual import failed:', error);
      showToast(t('sidebar.bookmarkList.import.failed', { error: (error as Error).message }) || `导入失败: ${(error as Error).message}`, 'error', 5000);
    } finally {
      setIsImporting(false);
    }
  };

  // 拖拽处理
  const handleDragStart = useCallback((item: MergedItem, e: React.DragEvent) => {
    setDraggedId(item.chromeId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((item: MergedItem, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedId && draggedId !== item.chromeId) {
      setDragOverId(item.chromeId);
      
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;
      const edgeThreshold = height * 0.25;
      
      if (y < edgeThreshold) {
        setDragPosition('top');
      } else if (y > height - edgeThreshold) {
        setDragPosition('bottom');
      } else {
        setDragPosition('center');
      }
    }
  }, [draggedId]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
    setDragPosition(null);
  }, []);

  const handleDrop = useCallback(async (targetItem: MergedItem, e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggedId || draggedId === targetItem.chromeId) {
      handleDragEnd();
      return;
    }

    // 如果目标是文件夹且在中心位置，移动到文件夹内
    if (isMergedFolder(targetItem) && dragPosition === 'center') {
      await moveBookmark(draggedId, targetItem.chromeId);
      showOperationToast(t('sidebar.bookmarkList.drag.movedToFolder', { title: targetItem.title }), true);
    }

    handleDragEnd();
  }, [draggedId, dragPosition, moveBookmark, handleDragEnd, t]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement instanceof HTMLElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      );
      
      if (isInputFocused && e.key !== 'Escape') return;

      const currentIndex = filteredItems.findIndex(item => item.chromeId === selectedId);

      switch (e.key) {
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          if (currentIndex > 0) {
            setSelectedId(filteredItems[currentIndex - 1].chromeId);
          }
          break;
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          if (currentIndex < filteredItems.length - 1) {
            setSelectedId(filteredItems[currentIndex + 1].chromeId);
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (currentIndex >= 0) {
            handleItemDoubleClick(filteredItems[currentIndex]);
          }
          break;
        case 's':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            const item = filteredItems[currentIndex];
            if (item && isMergedBookmark(item)) {
              toggleStarred(item.chromeId);
            }
          }
          break;
        case 'd':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            const item = filteredItems[currentIndex];
            if (item && isMergedBookmark(item)) {
              if (window.confirm(t('sidebar.bookmarkList.delete.confirmDelete', { title: item.title }))) {
                deleteBookmark(item.chromeId);
                showOperationToast(t('sidebar.bookmarkList.delete.movedToTrash'), true);
              }
            }
          }
          break;
        case 'Escape':
          if (selectedIds.size > 0) {
            e.preventDefault();
            clearSelection();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredItems, selectedId, selectedIds, setSelectedId, clearSelection, toggleStarred, deleteBookmark, handleItemDoubleClick, t]);

  // 自动滚动到选中项
  useEffect(() => {
    if (!selectedId || filteredItems.length === 0 || !scrollElementRef.current) return;

    const index = filteredItems.findIndex(item => item.chromeId === selectedId);
    if (index === -1) return;

    const itemTop = index * ITEM_HEIGHT;
    const itemBottom = itemTop + ITEM_HEIGHT;
    const currentScrollTop = scrollElementRef.current.scrollTop;
    const viewportHeight = scrollElementRef.current.clientHeight;

    // 如果在可视区域上方
    if (itemTop < currentScrollTop) {
      requestAnimationFrame(() => {
        if (scrollElementRef.current) {
          scrollElementRef.current.scrollTop = itemTop;
        }
      });
    }
    // 如果在可视区域下方
    else if (itemBottom > currentScrollTop + viewportHeight) {
      requestAnimationFrame(() => {
        if (scrollElementRef.current) {
          scrollElementRef.current.scrollTop = itemBottom - viewportHeight;
        }
      });
    }
  }, [selectedId, filteredItems, ITEM_HEIGHT]);

  // 加载状态
  if (isLoading && !isInitialized) {
    return (
      <div className="bookmark-list-empty">
        <RefreshCw size={24} className="spinning" />
        <p>{t('sidebar.bookmarkList.loading')}</p>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="bookmark-list-empty">
        <p>{t('sidebar.bookmarkList.error', { error })}</p>
        <button className="btn-primary" onClick={refresh}>
          <RefreshCw size={18} />
          {t('sidebar.bookmarkList.retry')}
        </button>
      </div>
    );
  }

  // 空状态
  if (filteredItems.length === 0) {
    if (searchQuery && searchQuery.trim().length > 0) {
      return (
        <div className="bookmark-list-empty">
          <p>{t('sidebar.bookmarkList.empty.noSearchResults')}</p>
          <p className="empty-hint">{t('sidebar.bookmarkList.empty.tryDifferentKeywords')}</p>
        </div>
      );
    }

    // Chrome 视图：显示导入按钮
    if (currentFilter === 'chrome') {
      return (
        <div className="bookmark-list-empty">
          <div className="empty-icon">
            <Folder size={48} strokeWidth={1} />
          </div>
          <h3>{t('sidebar.bookmarkList.empty.chromeTitle')}</h3>
          <p>{t('sidebar.bookmarkList.empty.chromeDesc')}</p>
          <button
            className="btn-primary import-button"
            onClick={handleImportChromeBookmarks}
            disabled={isImporting}
          >
            <Download size={18} />
            {isImporting
              ? (t('sidebar.bookmarkList.empty.importing') || '正在导入...')
              : (t('sidebar.bookmarkList.empty.importButton') || '导入 Chrome 书签')
            }
          </button>
        </div>
      );
    }

    // 其他视图：显示对应提示
    let emptyIcon = <FolderOpen size={48} strokeWidth={1} />;
    let emptyTitle = t('sidebar.bookmarkList.empty.noBookmarks');
    let emptyDesc = t('sidebar.bookmarkList.empty.adjustFilters');

    switch (currentFilter) {
      case 'trash':
        emptyIcon = <Trash2 size={48} strokeWidth={1} />;
        emptyTitle = t('sidebar.filters.trash') || '回收站';
        emptyDesc = '暂时没有已删除的书签';
        break;
      case 'starred':
        emptyIcon = <Star size={48} strokeWidth={1} />;
        emptyTitle = t('sidebar.filters.favorites') || '收藏夹';
        emptyDesc = '点击书签旁的星号进行收藏';
        break;
      case 'recent':
        emptyIcon = <RefreshCw size={48} strokeWidth={1} />;
        emptyTitle = t('sidebar.filters.recent') || '最近';
        emptyDesc = '最近访问或添加的书签会显示在这里';
        break;
      case 'popular':
        emptyIcon = <Sparkles size={48} strokeWidth={1} />;
        emptyTitle = t('sidebar.filters.popular') || '热门';
        emptyDesc = '访问频率最高的书签会显示在这里';
        break;
      case 'longtail':
        emptyIcon = <FolderOpen size={48} strokeWidth={1} />;
        emptyTitle = t('sidebar.filters.longTail') || '长尾';
        emptyDesc = '长期未访问的书签会显示在这里';
        break;
    }

    return (
      <div className="bookmark-list-empty">
        <div className="empty-icon">{emptyIcon}</div>
        <h3>{emptyTitle}</h3>
        <p className="empty-hint">{emptyDesc}</p>
      </div>
    );
  }

  return (
    <div
      className={`bookmark-list view-${viewMode}`}
      ref={containerRef}
      tabIndex={0}
    >
      {/* 多选工具栏 */}
      {selectedIds.size > 0 && (
        <div className="multi-select-toolbar">
          <span className="select-count">
            {t('sidebar.bookmarkList.multiSelect.selected', { count: selectedIds.size })}
          </span>
          <div className="toolbar-actions">
            <button onClick={() => selectAll()} title={t('sidebar.bookmarkList.multiSelect.selectAll')}>
              {t('sidebar.bookmarkList.multiSelect.selectAllBtn')}
            </button>
            <button onClick={() => clearSelection()} title={t('sidebar.bookmarkList.multiSelect.clear')}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 虚拟滚动容器 */}
      <div
        className="bookmark-list-scroll"
        ref={scrollElementRef}
        onScroll={handleScroll}
        style={{ height: '100%', overflow: 'auto' }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {/* 选中指示器 */}
          {selectedId && (
            <div
              className="selection-indicator"
              style={{
                height: ITEM_HEIGHT,
                top: filteredItems.findIndex(item => item.chromeId === selectedId) * ITEM_HEIGHT,
                transform: 'none',
              }}
            />
          )}

          {/* 可见项目列表 */}
          <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
            {visibleItems.map((item: MergedItem & { depth?: number }) => (
              <BookmarkItemV2
                key={item.chromeId}
                item={item}
                depth={item.depth}
                isSelected={item.chromeId === selectedId}
                isMultiSelected={selectedIds.has(item.chromeId)}
                onClick={(e) => handleItemClick(item, e)}
                onDoubleClick={() => handleItemDoubleClick(item)}
                onDragStart={(e) => handleDragStart(item, e)}
                onDragOver={(e) => handleDragOver(item, e)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(item, e)}
                isDragOver={dragOverId === item.chromeId}
                isDragging={draggedId === item.chromeId}
                isDragTargetFolder={isMergedFolder(item) && dragOverId === item.chromeId}
                dragPosition={dragOverId === item.chromeId ? dragPosition : null}
                searchQuery={searchQuery}
                onAnalyze={isMergedBookmark(item) ? handleAnalyzeBookmark : undefined}
                isAnalyzing={analyzingId === item.chromeId}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookmarkListV2;
