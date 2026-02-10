/**
 * Slash Tools Menu - 输入 / 时弹出的命令菜单
 *
 * V4 架构：映射到 BashExecutor 实际支持的命令
 */

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './SlashToolsMenu.css';

export interface SlashTool {
  command: string;
  icon: string;
  label: string;
  description: string;
  /** 选中后填入输入框的文本。无此字段则直接执行 command */
  fillText?: string;
}

export const SLASH_TOOLS: SlashTool[] = [
  // 导航
  { command: '/ls', icon: '📁', label: 'List', description: '查看当前目录内容' },
  { command: '/tree', icon: '🌳', label: 'Tree', description: '显示目录树结构' },
  { command: '/cd', icon: '📂', label: 'Navigate', description: '进入文件夹', fillText: 'cd ' },
  // 搜索
  { command: '/find', icon: '🔍', label: 'Find', description: '搜索书签和文件夹', fillText: 'find ' },
  { command: '/starred', icon: '⭐', label: 'Starred', description: '查看所有星标书签' },
  // 统计
  { command: '/stats', icon: '📊', label: 'Stats', description: '统计书签数量' },
  // 帮助
  { command: '/help', icon: '❓', label: 'Help', description: '查看所有可用命令' },
];

interface SlashToolsMenuProps {
  isOpen: boolean;
  filter: string;  // 用户输入的过滤文本，如 "/org" 
  onSelect: (tool: SlashTool) => void;
  onClose: () => void;
  selectedIndex: number;
}

const SlashToolsMenu: React.FC<SlashToolsMenuProps> = ({
  isOpen,
  filter,
  onSelect,
  onClose,
  selectedIndex,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 过滤工具
  const filteredTools = SLASH_TOOLS.filter(tool => {
    if (!filter || filter === '/') return true;
    const searchTerm = filter.toLowerCase().replace('/', '');
    return (
      tool.command.toLowerCase().includes(searchTerm) ||
      tool.label.toLowerCase().includes(searchTerm)
    );
  });

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // 自动滚动选中的项目到可见区域
  useEffect(() => {
    if (isOpen && selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [isOpen, selectedIndex]);

  if (!isOpen || filteredTools.length === 0) return null;

  return (
    <div
      className="slash-tools-menu"
      ref={menuRef}
      role="listbox"
      aria-label={t('slashTools.menuLabel', '命令菜单')}
      tabIndex={-1}
    >
      <div className="slash-tools-header" role="presentation">
        {t('slashTools.title', '命令')}
        <span className="slash-tools-count">{filteredTools.length}</span>
      </div>
      <div className="slash-tools-list" role="listbox">
        {filteredTools.map((tool, index) => (
          <div
            key={tool.command}
            ref={el => itemRefs.current[index] = el}
            className={`slash-tool-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(tool)}
            role="option"
            aria-selected={index === selectedIndex}
            tabIndex={index === selectedIndex ? 0 : -1}
            data-command={tool.command}
          >
            <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
            <div className="tool-info">
              <span className="tool-command">{tool.command}</span>
              <span className="tool-description">{tool.description}</span>
            </div>
            {index === selectedIndex && (
              <span className="selection-indicator" aria-hidden="true">→</span>
            )}
          </div>
        ))}
      </div>
      <div className="slash-tools-footer" role="presentation">
        <span className="keyboard-hint">
          <kbd>↑</kbd><kbd>↓</kbd> {t('slashTools.navigate', '导航')}
          <kbd>Enter</kbd> {t('slashTools.select', '选择')}
          <kbd>Esc</kbd> {t('slashTools.close', '关闭')}
        </span>
      </div>
    </div>
  );
};

export default SlashToolsMenu;
