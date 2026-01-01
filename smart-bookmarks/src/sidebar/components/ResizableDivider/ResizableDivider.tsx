/**
 * 可拖拽的分隔线组件
 * 用于调整面板宽度
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './ResizableDivider.css';

interface ResizableDividerProps {
  /**
   * 当前面板宽度百分比（0-100）
   */
  width: number;
  
  /**
   * 宽度改变回调
   */
  onWidthChange: (width: number) => void;
  
  /**
   * 最小宽度百分比
   */
  minWidth?: number;
  
  /**
   * 最大宽度百分比
   */
  maxWidth?: number;
  
  /**
   * 面板方向（左侧还是右侧）
   */
  position?: 'left' | 'right';
  
  /**
   * 是否可折叠
   */
  collapsible?: boolean;
  
  /**
   * 折叠状态
   */
  collapsed?: boolean;
  
  /**
   * 折叠状态改变回调
   */
  onCollapsedChange?: (collapsed: boolean) => void;
}

const ResizableDivider: React.FC<ResizableDividerProps> = ({
  width,
  onWidthChange,
  minWidth = 20,
  maxWidth = 60,
  position = 'left',
  collapsible = true,
  collapsed = false,
  onCollapsedChange,
}) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  // 获取父容器
  useEffect(() => {
    if (dividerRef.current) {
      containerRef.current = dividerRef.current.closest('.sidebar-content') as HTMLElement;
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const containerWidth = rect.width;
      
      // 计算鼠标相对于容器的位置
      const mouseX = e.clientX - rect.left;
      
      // 计算新的宽度百分比
      let newWidthPercent: number;
      if (position === 'left') {
        newWidthPercent = (mouseX / containerWidth) * 100;
      } else {
        newWidthPercent = ((containerWidth - mouseX) / containerWidth) * 100;
      }
      
      // 限制在最小和最大宽度之间
      newWidthPercent = Math.max(minWidth, Math.min(maxWidth, newWidthPercent));
      
      onWidthChange(newWidthPercent);
    },
    [isDragging, minWidth, maxWidth, position, onWidthChange]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleToggleCollapse = () => {
    if (collapsible && onCollapsedChange) {
      onCollapsedChange(!collapsed);
    }
  };

  // 双击快速折叠/展开
  const handleDoubleClick = () => {
    if (collapsible && onCollapsedChange) {
      onCollapsedChange(!collapsed);
    }
  };

  return (
    <div
      ref={dividerRef}
      className={`resizable-divider ${position} ${isDragging ? 'dragging' : ''} ${isHovering ? 'hovering' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onDoubleClick={handleDoubleClick}
      title={collapsible ? (collapsed ? t('resizableDivider.doubleClickExpand') : t('resizableDivider.dragResizeCollapse')) : t('resizableDivider.dragResize')}
    >
      {/* 拖拽手柄 */}
      <div className="divider-handle">
        <GripVertical size={16} className="grip-icon" />
      </div>
      
      {/* 折叠/展开按钮 */}
      {collapsible && (
        <button
          className="divider-collapse-button"
          onClick={handleToggleCollapse}
          title={collapsed ? t('resizableDivider.expandPanel') : t('resizableDivider.collapsePanel')}
        >
          {position === 'left' ? (
            collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />
          ) : (
            collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />
          )}
        </button>
      )}
      
      {/* 拖拽时的指示器 */}
      {isDragging && (
        <div className="divider-indicator">
          {Math.round(width)}%
        </div>
      )}
    </div>
  );
};

export default ResizableDivider;
