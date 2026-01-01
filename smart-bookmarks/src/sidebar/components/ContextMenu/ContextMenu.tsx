/**
 * 右键菜单组件
 * 提供编辑、删除、移动、复制链接等操作
 */

import React, { useEffect, useRef } from 'react';
import {
  Edit3,
  Trash2,
  FolderInput,
  Copy,
  Star,
  StarOff,
  ExternalLink,
  Archive,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../../i18n/config';
import type { IBookmark, IFolder } from '../../../types/bookmark';
import './ContextMenu.css';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuProps {
  position: ContextMenuPosition;
  item: IBookmark | IFolder;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
  onCopyUrl: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onOpenInNewTab: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  position,
  item,
  onClose,
  onEdit,
  onDelete,
  onMove,
  onCopyUrl,
  onToggleStar,
  onArchive,
  onOpenInNewTab,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const isFolder = 'bookmarkCount' in item;
  const isStarred = !isFolder && (item as IBookmark).starred;

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // 确保菜单不超出屏幕
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      // 如果右侧超出，向左调整
      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 10;
      }

      // 如果底部超出，向上调整
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 10;
      }

      menuRef.current.style.left = `${x}px`;
      menuRef.current.style.top = `${y}px`;
    }
  }, [position]);

  const menuItems = [
    !isFolder && {
      icon: ExternalLink,
      label: t('sidebar.contextMenu.openNewTab'),
      shortcut: 'O',
      onClick: onOpenInNewTab,
    },
    !isFolder && {
      icon: Copy,
      label: t('sidebar.contextMenu.copyLink'),
      shortcut: 'Y',
      onClick: onCopyUrl,
    },
    { icon: Edit3, label: isFolder ? t('sidebar.contextMenu.rename') : t('sidebar.contextMenu.edit'), shortcut: 'E', onClick: onEdit },
    !isFolder && {
      icon: isStarred ? StarOff : Star,
      label: isStarred ? t('sidebar.contextMenu.unstar') : t('sidebar.contextMenu.star'),
      shortcut: 'S',
      onClick: onToggleStar,
    },
    !isFolder && { icon: FolderInput, label: t('sidebar.contextMenu.moveTo'), shortcut: 'M', onClick: onMove },
    { divider: true },
    !isFolder && {
      icon: Archive,
      label: t('sidebar.contextMenu.archive'),
      shortcut: 'A',
      onClick: onArchive,
    },
    {
      icon: Trash2,
      label: isFolder ? t('sidebar.contextMenu.deleteFolder') : t('sidebar.contextMenu.delete'),
      shortcut: 'D',
      onClick: onDelete,
      danger: true,
    },
  ].filter(Boolean);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {menuItems.map((item: any, index) => {
        if (item.divider) {
          return <div key={`divider-${index}`} className="context-menu-divider" />;
        }

        const Icon = item.icon;

        return (
          <button
            key={item.label}
            className={`context-menu-item ${item.danger ? 'danger' : ''}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            <Icon size={16} strokeWidth={1.5} />
            <span className="context-menu-label">{item.label}</span>
            <kbd className="context-menu-shortcut">{item.shortcut}</kbd>
          </button>
        );
      })}
    </div>
  );
};

export default ContextMenu;
