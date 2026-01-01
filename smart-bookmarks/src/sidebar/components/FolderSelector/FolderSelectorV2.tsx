/**
 * FolderSelectorV2 - 使用新架构的文件夹选择器
 * 
 * 基于 Chrome Native 文件夹结构
 * 使用 chromeId 作为主键
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Folder, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MergedFolder } from '../../../types/chromeBookmark';
import './FolderSelector.css';

interface FolderSelectorV2Props {
  value: string; // chromeId of selected folder
  onChange: (chromeId: string) => void;
  folders: MergedFolder[];
  rootId: string | null;
  placeholder?: string;
}

interface FolderTreeNode {
  folder: MergedFolder;
  children: FolderTreeNode[];
  depth: number;
}

const FolderSelectorV2: React.FC<FolderSelectorV2Props> = ({
  value,
  onChange,
  folders,
  rootId,
  placeholder = 'Select folder...',
}) => {
  const { t } = useTranslation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 构建文件夹树结构
  const folderTree = useMemo(() => {
    const buildTree = (parentId: string, depth: number): FolderTreeNode[] => {
      return folders
        .filter(f => f.parentId === parentId)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(folder => ({
          folder,
          children: buildTree(folder.chromeId, depth + 1),
          depth,
        }));
    };

    if (!rootId) return [];
    return buildTree(rootId, 0);
  }, [folders, rootId]);

  // 扁平化树结构用于显示
  const flattenTree = (nodes: FolderTreeNode[], expanded: Set<string>): FolderTreeNode[] => {
    const result: FolderTreeNode[] = [];
    
    const traverse = (nodes: FolderTreeNode[]) => {
      for (const node of nodes) {
        result.push(node);
        if (expanded.has(node.folder.chromeId) && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };
    
    traverse(nodes);
    return result;
  };

  // 过滤文件夹
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) {
      return flattenTree(folderTree, expandedIds);
    }

    const query = searchQuery.toLowerCase();
    const matchingFolders = folders.filter(f => 
      f.title.toLowerCase().includes(query) ||
      f.path.toLowerCase().includes(query)
    );

    return matchingFolders.map(folder => ({
      folder,
      children: [],
      depth: 0,
    }));
  }, [folderTree, folders, searchQuery, expandedIds]);

  // 获取当前选中文件夹的显示名称
  const selectedFolder = folders.find(f => f.chromeId === value);
  const displayValue = selectedFolder?.title || (rootId === value ? 'AnyMark Root' : '');

  // 切换文件夹展开状态
  const toggleExpand = (chromeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(chromeId)) {
        next.delete(chromeId);
      } else {
        next.add(chromeId);
      }
      return next;
    });
  };

  // 选择文件夹
  const handleSelectFolder = (chromeId: string) => {
    onChange(chromeId);
    setShowDropdown(false);
    setSearchQuery('');
  };

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setShowDropdown(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredFolders.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (filteredFolders[selectedIndex]) {
          const folder = filteredFolders[selectedIndex].folder;
          if (!expandedIds.has(folder.chromeId)) {
            setExpandedIds(prev => new Set([...prev, folder.chromeId]));
          }
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (filteredFolders[selectedIndex]) {
          const folder = filteredFolders[selectedIndex].folder;
          if (expandedIds.has(folder.chromeId)) {
            setExpandedIds(prev => {
              const next = new Set(prev);
              next.delete(folder.chromeId);
              return next;
            });
          }
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredFolders[selectedIndex]) {
          handleSelectFolder(filteredFolders[selectedIndex].folder.chromeId);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        setSearchQuery('');
        break;
    }
  };

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 重置选中索引
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  return (
    <div className="folder-selector">
      <div className="folder-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={showDropdown ? searchQuery : displayValue}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!showDropdown) setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder}
          className="folder-input"
        />
      </div>

      {showDropdown && (
        <div ref={dropdownRef} className="folder-dropdown">
          {/* 根文件夹选项 */}
          {rootId && !searchQuery && (
            <div
              className={`folder-option ${value === rootId ? 'current' : ''} ${selectedIndex === -1 ? 'selected' : ''}`}
              onClick={() => handleSelectFolder(rootId)}
              onMouseEnter={() => setSelectedIndex(-1)}
            >
              <Folder size={14} />
              <span className="folder-path">AnyMark Root</span>
              {value === rootId && <ChevronRight size={14} className="current-indicator" />}
            </div>
          )}

          {filteredFolders.length > 0 ? (
            <>
              {!searchQuery && <div className="folder-dropdown-header">{t('folderSelector.existingFolders')}</div>}
              {filteredFolders.map((node, index) => {
                const hasChildren = node.children.length > 0 || 
                  folders.some(f => f.parentId === node.folder.chromeId);
                const isExpanded = expandedIds.has(node.folder.chromeId);
                
                return (
                  <div
                    key={node.folder.chromeId}
                    className={`folder-option ${index === selectedIndex ? 'selected' : ''} ${node.folder.chromeId === value ? 'current' : ''}`}
                    onClick={() => handleSelectFolder(node.folder.chromeId)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    style={{ paddingLeft: `${12 + node.depth * 16}px` }}
                  >
                    {hasChildren && (
                      <button
                        className="expand-btn"
                        onClick={(e) => toggleExpand(node.folder.chromeId, e)}
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                    )}
                    {!hasChildren && <span className="expand-placeholder" />}
                    <Folder size={14} />
                    <span className="folder-title">{node.folder.title}</span>
                    {searchQuery && (
                      <span className="folder-path-hint">{node.folder.path}</span>
                    )}
                    {node.folder.chromeId === value && (
                      <ChevronRight size={14} className="current-indicator" />
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <div className="folder-dropdown-empty">
              {t('sidebar.search.noResults')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FolderSelectorV2;
