/**
 * ColumnView - 分栏视图（类似 Finder 分栏视图）
 * 支持拖拽：拖入文件夹、同级排序、循环检测
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, FolderOpen, ChevronRight, Star } from 'lucide-react';
import { getOptimizedFaviconUrl } from '../../../utils/faviconUtils';
import { getBestIcon } from '../../../utils/iconUtils';
import type { MergedItem, MergedBookmark } from '../../../types/chromeBookmark';
import { isMergedFolder, isMergedBookmark } from '../../../types/chromeBookmark';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { useDragAndDrop } from '../../hooks/useDragAndDrop';
import './ColumnView.css';

interface ColumnViewProps {
  items: MergedItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (item: MergedItem) => void;
}

interface ColumnData {
  parentId: string | null;
  items: MergedItem[];
}

const ColumnFavicon: React.FC<{ bookmark: MergedBookmark }> = ({ bookmark }) => {
  const [error, setError] = useState(false);
  const favicon = getOptimizedFaviconUrl(bookmark.favicon, bookmark.url, 16);

  if (error || !favicon) {
    const IconComponent = getBestIcon(bookmark.url, bookmark.title);
    return <IconComponent size={16} strokeWidth={1.5} />;
  }

  return (
    <img
      src={favicon}
      alt=""
      className="favicon-small"
      onError={() => setError(true)}
    />
  );
};

const ColumnView: React.FC<ColumnViewProps> = ({
  items: externalItems,
  selectedId: externalSelectedId,
  onSelect,
  onOpen,
}) => {
  const { t } = useTranslation();
  const { folders, bookmarks, anyMarkRootId, searchQuery, currentFilter, selectedIds } = useBookmarkStore();
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 判断是否使用外部数据（搜索模式 或 非 Chrome 树形 tab）
  const isSearchMode = Boolean(searchQuery && searchQuery.trim().length > 0);
  const useFlatMode = isSearchMode || currentFilter !== 'chrome';

  // 扁平模式下使用外部选中状态
  const effectiveSelectedPath = useFlatMode && externalSelectedId
    ? [externalSelectedId]
    : selectedPath;

  // 获取文件夹的子项
  const getChildItems = useCallback((parentId: string): MergedItem[] => {
    const childFolders = folders.filter(f => f.parentId === parentId);
    const childBookmarks = bookmarks.filter(b => b.parentId === parentId);
    return [...childFolders, ...childBookmarks];
  }, [folders, bookmarks]);

  // 当前活跃列的所有项目（用于 drag hook）
  const activeColumnItems = columns[activeColumnIndex]?.items || [];

  // 拖拽 Hook
  const { handlers: dragHandlers, getDragClass } = useDragAndDrop({
    viewType: 'column',
    items: activeColumnItems,
    selectedIds,
    onAutoExpand: (folderId) => {
      // 分栏视图的自动展开 = 展开下一列
      const folder = folders.find(f => f.chromeId === folderId);
      if (folder) {
        const childItems = getChildItems(folderId);
        const newColumns = columns.slice(0, activeColumnIndex + 1);
        newColumns.push({ parentId: folderId, items: childItems });
        setColumns(newColumns);
      }
    },
  });

  // 初始化第一列 或 扁平模式显示过滤结果
  useEffect(() => {
    if (useFlatMode) {
      // 扁平模式（搜索 / 过滤 tab）：显示过滤结果作为单列
      setColumns([{ parentId: null, items: externalItems }]);
      setSelectedPath([]);
      setActiveColumnIndex(0);
    } else if (anyMarkRootId) {
      // Chrome 树形模式：显示根目录
      const rootItems = getChildItems(anyMarkRootId);
      setColumns([{ parentId: anyMarkRootId, items: rootItems }]);
      setSelectedPath([]);
      setActiveColumnIndex(0);
    }
  }, [anyMarkRootId, getChildItems, useFlatMode, externalItems]);

  // 处理项目选择
  const handleItemClick = (item: MergedItem, columnIndex: number) => {
    onSelect(item.chromeId);
    setActiveColumnIndex(columnIndex);

    if (isMergedFolder(item)) {
      // 点击文件夹：展开下一列
      const childItems = getChildItems(item.chromeId);
      const newColumns = columns.slice(0, columnIndex + 1);
      newColumns.push({ parentId: item.chromeId, items: childItems });
      setColumns(newColumns);
      setSelectedPath([...selectedPath.slice(0, columnIndex), item.chromeId]);
    } else {
      // 点击书签：保持当前列，更新选中路径
      const newColumns = columns.slice(0, columnIndex + 1);
      setColumns(newColumns);
      setSelectedPath([...selectedPath.slice(0, columnIndex), item.chromeId]);
    }
  };

  // 处理双击
  const handleItemDoubleClick = (item: MergedItem) => {
    onOpen(item);
  };

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentColumn = columns[activeColumnIndex];
    if (!currentColumn || currentColumn.items.length === 0) return;

    const currentSelectedId = selectedPath[activeColumnIndex];
    const currentIndex = currentColumn.items.findIndex(item => item.chromeId === currentSelectedId);

    switch (e.key) {
      case 'ArrowUp':
      case 'k': {
        e.preventDefault();
        const newIndex = currentIndex > 0 ? currentIndex - 1 : currentColumn.items.length - 1;
        const newItem = currentColumn.items[newIndex];
        handleItemClick(newItem, activeColumnIndex);
        break;
      }
      case 'ArrowDown':
      case 'j': {
        e.preventDefault();
        const newIndex = currentIndex < currentColumn.items.length - 1 ? currentIndex + 1 : 0;
        const newItem = currentColumn.items[newIndex];
        handleItemClick(newItem, activeColumnIndex);
        break;
      }
      case 'ArrowLeft':
      case 'h': {
        e.preventDefault();
        // 返回上一列
        if (activeColumnIndex > 0) {
          setActiveColumnIndex(activeColumnIndex - 1);
        }
        break;
      }
      case 'ArrowRight':
      case 'l':
      case 'Enter': {
        e.preventDefault();
        const selectedItem = currentColumn.items.find(item => item.chromeId === currentSelectedId);
        if (!selectedItem) {
          // 没有选中项，选中第一个
          if (currentColumn.items.length > 0) {
            handleItemClick(currentColumn.items[0], activeColumnIndex);
          }
          return;
        }

        if (isMergedFolder(selectedItem) && !useFlatMode) {
          // 非搜索模式：文件夹展开并移动到下一列
          const childItems = getChildItems(selectedItem.chromeId);
          const newColumns = columns.slice(0, activeColumnIndex + 1);
          newColumns.push({ parentId: selectedItem.chromeId, items: childItems });
          setColumns(newColumns);
          setActiveColumnIndex(activeColumnIndex + 1);
          // 选中下一列第一项
          if (childItems.length > 0) {
            setSelectedPath([...selectedPath.slice(0, activeColumnIndex + 1), childItems[0].chromeId]);
            onSelect(childItems[0].chromeId);
          }
        } else if (e.key === 'Enter') {
          // 搜索模式的文件夹 或 书签：通过父组件处理
          onOpen(selectedItem);
        }
        break;
      }
      default:
        return;
    }
  }, [columns, activeColumnIndex, selectedPath, getChildItems, onSelect, onOpen, handleItemClick, useFlatMode]);

  return (
    <div className="column-view" ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown}>
      {columns.map((column, colIndex) => (
        <div key={column.parentId || 'root'} className="column">
          <div className="column-content">
            {column.items.map((item) => {
              const isFolder = isMergedFolder(item);
              const isBookmark = isMergedBookmark(item);
              const isSelected = effectiveSelectedPath[colIndex] === item.chromeId;

              return (
                <div
                  key={item.chromeId}
                  className={`column-item ${isSelected ? 'selected' : ''} ${isFolder ? 'folder' : 'bookmark'} ${getDragClass(item.chromeId)}`}
                  onClick={() => handleItemClick(item, colIndex)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  draggable
                  onDragStart={(e) => dragHandlers.onDragStart(item, e)}
                  onDragOver={(e) => {
                    setActiveColumnIndex(colIndex);
                    dragHandlers.onDragOver(item, e);
                  }}
                  onDragLeave={dragHandlers.onDragLeave}
                  onDragEnd={dragHandlers.onDragEnd}
                  onDrop={(e) => dragHandlers.onDrop(item, e)}
                >
                  <div className="item-icon">
                    {isFolder ? (
                      isSelected ? <FolderOpen size={16} strokeWidth={1.5} /> : <Folder size={16} strokeWidth={1.5} />
                    ) : (
                      <ColumnFavicon bookmark={item as MergedBookmark} />
                    )}
                  </div>
                  <span className="item-title">{item.title || 'Untitled'}</span>
                  {isBookmark && (item as MergedBookmark).starred && (
                    <Star size={12} className="star-icon" fill="currentColor" />
                  )}
                  {isFolder && <ChevronRight size={14} className="chevron" />}
                </div>
              );
            })}
            {column.items.length === 0 && (
              <div className="column-empty">{t('columnView.empty', 'Empty')}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ColumnView;
