/**
 * useDragAndDrop - 共享拖拽逻辑 Hook
 *
 * 为 List/Grid/Column 三种视图提供统一的拖拽功能：
 * - 拖拽到文件夹（移入）
 * - 同级排序（上/下）
 * - 悬停自动展开文件夹
 * - 循环检测（禁止拖入自身后代）
 * - 批量拖拽（多选后拖动）
 */

import { useState, useCallback, useRef } from 'react';
import type { MergedItem } from '../../types/chromeBookmark';
import { isMergedFolder } from '../../types/chromeBookmark';
import { useBookmarkStore } from '../store/bookmarkStore';

export type DragPosition = 'top' | 'center' | 'bottom' | 'forbidden' | null;

export interface DragState {
  draggedIds: string[];
  dragOverId: string | null;
  dragPosition: DragPosition;
  isDragging: boolean;
  autoExpandId: string | null;
}

interface UseDragAndDropOptions {
  /** 视图类型，影响位置检测逻辑 */
  viewType: 'list' | 'grid' | 'column';
  /** 当前显示的项目列表 */
  items: MergedItem[];
  /** 多选集合 */
  selectedIds: Set<string>;
  /** 拖拽成功后的 toast 回调 */
  onDragSuccess?: (message: string) => void;
  /** 拖拽失败后的 toast 回调 */
  onDragError?: (message: string) => void;
  /** 悬停自动展开文件夹的回调 */
  onAutoExpand?: (folderId: string) => void;
}

