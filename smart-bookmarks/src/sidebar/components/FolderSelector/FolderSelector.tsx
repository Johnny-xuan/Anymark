/**
 * 智能文件夹选择器 - 支持搜索、自动完成和创建新文件夹
 */

import React, { useState, useEffect, useRef } from 'react';
import { Folder, Plus, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './FolderSelector.css';

interface FolderSelectorProps {
  value: string;
  onChange: (path: string) => void;
  existingFolders: string[];
  placeholder?: string;
}

const FolderSelector: React.FC<FolderSelectorProps> = ({
  value,
  onChange,
  existingFolders,
  placeholder = '/category/subfolder',
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredFolders, setFilteredFolders] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 同步外部值到输入框
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // 过滤文件夹列表
  useEffect(() => {
    if (!inputValue.trim()) {
      // 显示所有文件夹
      setFilteredFolders(existingFolders);
    } else {
      // 关键词匹配过滤
      const query = inputValue.toLowerCase();
      const filtered = existingFolders.filter((folder) => {
        const folderLower = folder.toLowerCase();
        // 支持模糊匹配：文件夹路径包含关键词
        return folderLower.includes(query);
      });

      // 按匹配度排序
      filtered.sort((a, b) => {
        const aIndex = a.toLowerCase().indexOf(query);
        const bIndex = b.toLowerCase().indexOf(query);
        if (aIndex === bIndex) return a.localeCompare(b);
        return aIndex - bIndex;
      });

      setFilteredFolders(filtered);
    }
    setSelectedIndex(0);
  }, [inputValue, existingFolders]);

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setShowDropdown(true);
  };

  // 选择文件夹
  const handleSelectFolder = (folder: string) => {
    setInputValue(folder);
    onChange(folder);
    setShowDropdown(false);
  };

  // 创建新文件夹
  const handleCreateFolder = () => {
    let path = inputValue.trim();

    // 确保路径以 / 开头
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // 规范化路径（移除多余的斜杠）
    path = path.replace(/\/+/g, '/');

    onChange(path);
    setShowDropdown(false);
  };

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown') {
        setShowDropdown(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredFolders.length)
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex < filteredFolders.length) {
          handleSelectFolder(filteredFolders[selectedIndex]);
        } else {
          // 最后一项是"创建新文件夹"
          handleCreateFolder();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
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
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 检查是否是新文件夹
  const isNewFolder = inputValue.trim() &&
    !existingFolders.includes(inputValue.trim());

  return (
    <div className="folder-selector">
      <div className="folder-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder}
          className="folder-input"
        />
        {isNewFolder && inputValue.trim() && (
          <span className="new-folder-badge">{t('folderSelector.newBadge')}</span>
        )}
      </div>

      {showDropdown && (
        <div ref={dropdownRef} className="folder-dropdown">
          {filteredFolders.length > 0 ? (
            <>
              <div className="folder-dropdown-header">{t('folderSelector.existingFolders')}</div>
              {filteredFolders.map((folder, index) => (
                <div
                  key={folder}
                  className={`folder-option ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => handleSelectFolder(folder)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Folder size={14} />
                  <span className="folder-path">{folder}</span>
                  {folder === value && (
                    <ChevronRight size={14} className="current-indicator" />
                  )}
                </div>
              ))}
            </>
          ) : (
            <div className="folder-dropdown-empty">
              {t('sidebar.search.noResults')}
            </div>
          )}

          {/* 创建新文件夹选项 */}
          {isNewFolder && (
            <>
              <div className="folder-dropdown-divider" />
              <div
                className={`folder-option create-new ${
                  selectedIndex === filteredFolders.length ? 'selected' : ''
                }`}
                onClick={handleCreateFolder}
                onMouseEnter={() => setSelectedIndex(filteredFolders.length)}
              >
                <Plus size={14} />
                <span>{t('folderSelector.createNew', { name: inputValue })}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FolderSelector;
