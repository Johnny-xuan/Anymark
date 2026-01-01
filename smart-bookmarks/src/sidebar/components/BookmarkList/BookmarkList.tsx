/**
 * 书签列表组件
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Folder, FolderOpen, Star, ChevronRight, GripVertical, Sparkles, Chrome, Download, RefreshCw, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../../i18n/config';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { showToast, showOperationToast } from '../../../components/Toast/ToastContainer';
import { highlightText } from '../../../utils/highlightText';
import { getBestIcon } from '../../../utils/iconUtils';
import { getOptimizedFaviconUrl } from '../../../utils/faviconUtils';
import { setBookmarkListElement } from '../SearchBar/SearchBar';
import { calculateFrecency } from '../../../utils/frecencyCalculator';
import type { IBookmark, IFolder } from '../../../types/bookmark';
import './BookmarkList.css';

interface BookmarkItemProps {
  item: IBookmark | IFolder;
  index: number;
  isSelected: boolean;
  isMultiSelected?: boolean; // 多选状态
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  isDragOver: boolean;
  isDragging: boolean;
  isDragTargetFolder?: boolean; // 是否是拖拽目标文件夹（用于高亮显示）
  dragPosition?: 'top' | 'center' | 'bottom' | null; // 拖拽位置
  searchQuery?: string; // 搜索关键词
  isEditing?: boolean; // 是否处于编辑模式
  editingTitle?: string; // 编辑中的标题
  onEditingTitleChange?: (title: string) => void; // 标题变化回调
  onSaveEdit?: () => void; // 保存编辑回调
  onAnalyze?: (bookmark: IBookmark) => void; // AI分析回调
  isAnalyzing?: boolean; // 是否正在分析
}

const BookmarkItem: React.FC<BookmarkItemProps> = React.memo(
  ({
    item,
    index,
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
    isEditing,
    editingTitle,
    onEditingTitleChange,
    onSaveEdit,
    onAnalyze,
    isAnalyzing,
  }) => {
    const { t } = useTranslation();
    const isFolder = 'bookmarkCount' in item;
    const { expandedFolderIds, toggleFolderExpanded } = useBookmarkStore();
    const isExpanded = isFolder && expandedFolderIds.has(item.id);
    const itemRef = useRef<HTMLDivElement>(null);
    const [showRipple, setShowRipple] = useState(false);
    const [faviconError, setFaviconError] = useState(false); // 跟踪 favicon 加载失败

    const handleExpandClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isFolder) {
        toggleFolderExpanded(item.id);
      }
    };

    // 点击波纹效果
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onClick(e);
      
      // 触发波纹动画
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
    
    // 计算层级缩进
    const getIndentLevel = () => {
      if (isFolder) {
        const folder = item as IFolder;
        const path = folder.path;
        if (path === '/') return 0;
        return path.split('/').filter(Boolean).length - 1;
      } else {
        const bookmark = item as IBookmark;
        // 统一使用 folderPath 作为书签位置的唯一来源
        const path = bookmark.folderPath || '/';
        if (path === '/') return 0;
        return path.split('/').filter(Boolean).length;
      }
    };
    
    const indentLevel = getIndentLevel();
    const indentPx = indentLevel * 20; // 每级缩进 20px

    // 获取高亮文本
    const getHighlightedTitle = () => {
      const title = isFolder ? (item as IFolder).title : (item as IBookmark).title;
      return searchQuery ? highlightText(title, searchQuery) : title;
    };

    const getHighlightedUrl = () => {
      if (isFolder) return null;
      const url = (item as IBookmark).url;
      return searchQuery ? highlightText(url, searchQuery) : url;
    };

    return (
      <div
        ref={itemRef}
        className={`bookmark-item ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${
          isFolder ? 'folder' : 'bookmark'
        } ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''} ${isDragTargetFolder ? 'drag-target-folder' : ''} ${isDragOver && dragPosition ? `drag-position-${dragPosition}` : ''} ${showRipple ? 'ripple' : ''}`}
        onClick={handleClick}
        onDoubleClick={onDoubleClick}
        data-index={index}
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDragEnd={onDragEnd}
        onDrop={(e) => onDrop(e, index)}
        style={{ paddingLeft: `${12 + indentPx}px` }}
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
              const bookmark = item as IBookmark;
              // 使用工具函数优化 favicon URL
              const favicon = getOptimizedFaviconUrl(bookmark.favicon, bookmark.url);
              
              // 如果有 favicon 且未加载失败，显示网站图标
              if (favicon && !faviconError) {
                return (
                  <img
                    src={favicon}
                    alt=""
                    className="bookmark-favicon"
                    loading="lazy"
                    onError={(e) => {
                      console.warn('[BookmarkItem] Favicon load failed, trying fallback:', favicon);
                      
                      // 尝试备选方案
                      const img = e.currentTarget;
                      const currentSrc = img.src;
                      
                      // 如果是 Google 服务失败，尝试 DuckDuckGo
                      if (currentSrc.includes('google.com/s2/favicons')) {
                        try {
                          const domain = new URL(bookmark.url).hostname;
                          img.src = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
                          return;
                        } catch (err) {
                          // 忽略错误，继续下一个备选
                        }
                      }
                      
                      // 如果是 DuckDuckGo 失败，尝试原始网站的 favicon.ico
                      if (currentSrc.includes('duckduckgo.com')) {
                        try {
                          const urlObj = new URL(bookmark.url);
                          img.src = `${urlObj.origin}/favicon.ico`;
                          return;
                        } catch (err) {
                          // 忽略错误
                        }
                      }
                      
                      // 所有备选都失败，使用图标
                      setFaviconError(true);
                    }}
                  />
                );
              }
              
              // 没有 favicon 或加载失败，使用 Lucide 图标
              const IconComponent = getBestIcon(bookmark.url, bookmark.title);
              return <IconComponent size={18} strokeWidth={1.5} />;
            })()
          )}
        </div>

        {/* 内容 */}
        <div className="item-content">
          {isEditing ? (
            <input
              type="text"
              className="edit-input"
              value={editingTitle}
              onChange={(e) => onEditingTitleChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSaveEdit?.();
                }
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <div className="item-title">
                {getHighlightedTitle()}
              </div>
              {!isFolder && (
                <div className="item-meta">
                  <span className="item-url">{getHighlightedUrl()}</span>
                  {(item as IBookmark).analytics.visitCount > 0 && (
                    <span className="item-visits">
                      {t('sidebar.bookmarkList.item.visits', { count: (item as IBookmark).analytics.visitCount })}
                    </span>
                  )}
                </div>
              )}
              {isFolder && (
                <div className="item-meta">
                  <span className="folder-count">
                    {t('sidebar.bookmarkList.item.items', { count: (item as IFolder).bookmarkCount })}
                    {(item as IFolder).subfolderCount > 0 && (
                      <>, {t('sidebar.bookmarkList.item.folders', { count: (item as IFolder).subfolderCount })}</>
                    )}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 右侧操作 */}
        <div className="item-actions">
          {/* 数据源标识 */}
          {!isFolder && (item as IBookmark).chromeId && (
            <span title={t('sidebar.bookmarkList.source.chrome', 'Chrome 同步')}>
              <Chrome size={12} className="source-icon chrome" />
            </span>
          )}
          {!isFolder && (item as IBookmark).starred && (
            <Star size={14} fill="currentColor" className="star-icon" />
          )}
          {!isFolder && onAnalyze && (
            <button
              className={`analyze-button ${isAnalyzing ? 'analyzing' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onAnalyze(item as IBookmark);
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
  }
);

BookmarkItem.displayName = 'BookmarkItem';

const BookmarkList: React.FC = () => {
  const { t } = useTranslation();
  const {
    getFilteredBookmarks,
    selectedIndex,
    setSelectedIndex,
    setSelectedBookmark,
    navigateUp,
    navigateDown,
    reorderBookmarks,
    moveBookmarkToFolder,
    moveFolderToFolder,
    searchQuery,
    currentFilter,
    restoreBookmark,
    permanentlyDeleteBookmark,
    viewMode,
    selectedIds,
    clearSelection,
    selectAll,
    deleteSelectedBookmarks,
    starSelectedBookmarks,
  } = useBookmarkStore();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement | null>(null); // 用于接收搜索框转移的焦点
  const filteredBookmarks = getFilteredBookmarks();

  // 虚拟滚动相关状态
  const [scrollTop, setScrollTop] = useState(0);
  // 项目高度根据视图模式动态计算（在 render 时获取）
  const OVERSCAN = 5; // 预渲染数量，避免滚动时闪烁
  const CONTAINER_HEIGHT = 600; // 容器高度估算

  // 根据视图模式计算项目高度
  const getItemHeight = () => {
    switch (viewMode) {
      case 'compact': return 36;
      default: return 48;
    }
  };
  const ITEM_HEIGHT = getItemHeight();

  // 计算可见范围
  const visibleStartIndex = filteredBookmarks.length > 0
    ? Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
    : 0;
  const visibleEndIndex = filteredBookmarks.length > 0
    ? Math.min(
        filteredBookmarks.length - 1,
        Math.ceil((scrollTop + CONTAINER_HEIGHT) / ITEM_HEIGHT) + OVERSCAN
      )
    : -1;
  const visibleItems = filteredBookmarks.slice(visibleStartIndex, visibleEndIndex + 1);
  const totalHeight = filteredBookmarks.length * ITEM_HEIGHT;
  const offsetY = visibleStartIndex * ITEM_HEIGHT;

  // 拖拽状态
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null); // 悬停的文件夹 ID
  const [dragPosition, setDragPosition] = useState<'top' | 'center' | 'bottom' | null>(null); // 拖拽位置：边缘或中心
  const dragOverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 自动展开计时器

  // 编辑模式状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // AI分析状态
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  
  // 导入状态
  const [isImporting, setIsImporting] = useState(false);

  // 注册书签列表元素，供搜索框聚焦使用
  useEffect(() => {
    if (listRef.current) {
      console.log('[BookmarkList] Registering list element for focus transfer');
      setBookmarkListElement(listRef.current);
      
      // 自动聚焦并确保选中状态
      const ensureFocus = () => {
        console.log('[BookmarkList] ensureFocus called, filteredBookmarks.length:', filteredBookmarks.length, 'selectedIndex:', selectedIndex);
        if (filteredBookmarks.length > 0 && (selectedIndex === -1 || selectedIndex >= filteredBookmarks.length)) {
          console.log('[BookmarkList] Auto-selecting first item');
          setSelectedIndex(0);
        }
      };
      
      // 立即执行一次
      ensureFocus();
      
      // 再延迟执行一次，确保数据加载完成
      const timer = setTimeout(ensureFocus, 100);
      return () => clearTimeout(timer);
    }
    return () => {
      console.log('[BookmarkList] Unregistering list element');
      setBookmarkListElement(null);
    };
  }, [filteredBookmarks.length, selectedIndex, setSelectedIndex]);

  // 处理滚动事件
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
  }, []);

  // 滚动到指定索引
  const scrollToIndex = useCallback((index: number) => {
    if (scrollElementRef.current) {
      const scrollTop = index * ITEM_HEIGHT;
      scrollElementRef.current.scrollTop = scrollTop;
      setScrollTop(scrollTop);
    }
  }, [ITEM_HEIGHT]);

  // AI分析单个书签
  const handleAnalyzeBookmark = async (bookmark: IBookmark) => {
    if (analyzingId) return; // 防止重复分析

    // 检查是否已分析过
    if (bookmark.aiSummary) {
      const confirm = window.confirm(t('sidebar.bookmarkList.actions.reanalyze'));
      if (!confirm) return;
    }

    setAnalyzingId(bookmark.id);
    showToast(t('sidebar.bookmarkList.actions.startAnalyzing'), 'info', 2000);

    try {
      // 导入AI分析器
      const { getDefaultAnalyzer } = await import('../../../utils/aiAnalyzer');
      const analyzer = await getDefaultAnalyzer();

      // 调用AI分析
      const pageContent = {
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.aiSummary || bookmark.userNotes || '',
      };

      // 获取最近的书签作为上下文
      const { bookmarks: allBookmarks } = useBookmarkStore.getState();
      const recentBookmarks = allBookmarks
        .filter(b => b.status !== 'deleted')
        .sort((a, b) => b.createTime - a.createTime)
        .slice(0, 10);

      const analysis = await analyzer.analyzeBookmark(pageContent, { recentBookmarks });

      // 确保 analysis 存在且有必要的字段
      if (!analysis) {
        throw new Error(t('sidebar.bookmarkList.actions.analyzeEmpty'));
      }

      // 安全的属性访问，提供默认值
      // 注意：AI 智能分析不设置 aiCategory，只设置摘要、标签等辅助信息
      // aiCategory 只能由 Agent 操作或用户手动设置
      // IAIAnalysis 类型已移除 category 和 subcategory 字段
      const safeAnalysis = {
        summary: analysis.summary || t('sidebar.bookmarkList.actions.noSummary'),
        tags: analysis.tags || [],
        confidence: analysis.confidence || 0.5,
      };

      // 更新书签 - 不更新 aiCategory
      const { updateBookmark } = useBookmarkStore.getState();
      // bookmarkStore.updateBookmark 已处理存储保存和 Chrome 同步
      updateBookmark(bookmark.id, {
        aiSummary: safeAnalysis.summary,
        aiTags: safeAnalysis.tags,
        // 注意：不设置 aiCategory，保持书签原有的分类状态
        aiConfidence: Math.round(safeAnalysis.confidence * 100),
        lastAnalyzed: Date.now(),
      });

      showToast(t('sidebar.bookmarkList.actions.analyzeComplete'), 'success', 3000);
    } catch (error) {
      console.error('[BookmarkList] Analyze failed:', error);
      showToast(t('sidebar.bookmarkList.actions.analyzeFailed', { error: (error as Error).message }), 'error', 3000);
    } finally {
      setAnalyzingId(null);
    }
  };

  // 手动导入 Chrome 书签
  const handleImportChromeBookmarks = async () => {
    if (isImporting) {
      console.log('[BookmarkList] Import already in progress, ignoring');
      return;
    }

    setIsImporting(true);

    try {
      console.log('[BookmarkList] Starting manual import from Chrome bookmarks');

      // 检查 Chrome API 是否可用
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        throw new Error('Chrome API not available');
      }

      // 发送消息到 background 触发重新导入
      const response = await chrome.runtime.sendMessage({
        type: 'REIMPORT_BOOKMARKS'
      });

      console.log('[BookmarkList] Import response:', response);

      if (response.success) {
        const { data } = response;
        showToast(
          t('sidebar.bookmarkList.import.completed', { count: data?.importedBookmarks || 0 }) ||
          `导入完成！导入了 ${data?.importedBookmarks || 0} 个书签`,
          'success',
          5000
        );

        // 立即刷新数据（导入已在 background 完成）
        await loadBookmarks();
      } else {
        throw new Error(response.error || 'Import failed');
      }
    } catch (error) {
      console.error('[BookmarkList] Manual import failed:', error);
      showToast(t('sidebar.bookmarkList.import.failed', { error: (error as Error).message }), 'error', 5000);
    } finally {
      setIsImporting(false);
    }
  };

  // 键盘导航
  useEffect(() => {
    console.log('[BookmarkList] Setting up keyboard listener, selectedIndex:', selectedIndex);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = e.target instanceof HTMLElement ? e.target.tagName : 'unknown';
      console.log('[BookmarkList] KeyDown received:', e.key, 'target:', targetTag, 'focused:', document.activeElement?.tagName);

      // 如果焦点在输入框、文本域或可编辑元素上，跳过快捷键处理
      // 这样用户在 EditDialog 或其他输入框中输入时不会触发快捷键
      const activeElement = document.activeElement;
      const isInputFocused = activeElement instanceof HTMLElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable ||
        activeElement.closest('.edit-dialog') !== null
      );
      
      if (isInputFocused) {
        // 只允许 Escape 键在输入框中生效（用于取消编辑）
        if (e.key !== 'Escape') {
          return;
        }
      }

      // 如果有修饰键（Cmd/Ctrl/Alt），跳过单字母快捷键处理
      // 这样可以避免与 Cmd+K 等系统快捷键冲突
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;

      // Ctrl/Cmd+A: 全选
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }

      const currentItem = filteredBookmarks[selectedIndex];

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          navigateUp();
          break;
        case 'k':
          // 只有没有修饰键时才处理 k 键导航
          if (!hasModifier) {
            e.preventDefault();
            navigateUp();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          navigateDown();
          break;
        case 'j':
          // 只有没有修饰键时才处理 j 键导航
          if (!hasModifier) {
            e.preventDefault();
            navigateDown();
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (currentItem) handleItemOpen(currentItem);
          break;
        case 'o':
        case 'O':
          // 只有没有修饰键时才处理
          if (!hasModifier) {
            e.preventDefault();
            // 在新标签页中打开
            if (currentItem) {
              handleItemOpen(currentItem, true);
            }
          }
          break;
        case 'y':
        case 'Y':
          // 只有没有修饰键时才处理
          if (!hasModifier) {
            e.preventDefault();
            // 复制URL
            if (currentItem && !('bookmarkCount' in currentItem)) {
              navigator.clipboard.writeText((currentItem as IBookmark).url);
              showToast(t('sidebar.bookmarkList.copy.success'), 'success', 2000);
              console.log('[BookmarkList] URL copied to clipboard');
            }
          }
          break;
        case 's':
        case 'S':
          // 只有没有修饰键时才处理（避免与 Cmd+S 冲突）
          if (!hasModifier) {
            e.preventDefault();
            // 切换星标
            if (currentItem && !('bookmarkCount' in currentItem)) {
              const bookmark = currentItem as IBookmark;
              const { updateBookmark } = useBookmarkStore.getState();
              const newStarredState = !bookmark.starred;

              // 更新星标状态并重新计算 importance
              const updatedBookmark = { ...bookmark, starred: newStarredState };
              const newImportance = calculateFrecency(updatedBookmark);

              // bookmarkStore.updateBookmark 已处理存储保存和 Chrome 同步
              updateBookmark(currentItem.id, {
                starred: newStarredState,
                analytics: {
                  ...bookmark.analytics,
                  importance: newImportance,
                },
              });
              showToast(
                newStarredState ? t('sidebar.bookmarkList.star.added') : t('sidebar.bookmarkList.star.removed'),
                'success',
                2000
              );
            }
          }
          break;
        case 'r':
        case 'R':
          // R 键：在回收站中恢复书签或文件夹
          if (!hasModifier && currentFilter === 'trash') {
            e.preventDefault();
            if (currentItem) {
              const isFolder = 'bookmarkCount' in currentItem;
              
              if (isFolder) {
                const folder = currentItem as IFolder;
                // 检查是否是回收站虚拟文件夹
                if (folder.id.startsWith('trash-folder-')) {
                  const { restoreFolder } = useBookmarkStore.getState();
                  restoreFolder(folder.path);
                  showOperationToast(t('sidebar.bookmarkList.delete.folderRestored', { title: folder.title, count: folder.bookmarkCount }), true);
                }
              } else {
                // 恢复单个书签
                restoreBookmark(currentItem.id);
                showOperationToast(t('sidebar.bookmarkList.delete.restored'), true);
              }
            }
          }
          break;
        case 'Home':
          e.preventDefault();
          setSelectedIndex(0);
          break;
        case 'g':
          // 只有没有修饰键和 shift 键时才处理
          if (!hasModifier && !e.shiftKey) {
            e.preventDefault();
            setSelectedIndex(0);
          }
          break;
        case 'End':
          e.preventDefault();
          setSelectedIndex(filteredBookmarks.length - 1);
          break;
        case 'G':
          // 只有没有修饰键时才处理
          if (!hasModifier) {
            e.preventDefault();
            setSelectedIndex(filteredBookmarks.length - 1);
          }
          break;
        case 'ArrowLeft':
          // 不处理方向键展开/折叠，只通过 Enter 或点击
          break;
        case 'ArrowRight':
          // 不处理方向键展开/折叠，只通过 Enter 或点击
          break;
        case 'd':
        case 'D':
          // 只有没有 Cmd/Ctrl/Alt 修饰键时才处理（允许 Shift+D）
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            // 删除或恢复书签/文件夹
            if (currentItem) {
              const isFolder = 'bookmarkCount' in currentItem;

              // 回收站中的文件夹恢复
              if (isFolder && currentFilter === 'trash') {
                const folder = currentItem as IFolder;
                // 检查是否是回收站虚拟文件夹
                if (folder.id.startsWith('trash-folder-')) {
                  const folderPath = folder.path;
                  if (e.shiftKey) {
                    // Shift+D: 永久删除文件夹内所有书签
                    const confirmed = window.confirm(t('sidebar.bookmarkList.delete.confirmPermanentFolder', { title: folder.title, count: folder.bookmarkCount }));
                    if (confirmed) {
                      // 获取该文件夹下所有已删除的书签并永久删除
                      const { bookmarks, permanentlyDeleteBookmark: permDelete } = useBookmarkStore.getState();
                      const bookmarksToDelete = bookmarks.filter(b => {
                        if (b.status !== 'deleted') return false;
                        const path = b.folderPath || '/';
                        return path === folderPath || path.startsWith(folderPath + '/');
                      });
                      // 使用 Promise.all 批量删除
                      Promise.all(bookmarksToDelete.map(b => permDelete(b.id)))
                        .then(() => {
                          showToast(t('sidebar.bookmarkList.delete.folderPermanentlyDeleted', { title: folder.title, count: bookmarksToDelete.length }), 'success', 2000);
                        })
                        .catch(err => {
                          console.error('[BookmarkList] Failed to permanently delete folder:', err);
                          showToast('删除失败', 'error', 2000);
                        });
                    }
                  } else {
                    // D: 恢复文件夹及其所有书签
                    const { restoreFolder } = useBookmarkStore.getState();
                    restoreFolder(folderPath);
                    showOperationToast(t('sidebar.bookmarkList.delete.folderRestored', { title: folder.title, count: folder.bookmarkCount }), true);
                  }
                  break;
                }
              }

              // 普通文件夹删除（非回收站）
              if (isFolder) {
                const folder = currentItem as IFolder;
                const confirmed = window.confirm(t('sidebar.bookmarkList.delete.confirmFolder', { title: folder.title }));
                if (confirmed) {
                  const { deleteFolder } = useBookmarkStore.getState();
                  deleteFolder(folder.id);
                  // Chrome Storage 同步已在 store 中处理
                  showOperationToast(t('sidebar.bookmarkList.delete.folderDeleted', { title: folder.title }), true);
                }
                break;
              }

              // 书签删除（原有逻辑）
              if (currentFilter === 'trash') {
                // 在回收站中，按 D 恢复，按 Shift+D 永久删除
                if (e.shiftKey) {
                  const confirmed = window.confirm(t('sidebar.bookmarkList.delete.confirmPermanent', { title: currentItem.title }));
                  if (confirmed) {
                    // 永久删除
                    permanentlyDeleteBookmark(currentItem.id);
                    // Chrome Storage 同步已在 store 中处理
                    showToast(t('sidebar.bookmarkList.delete.permanentlyDeleted'), 'success', 2000);
                  }
                } else {
                  // 恢复书签
                  restoreBookmark(currentItem.id);
                  // Chrome Storage 同步已在 store 中处理
                  showOperationToast(t('sidebar.bookmarkList.delete.restored'), true);
                }
              } else {
                // 不在回收站中，执行软删除
                const confirmed = window.confirm(t('sidebar.bookmarkList.delete.confirmDelete', { title: currentItem.title }));
                if (confirmed) {
                  const { deleteBookmark } = useBookmarkStore.getState();
                  deleteBookmark(currentItem.id);
                  // Chrome Storage 同步已在 store 中处理
                  showOperationToast(t('sidebar.bookmarkList.delete.movedToTrash'), true);
                }
              }
            }
          }
          break;
        case 'p':
        case 'P':
          // 只没有修饰键时才处理
          if (!hasModifier) {
            e.preventDefault();
            // 固定/取消固定（使用 pinned 字段）
            if (currentItem && !('bookmarkCount' in currentItem)) {
              const bookmark = currentItem as IBookmark;
              const { updateBookmark } = useBookmarkStore.getState();
              const newPinnedState = !bookmark.pinned;
              // bookmarkStore.updateBookmark 已处理存储保存和 Chrome 同步
              updateBookmark(currentItem.id, { pinned: newPinnedState });
              showToast(
                newPinnedState ? t('sidebar.bookmarkList.star.pinned') : t('sidebar.bookmarkList.star.unpinned'),
                'success',
                2000
              );
            }
          }
          break;
        case 'PageUp':
          e.preventDefault();
          // 向上翻页（10项）
          setSelectedIndex(Math.max(0, selectedIndex - 10));
          break;
        case 'PageDown':
          e.preventDefault();
          // 向下翻页（10项）
          setSelectedIndex(Math.min(filteredBookmarks.length - 1, selectedIndex + 10));
          break;
        case 'Escape':
          // 取消编辑模式或清除多选
          if (editingId) {
            e.preventDefault();
            setEditingId(null);
            setEditingTitle('');
            showToast(t('sidebar.bookmarkList.edit.cancelled'), 'info', 1500);
          } else if (selectedIds.size > 0) {
            e.preventDefault();
            clearSelection();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, filteredBookmarks, navigateUp, navigateDown, setSelectedIndex, editingId, selectedIds, clearSelection, selectAll]);

  // 确保选中项可见
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // 自动选中第一项或调整选中索引
  useEffect(() => {
    if (filteredBookmarks.length === 0) {
      // 没有结果时，重置选中状态
      if (selectedIndex !== -1) {
        setSelectedIndex(-1);
      }
    } else if (selectedIndex === -1 || selectedIndex >= filteredBookmarks.length) {
      // 如果当前索引无效，选中第一项
      setSelectedIndex(0);
    }
  }, [filteredBookmarks.length, selectedIndex, setSelectedIndex]);

  const handleItemClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      const item = filteredBookmarks[index];
      const isFolder = item && 'bookmarkCount' in item;
      
      // 文件夹不参与多选
      if (isFolder) {
        setSelectedIndex(index);
        return;
      }
      
      const { toggleSelectItem, selectRange, clearSelection } = useBookmarkStore.getState();
      
      // Shift+Click: 范围选择
      if (e.shiftKey && !isFolder) {
        e.preventDefault();
        selectRange(item.id);
        return;
      }
      
      // Ctrl/Cmd+Click: 切换选择
      if ((e.ctrlKey || e.metaKey) && !isFolder) {
        e.preventDefault();
        toggleSelectItem(item.id);
        return;
      }
      
      // 普通点击：清除多选，设置单选
      clearSelection();
      setSelectedIndex(index);
    },
    [setSelectedIndex, filteredBookmarks]
  );

  const handleItemOpen = useCallback(
    (item: IBookmark | IFolder, openInNewTab = false) => {
      if ('bookmarkCount' in item) {
        // 是目录，展开/折叠
        const { toggleFolderExpanded } = useBookmarkStore.getState();
        toggleFolderExpanded(item.id);
      } else {
        // 是书签，打开链接
        const bookmark = item as IBookmark;

        // 检查 Chrome API 是否可用
        if (typeof chrome === 'undefined' || !chrome.tabs) {
          console.error('[BookmarkList] Chrome tabs API not available');
          showToast(t('sidebar.bookmarkList.open.apiUnavailable'), 'error', 3000);
          return;
        }

        try {
          if (openInNewTab) {
            // 在新标签页打开
            chrome.tabs.create({ url: bookmark.url });
          } else {
            // 在当前标签页打开（替换侧边栏）
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]?.id) {
                chrome.tabs.update(tabs[0].id, { url: bookmark.url });
              } else {
                // 如果无法获取当前标签页，回退到新标签页
                chrome.tabs.create({ url: bookmark.url });
              }
            });
          }

          // 更新访问统计和重要性
          const { updateBookmark } = useBookmarkStore.getState();
          const updatedBookmark = {
            ...bookmark,
            analytics: {
              ...bookmark.analytics,
              visitCount: bookmark.analytics.visitCount + 1,
              lastVisit: Date.now(),
            },
          };
          // 使用 Frecency 算法计算新的 importance
          const newImportance = calculateFrecency(updatedBookmark);
          // bookmarkStore.updateBookmark 已处理存储保存和 Chrome 同步
          updateBookmark(bookmark.id, {
            analytics: {
              ...updatedBookmark.analytics,
              importance: newImportance,
            },
          });

          console.log('[BookmarkList] Bookmark opened:', bookmark.title, openInNewTab ? '(new tab)' : '(current tab)');
        } catch (error) {
          console.error('[BookmarkList] Failed to open bookmark:', error);
          showToast(t('sidebar.bookmarkList.open.failed'), 'error', 3000);
        }
      }
    },
    []
  );

  const handleItemDoubleClick = useCallback(
    (item: IBookmark | IFolder) => {
      handleItemOpen(item);
    },
    [handleItemOpen]
  );

  // 保存编辑
  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editingTitle.trim()) {
      showToast(t('sidebar.bookmarkList.edit.emptyTitle'), 'error', 2000);
      return;
    }

    const item = filteredBookmarks.find(item => item.id === editingId);
    if (!item) return;

    const isFolder = 'bookmarkCount' in item;

    if (isFolder) {
      // 更新文件夹标题
      const { updateFolder } = useBookmarkStore.getState();
      updateFolder(editingId, { title: editingTitle.trim() });
      showToast(t('sidebar.bookmarkList.edit.folderRenamed'), 'success', 2000);
    } else {
      // 更新书签标题
      const { updateBookmark } = useBookmarkStore.getState();
      // bookmarkStore.updateBookmark 已处理存储保存和 Chrome 同步
      updateBookmark(editingId, { title: editingTitle.trim() });
      showToast(t('sidebar.bookmarkList.edit.bookmarkUpdated'), 'success', 2000);
    }

    setEditingId(null);
    setEditingTitle('');
  }, [editingId, editingTitle, filteredBookmarks, t]);

  // 拖拽处理
  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      setDraggedIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index.toString());
      
      // 设置拖动图像
      const target = e.currentTarget as HTMLElement;
      const dragImage = target.cloneNode(true) as HTMLElement;
      dragImage.style.opacity = '0.5';
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      if (draggedIndex !== null && draggedIndex !== index) {
        setDragOverIndex(index);
        
        // 检查是否悬停在文件夹上
        const targetItem = filteredBookmarks[index];
        const isTargetFolder = targetItem && 'bookmarkCount' in targetItem;
        
        // 计算鼠标在目标元素中的位置
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;
        const edgeThreshold = height * 0.25; // 上下 25% 为边缘区域
        
        let position: 'top' | 'center' | 'bottom';
        if (y < edgeThreshold) {
          position = 'top';
        } else if (y > height - edgeThreshold) {
          position = 'bottom';
        } else {
          position = 'center';
        }
        setDragPosition(position);
        
        if (isTargetFolder) {
          const folderId = targetItem.id;
          
          // 如果悬停在新的文件夹上，启动自动展开计时器
          if (dragOverFolderId !== folderId) {
            // 清除之前的计时器
            if (dragOverTimerRef.current) {
              clearTimeout(dragOverTimerRef.current);
            }
            
            setDragOverFolderId(folderId);
            
            // 800ms 后自动展开文件夹（仅在中心位置时）
            if (position === 'center') {
              dragOverTimerRef.current = setTimeout(() => {
                const { expandedFolderIds, expandFolder } = useBookmarkStore.getState();
                if (!expandedFolderIds.has(folderId)) {
                  expandFolder(folderId);
                }
              }, 800);
            }
          }
        } else {
          // 不在文件夹上，清除计时器
          if (dragOverTimerRef.current) {
            clearTimeout(dragOverTimerRef.current);
            dragOverTimerRef.current = null;
          }
          setDragOverFolderId(null);
        }
      }
    },
    [draggedIndex, filteredBookmarks, dragOverFolderId]
  );

  const handleDragEnd = useCallback(() => {
    // 清除自动展开计时器
    if (dragOverTimerRef.current) {
      clearTimeout(dragOverTimerRef.current);
      dragOverTimerRef.current = null;
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDragOverFolderId(null);
    setDragPosition(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();

      if (draggedIndex === null || draggedIndex === dropIndex) {
        return;
      }

      const draggedItem = filteredBookmarks[draggedIndex];
      const targetItem = filteredBookmarks[dropIndex];
      const isDraggedFolder = 'bookmarkCount' in draggedItem;
      const isTargetFolder = 'bookmarkCount' in targetItem;

      // Case 1: 拖拽文件夹到另一个文件夹
      if (isDraggedFolder && isTargetFolder) {
        const draggedFolder = draggedItem as IFolder;
        const targetFolder = targetItem as IFolder;

        // 防止移动到自身或子文件夹
        if (draggedFolder.id === targetFolder.id || targetFolder.path.startsWith(draggedFolder.path + '/')) {
          showToast(t('sidebar.bookmarkList.drag.cannotMoveToSelf'), 'error', 2000);
          setDraggedIndex(null);
          setDragOverIndex(null);
          setDragPosition(null);
          return;
        }

        // 根据拖拽位置决定操作
        if (dragPosition === 'center') {
          // 中心位置：移动到文件夹内
          moveFolderToFolder(draggedFolder.id, targetFolder.id);
          showOperationToast(t('sidebar.bookmarkList.drag.folderMoved', { title: targetFolder.title }), true);
        } else {
          // 边缘位置：同级排序
          const getParentPath = (path: string): string => {
            const parts = path.split('/').filter(Boolean);
            if (parts.length <= 1) return '/';
            return '/' + parts.slice(0, -1).join('/');
          };
          
          const draggedParent = getParentPath(draggedFolder.path);
          const targetParent = getParentPath(targetFolder.path);
          
          if (draggedParent === targetParent) {
            // 同级文件夹，执行排序
            reorderBookmarks(draggedIndex, dropIndex);
            showToast(t('sidebar.bookmarkList.drag.folderReordered'), 'success', 1500);
          } else {
            // 不同级别，边缘位置也执行移动（因为无法跨级排序）
            moveFolderToFolder(draggedFolder.id, targetFolder.id);
            showOperationToast(t('sidebar.bookmarkList.drag.folderMoved', { title: targetFolder.title }), true);
          }
        }
      }
      // Case 2: 拖拽书签到文件夹
      else if (!isDraggedFolder && isTargetFolder) {
        const targetFolder = targetItem as IFolder;

        // 书签拖到文件夹，无论边缘还是中心，都移动到文件夹内
        // （书签不能和文件夹"排序"，只能移动进去）
        moveBookmarkToFolder(draggedItem.id, targetItem.id);
        showOperationToast(t('sidebar.bookmarkList.drag.movedToFolder', { title: targetFolder.title }), true);
      }
      // Case 3: 同级重新排序（书签之间）
      else {
        reorderBookmarks(draggedIndex, dropIndex);
        showToast(isDraggedFolder ? t('sidebar.bookmarkList.drag.folderReordered') : t('sidebar.bookmarkList.drag.bookmarkReordered'), 'success', 1500);
      }

      setDraggedIndex(null);
      setDragOverIndex(null);
      setDragOverFolderId(null);
      setDragPosition(null);
      
      // 清除自动展开计时器
      if (dragOverTimerRef.current) {
        clearTimeout(dragOverTimerRef.current);
        dragOverTimerRef.current = null;
      }
    },
    [draggedIndex, dragPosition, filteredBookmarks, reorderBookmarks, moveBookmarkToFolder, moveFolderToFolder, t]
  );

  if (filteredBookmarks.length === 0) {
    console.log('[BookmarkList] No bookmarks displayed, currentFilter:', currentFilter, 'searchQuery:', searchQuery);
    
    // 如果有搜索关键词，显示搜索无结果
    if (searchQuery && searchQuery.trim().length > 0) {
      return (
        <div className="bookmark-list-empty">
          <p>{t('sidebar.bookmarkList.empty.noSearchResults')}</p>
          <p className="empty-hint">
            {t('sidebar.bookmarkList.empty.tryDifferentKeywords')}
          </p>
        </div>
      );
    }
    
    // 如果是 Chrome 分类且没有书签（不是搜索无结果），显示导入按钮
    if (currentFilter === 'chrome') {
      console.log('[BookmarkList] Rendering import button for Chrome filter');
      return (
        <div className="bookmark-list-empty">
          <div className="empty-icon">
            <Chrome size={48} strokeWidth={1} />
          </div>
          <h3>{t('sidebar.bookmarkList.empty.chromeTitle')}</h3>
          <p>{t('sidebar.bookmarkList.empty.chromeDesc')}</p>
          <button 
            className="btn-primary import-chrome-btn"
            onClick={handleImportChromeBookmarks}
            disabled={isImporting}
          >
            {isImporting ? (
              <>
                <RefreshCw size={18} className="spinning" />
                {t('sidebar.bookmarkList.empty.importing')}
              </>
            ) : (
              <>
                <Download size={18} />
                {t('sidebar.bookmarkList.empty.importButton')}
              </>
            )}
          </button>
        </div>
      );
    }
    
    return (
      <div className="bookmark-list-empty">
        <p>{t('sidebar.bookmarkList.empty.noBookmarks')}</p>
        <p className="empty-hint">
          {t('sidebar.bookmarkList.empty.adjustFilters')}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`bookmark-list view-${viewMode}`}
      ref={(el) => {
        containerRef.current = el;
        listRef.current = el;
      }}
      tabIndex={0}
      onFocus={() => {
        // 确保选中项可见
        if (selectedItemRef.current) {
          selectedItemRef.current.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth',
          });
        }
      }}
      // 不阻止事件冒泡，让document上的监听器也能收到键盘事件
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
            <button className="star" onClick={() => starSelectedBookmarks(true)} title={t('sidebar.bookmarkList.multiSelect.star')}>
              <Star size={14} />
            </button>
            <button className="danger" onClick={() => {
              if (window.confirm(t('sidebar.bookmarkList.multiSelect.confirmDelete', { count: selectedIds.size }))) {
                deleteSelectedBookmarks();
                showOperationToast(t('sidebar.bookmarkList.multiSelect.deleted', { count: selectedIds.size }), true);
              }
            }} title={t('sidebar.bookmarkList.multiSelect.delete')}>
              <Trash2 size={14} />
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
        {/* 占位容器 - 高度为总高度 */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          {/* 选中指示器 - 放在滚动容器内部，使用绝对定位 */}
          {selectedIndex >= 0 && selectedIndex < filteredBookmarks.length && (
            <div
              className="selection-indicator"
              style={{
                height: ITEM_HEIGHT,
                top: selectedIndex * ITEM_HEIGHT,
                transform: 'none',
              }}
            />
          )}
          
          {/* 可见项目列表 */}
          <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
            {visibleItems.map((item, relativeIndex) => {
              const absoluteIndex = visibleStartIndex + relativeIndex;
              const isFolder = 'bookmarkCount' in item;
              return (
                <div
                  key={item.id}
                  ref={absoluteIndex === selectedIndex ? selectedItemRef : null}
                >
                  <BookmarkItem
                    item={item}
                    index={absoluteIndex}
                    isSelected={absoluteIndex === selectedIndex}
                    isMultiSelected={!isFolder && selectedIds.has(item.id)}
                    onClick={(e) => handleItemClick(absoluteIndex, e)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onDragStart={(e) => handleDragStart(e, absoluteIndex)}
                    onDragOver={(e) => handleDragOver(e, absoluteIndex)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, absoluteIndex)}
                    isDragOver={absoluteIndex === dragOverIndex}
                    isDragging={absoluteIndex === draggedIndex}
                    isDragTargetFolder={dragOverFolderId === item.id}
                    dragPosition={absoluteIndex === dragOverIndex ? dragPosition : null}
                    searchQuery={searchQuery}
                    isEditing={editingId === item.id}
                    editingTitle={editingTitle}
                    onEditingTitleChange={setEditingTitle}
                    onSaveEdit={handleSaveEdit}
                    onAnalyze={!isFolder ? handleAnalyzeBookmark : undefined}
                    isAnalyzing={analyzingId === item.id}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookmarkList;
