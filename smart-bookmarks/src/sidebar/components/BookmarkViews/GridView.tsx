/**
 * GridView - 网格视图（类似 Finder 图标视图）
 * 支持文件夹导航：进入文件夹显示子内容，ESC 返回上级
 * 支持拖拽：拖入文件夹、同级排序、循环检测
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Star, ChevronLeft } from 'lucide-react';
import { getOptimizedFaviconUrl } from '../../../utils/faviconUtils';
import { getBestIcon } from '../../../utils/iconUtils';
import type { MergedItem, MergedBookmark, MergedFolder } from '../../../types/chromeBookmark';
import { isMergedFolder, isMergedBookmark } from '../../../types/chromeBookmark';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { useDragAndDrop } from '../../hooks/useDragAndDrop';
import './GridView.css';

interface GridViewProps {
  items: MergedItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (item: MergedItem) => void;
}

interface FaviconImageProps {
  bookmark: MergedBookmark;
}

const FaviconImage: React.FC<FaviconImageProps> = ({ bookmark }) => {
  const [error, setError] = useState(false);
  const favicon = getOptimizedFaviconUrl(bookmark.favicon, bookmark.url, 64);

  if (error || !favicon) {
    const IconComponent = getBestIcon(bookmark.url, bookmark.title);
    return <IconComponent size={48} strokeWidth={1.5} />;
  }

  return (
    <img
      src={favicon}
      alt=""
      className="favicon-large"
      onError={() => setError(true)}
    />
  );
};

const GridView: React.FC<GridViewProps> = ({
  items: externalItems,
  selectedId: externalSelectedId,
  onSelect,
  onOpen,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);
  const { folders, bookmarks, anyMarkRootId, searchQuery, currentFilter, selectedIds } = useBookmarkStore();

  // 判断是否使用外部数据（搜索模式 或 非 Chrome 树形 tab）
  const isSearchMode = Boolean(searchQuery && searchQuery.trim().length > 0);
  const useFlatMode = isSearchMode || currentFilter !== 'chrome';

  // 导航状态：当前文件夹 ID 和路径历史（仅在非搜索模式下使用）
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<MergedFolder[]>([]);
  // 本地选中状态（因为导航到不同文件夹时，父组件的 selectedId 可能不在当前文件夹）
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  // 初始化：设置根目录
  useEffect(() => {
    if (anyMarkRootId && !currentFolderId) {
      setCurrentFolderId(anyMarkRootId);
    }
  }, [anyMarkRootId, currentFolderId]);

  // 切回文件夹导航模式时重置导航状态
  useEffect(() => {
    if (!useFlatMode && anyMarkRootId) {
      setCurrentFolderId(anyMarkRootId);
      setPathHistory([]);
    }
  }, [useFlatMode, anyMarkRootId]);

  // 获取当前文件夹的子项
  const getNavigationItems = useCallback((): MergedItem[] => {
    if (!currentFolderId) return [];
    const childFolders = folders.filter(f => f.parentId === currentFolderId);
    const childBookmarks = bookmarks.filter(b => b.parentId === currentFolderId);
    return [...childFolders, ...childBookmarks];
  }, [currentFolderId, folders, bookmarks]);

  // 当前显示的项目：扁平模式（搜索/过滤 tab）用外部传入的，文件夹导航模式用内部计算的
  const currentItems = useFlatMode ? externalItems : getNavigationItems();
  // 选中状态：扁平模式用外部的，导航模式用本地的
  const effectiveSelectedId = useFlatMode ? externalSelectedId : localSelectedId;

  // 拖拽 Hook
  const { handlers: dragHandlers, getDragClass } = useDragAndDrop({
    viewType: 'grid',
    items: currentItems,
    selectedIds,
    onAutoExpand: (folderId) => {
      // 网格视图的自动展开 = 进入文件夹
      const folder = folders.find(f => f.chromeId === folderId);
      if (folder) {
        enterFolder(folder);
      }
    },
  });

  // 计算列数
  useEffect(() => {
    const updateColumns = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        const itemWidth = 100; // grid item min-width
        setColumns(Math.max(1, Math.floor(width / itemWidth)));
      }
    };
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // 进入文件夹
  const enterFolder = useCallback((folder: MergedFolder) => {
    const currentFolder = folders.find(f => f.chromeId === currentFolderId);
    if (currentFolder) {
      setPathHistory(prev => [...prev, currentFolder]);
    }
    setCurrentFolderId(folder.chromeId);
    onSelect(folder.chromeId);
  }, [currentFolderId, folders, onSelect]);

  // 返回上一级
  const goBack = useCallback(() => {
    if (pathHistory.length > 0) {
      const newHistory = [...pathHistory];
      const parentFolder = newHistory.pop();
      setPathHistory(newHistory);
      if (parentFolder) {
        setCurrentFolderId(parentFolder.chromeId);
        onSelect(parentFolder.chromeId);
      }
    } else if (anyMarkRootId && currentFolderId !== anyMarkRootId) {
      // 如果没有历史但不在根目录，返回根目录
      setCurrentFolderId(anyMarkRootId);
    }
  }, [pathHistory, anyMarkRootId, currentFolderId, onSelect]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // ESC 返回上一级
    if (e.key === 'Escape') {
      e.preventDefault();
      goBack();
      return;
    }

    if (!currentItems.length) return;

    const currentIndex = effectiveSelectedId
      ? currentItems.findIndex(item => item.chromeId === effectiveSelectedId)
      : -1;

    // 如果没有选中项，选中第一个
    if (currentIndex === -1) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'j', 'k', 'h', 'l'].includes(e.key)) {
        e.preventDefault();
        const firstId = currentItems[0].chromeId;
        if (!useFlatMode) setLocalSelectedId(firstId);
        onSelect(firstId);
      }
      return;
    }

    let newIndex = currentIndex;
    const currentRow = Math.floor(currentIndex / columns);
    const currentCol = currentIndex % columns;
    const totalRows = Math.ceil(currentItems.length / columns);

    switch (e.key) {
      case 'ArrowUp':
      case 'k': {
        e.preventDefault();
        if (currentRow > 0) {
          newIndex = (currentRow - 1) * columns + currentCol;
        }
        break;
      }
      case 'ArrowDown':
      case 'j': {
        e.preventDefault();
        if (currentRow < totalRows - 1) {
          const targetIndex = (currentRow + 1) * columns + currentCol;
          newIndex = Math.min(currentItems.length - 1, targetIndex);
        }
        break;
      }
      case 'ArrowLeft':
      case 'h': {
        e.preventDefault();
        if (currentIndex > 0) {
          newIndex = currentIndex - 1;
        }
        break;
      }
      case 'ArrowRight':
      case 'l': {
        e.preventDefault();
        if (currentIndex < currentItems.length - 1) {
          newIndex = currentIndex + 1;
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        const selectedItem = currentItems[currentIndex];
        if (isMergedFolder(selectedItem) && !useFlatMode) {
          // 非搜索模式：进入文件夹导航
          enterFolder(selectedItem);
        } else {
          // 搜索模式或书签：通过父组件处理
          onOpen(selectedItem);
        }
        return;
      }
      default:
        return;
    }

    if (newIndex >= 0 && newIndex < currentItems.length && newIndex !== currentIndex) {
      const newId = currentItems[newIndex].chromeId;
      if (!useFlatMode) setLocalSelectedId(newId);
      onSelect(newId);
    }
  }, [currentItems, effectiveSelectedId, columns, onSelect, onOpen, goBack, enterFolder, useFlatMode]);

  // 获取当前文件夹名称
  const currentFolderName = currentFolderId
    ? folders.find(f => f.chromeId === currentFolderId)?.title || 'AnyMark'
    : 'AnyMark';

  return (
    <div
      className="grid-view-container"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* 导航栏 - 搜索模式时隐藏返回按钮 */}
      <div className="grid-nav-bar">
        {!useFlatMode && (
          <button
            className="grid-back-btn"
            onClick={goBack}
            disabled={pathHistory.length === 0 && currentFolderId === anyMarkRootId}
            title={t('gridView.backToParent', '返回上级 (ESC)')}
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <span className="grid-current-folder">
          {useFlatMode
            ? (isSearchMode
                ? t('gridView.searchResults', '搜索: "{{query}}"', { query: searchQuery })
                : t(`filters.${currentFilter}`, currentFilter))
            : currentFolderName}
        </span>
        <span className="grid-item-count">{currentItems.length} {t('gridView.items', '项')}</span>
      </div>

      {/* 网格内容 */}
      <div className="grid-view">
        {currentItems.map((item) => {
          const isFolder = isMergedFolder(item);
          const isBookmark = isMergedBookmark(item);
          const isSelected = item.chromeId === effectiveSelectedId;

          return (
            <div
              key={item.chromeId}
              className={`grid-item ${isSelected ? 'selected' : ''} ${isFolder ? 'folder' : 'bookmark'} ${getDragClass(item.chromeId)}`}
              onClick={() => {
                if (!useFlatMode) setLocalSelectedId(item.chromeId);
                onSelect(item.chromeId);
              }}
              onDoubleClick={() => {
                if (isFolder && !useFlatMode) {
                  // 非搜索模式：进入文件夹导航
                  enterFolder(item as MergedFolder);
                } else {
                  // 搜索模式或书签：通过父组件处理
                  onOpen(item);
                }
              }}
              draggable
              onDragStart={(e) => dragHandlers.onDragStart(item, e)}
              onDragOver={(e) => dragHandlers.onDragOver(item, e)}
              onDragLeave={dragHandlers.onDragLeave}
              onDragEnd={dragHandlers.onDragEnd}
              onDrop={(e) => dragHandlers.onDrop(item, e)}
              role="button"
              aria-selected={isSelected}
            >
              <div className="grid-item-icon">
                {isFolder ? (
                  <Folder size={48} strokeWidth={1.5} />
                ) : (
                  <FaviconImage bookmark={item as MergedBookmark} />
                )}
              </div>
              <div className="grid-item-title">
                {item.title || 'Untitled'}
              </div>
              {isBookmark && (item as MergedBookmark).starred && (
                <Star size={12} className="star-badge" fill="currentColor" />
              )}
            </div>
          );
        })}
        {currentItems.length === 0 && (
          <div className="grid-empty">{t('gridView.emptyFolder', '此文件夹为空')}</div>
        )}
      </div>
    </div>
  );
};

export default GridView;