export function useDragAndDrop({
  viewType,
  items,
  selectedIds,
  onDragSuccess,
  onDragError,
  onAutoExpand,
}: UseDragAndDropOptions) {
  const {
    folders,
    moveBookmark,
    moveFolder,
    reorderItem,
  } = useBookmarkStore();

  // 拖拽状态
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<DragPosition>(null);

  // 悬停自动展开
  const [autoExpandId, setAutoExpandId] = useState<string | null>(null);
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDragOverIdRef = useRef<string | null>(null);

  // 循环检测缓存
  const descendantCacheRef = useRef<Map<string, Set<string>>>(new Map());

  const isDragging = draggedIds.length > 0;

  // 获取文件夹所有后代 ID（用于循环检测）
  const getDescendantIds = useCallback((folderId: string): Set<string> => {
    const cached = descendantCacheRef.current.get(folderId);
    if (cached) return cached;

    const descendants = new Set<string>();
    const stack = [folderId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      descendants.add(current);
      const childFolders = folders.filter(f => f.parentId === current);
      for (const child of childFolders) {
        stack.push(child.chromeId);
      }
    }

    descendantCacheRef.current.set(folderId, descendants);
    return descendants;
  }, [folders]);

  // 清理悬停展开定时器
  const clearAutoExpandTimer = useCallback(() => {
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
  }, []);

  // 检测是否会造成循环（拖拽文件夹到自身后代）
  const wouldCreateCycle = useCallback((draggedId: string, targetId: string): boolean => {
    const draggedFolder = folders.find(f => f.chromeId === draggedId);
    if (!draggedFolder) return false; // 不是文件夹，不会循环

    if (draggedId === targetId) return true; // 拖到自己

    const descendants = getDescendantIds(draggedId);
    return descendants.has(targetId);
  }, [folders, getDescendantIds]);

  // 计算拖拽位置
  const calculatePosition = useCallback((
    e: React.DragEvent,
    targetItem: MergedItem,
  ): DragPosition => {
    const rect = e.currentTarget.getBoundingClientRect();

    if (viewType === 'grid') {
      // 网格视图：文件夹整个区域是 center（移入），书签没有 center
      if (isMergedFolder(targetItem)) {
        return 'center';
      }
      // 书签：左半 = before (top), 右半 = after (bottom)
      const x = e.clientX - rect.left;
      return x < rect.width / 2 ? 'top' : 'bottom';
    }

    // List/Column 视图：使用 Y 坐标三区检测
    const y = e.clientY - rect.top;
    const height = rect.height;
    const edgeThreshold = height * 0.25;

    if (y < edgeThreshold) return 'top';
    if (y > height - edgeThreshold) return 'bottom';
    return 'center';
  }, [viewType]);

  // ============ 事件处理 ============

  const handleDragStart = useCallback((item: MergedItem, e: React.DragEvent) => {
    // 清除循环检测缓存
    descendantCacheRef.current.clear();

    // 确定拖拽的项目集合
    let ids: string[];
    if (selectedIds.has(item.chromeId) && selectedIds.size > 1) {
      // 多选拖拽
      ids = Array.from(selectedIds);
    } else {
      ids = [item.chromeId];
    }

    setDraggedIds(ids);
    e.dataTransfer.effectAllowed = 'move';

    // 设置拖拽预览数据
    if (ids.length > 1) {
      e.dataTransfer.setData('text/plain', `Moving ${ids.length} items`);
    } else {
      e.dataTransfer.setData('text/plain', item.title || 'Untitled');
    }
  }, [selectedIds]);

  const handleDragOver = useCallback((item: MergedItem, e: React.DragEvent) => {
    e.preventDefault();

    if (draggedIds.length === 0 || draggedIds.includes(item.chromeId)) {
      return;
    }

    // 循环检测
    const hasCycle = draggedIds.some(id => wouldCreateCycle(id, item.chromeId));
    if (hasCycle) {
      setDragOverId(item.chromeId);
      setDragPosition('forbidden');
      e.dataTransfer.dropEffect = 'none';
      clearAutoExpandTimer();
      return;
    }

    e.dataTransfer.dropEffect = 'move';

    const position = calculatePosition(e, item);
    setDragOverId(item.chromeId);
    setDragPosition(position);

    // 悬停自动展开：当拖拽在文件夹上 center 位置悬停 800ms
    if (isMergedFolder(item) && position === 'center') {
      if (lastDragOverIdRef.current !== item.chromeId) {
        clearAutoExpandTimer();
        lastDragOverIdRef.current = item.chromeId;
        autoExpandTimerRef.current = setTimeout(() => {
          setAutoExpandId(item.chromeId);
          onAutoExpand?.(item.chromeId);
        }, 800);
      }
    } else {
      if (lastDragOverIdRef.current !== item.chromeId || position !== 'center') {
        clearAutoExpandTimer();
        lastDragOverIdRef.current = item.chromeId;
      }
    }
  }, [draggedIds, wouldCreateCycle, calculatePosition, clearAutoExpandTimer, onAutoExpand]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // 只在真正离开元素时清除（忽略子元素触发的 leave）
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
      return;
    }
    setDragOverId(null);
    setDragPosition(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIds([]);
    setDragOverId(null);
    setDragPosition(null);
    setAutoExpandId(null);
    clearAutoExpandTimer();
    lastDragOverIdRef.current = null;
    descendantCacheRef.current.clear();
  }, [clearAutoExpandTimer]);

  const handleDrop = useCallback(async (targetItem: MergedItem, e: React.DragEvent) => {
    e.preventDefault();

    if (draggedIds.length === 0 || draggedIds.includes(targetItem.chromeId)) {
      handleDragEnd();
      return;
    }

    // 循环检测
    if (dragPosition === 'forbidden') {
      handleDragEnd();
      return;
    }

    try {
      const isTargetFolder = isMergedFolder(targetItem);

      if (isTargetFolder && dragPosition === 'center') {
        // 移入文件夹
        for (const id of draggedIds) {
          const isFolder = folders.some(f => f.chromeId === id);
          if (isFolder) {
            await moveFolder(id, targetItem.chromeId);
          } else {
            await moveBookmark(id, targetItem.chromeId);
          }
        }
        onDragSuccess?.(
          draggedIds.length > 1
            ? `Moved ${draggedIds.length} items to ${targetItem.title}`
            : `Moved to ${targetItem.title}`
        );
      } else if (dragPosition === 'top' || dragPosition === 'bottom') {
        // 同级排序
        const position = dragPosition === 'top' ? 'before' : 'after';
        for (const id of draggedIds) {
          await reorderItem(id, targetItem.chromeId, position);
        }
        onDragSuccess?.(
          draggedIds.length > 1
            ? `Reordered ${draggedIds.length} items`
            : 'Reordered'
        );
      }
    } catch (error) {
      console.error('[useDragAndDrop] Drop failed:', error);
      onDragError?.('Move failed');
    } finally {
      handleDragEnd();
    }
  }, [draggedIds, dragPosition, folders, moveBookmark, moveFolder, reorderItem, handleDragEnd, onDragSuccess, onDragError]);

  // ============ CSS 类名辅助 ============

  const getDragClass = useCallback((itemId: string): string => {
    const classes: string[] = [];

    if (draggedIds.includes(itemId)) {
      classes.push('dragging');
    }

    if (dragOverId === itemId) {
      classes.push('drag-over');

      if (dragPosition === 'top') classes.push('drag-position-top');
      else if (dragPosition === 'bottom') classes.push('drag-position-bottom');
      else if (dragPosition === 'center') classes.push('drag-position-center', 'drag-target-folder');
      else if (dragPosition === 'forbidden') classes.push('drag-forbidden');
    }

    return classes.join(' ');
  }, [draggedIds, dragOverId, dragPosition]);

  return {
    // State
    dragState: {
      draggedIds,
      dragOverId,
      dragPosition,
      isDragging,
      autoExpandId,
    } as DragState,

    // Event handlers
    handlers: {
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDragEnd: handleDragEnd,
      onDrop: handleDrop,
    },

    // Helpers
    getDragClass,
  };
}
