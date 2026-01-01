/**
 * 搜索栏组件
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Command } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBookmarkStore } from '../../store/bookmarkStore';
import '../../../i18n/config';
import './SearchBar.css';

// 使用Ref来存储书签列表的引用，避免全局变量问题
const bookmarkListElementRef = React.createRef<HTMLElement>();

export function setBookmarkListElement(el: HTMLElement | null) {
  // 直接设置DOM元素的focus方法到ref上
  if (el && bookmarkListElementRef.current !== el) {
    // 确保元素可以接收焦点
    if (el.getAttribute('tabIndex') === null) {
      el.setAttribute('tabIndex', '0');
    }
  }
}

const SearchBar: React.FC = () => {
  const { t } = useTranslation();
  const { searchQuery, setSearchQuery, setSelectedIndex } = useBookmarkStore();
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // 使用ref存储焦点转移函数
  const focusTransferRef = useRef<(() => void) | null>(null);
  // 跟踪 IME 组合状态（中文/日文输入法）
  const isComposingRef = useRef(false);

  // 注册焦点转移函数
  useEffect(() => {
    const registerFocus = () => {
      focusTransferRef.current = () => {
        // 尝试多个选择器，因为空状态时 class 不同
        const listEl = document.querySelector<HTMLElement>('.bookmark-list') 
          || document.querySelector<HTMLElement>('.bookmark-list-empty');
        if (listEl) {
          // 确保tabIndex存在
          if (listEl.getAttribute('tabIndex') === null) {
            listEl.setAttribute('tabIndex', '0');
          }
          listEl.focus();
        }
        // 移除警告日志，因为这是正常情况（组件可能还在加载）
      };
    };
    registerFocus();
  }, []);

  useEffect(() => {
    // 监听 / 和 Cmd+K 键聚焦搜索框
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 检查是否在输入元素中
      const isInputElement = (target: EventTarget | null): boolean => {
        if (!target) return false;
        const element = target as HTMLElement;
        const tagName = element.tagName.toLowerCase();
        return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
      };

      // 按 / 键聚焦搜索（不在输入框中时）
      if (e.key === '/' && !isInputElement(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // 按 Cmd+K (Mac) 或 Ctrl+K (Windows/Linux) 聚焦搜索
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);
  };

  const handleClear = () => {
    setSearchQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // 如果正在进行 IME 组合（中文/日文输入），忽略 Enter 键
    // 这样可以让输入法正常确认文字，而不是触发搜索
    if (isComposingRef.current) {
      return;
    }
    
    // 只处理特定键，让普通字符正常输入
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleClear();
      // 使用注册的方法转移焦点
      focusTransferRef.current?.();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      // 只有在有搜索内容且有结果时，才处理选中逻辑
      const { getFilteredBookmarks, setSelectedIndex } = useBookmarkStore.getState();
      const results = getFilteredBookmarks();

      if (searchQuery.trim() && results.length > 0) {
        setSelectedIndex(0);
      }

      // 失焦搜索框
      inputRef.current?.blur();

      // 转移焦点到书签列表
      focusTransferRef.current?.();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      
      const { getFilteredBookmarks, setSelectedIndex } = useBookmarkStore.getState();
      const results = getFilteredBookmarks();
      
      if (results.length > 0) {
        setSelectedIndex(0);
        inputRef.current?.blur();
        focusTransferRef.current?.();
      }
    }
  }, [searchQuery]);

  // IME 组合事件处理
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  return (
    <div className={`search-bar ${isFocused ? 'focused' : ''}`}>
      <div className="search-icon">
        <Search size={18} />
      </div>

      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder={t('sidebar.search.placeholder')}
        value={searchQuery}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />

      {searchQuery && (
        <button
          className="search-clear"
          onClick={handleClear}
          title={t('common.buttons.close')}
        >
          <X size={16} />
        </button>
      )}

      <div className="search-shortcut">
        <kbd>
          <Command size={12} />K
        </kbd>
      </div>
    </div>
  );
};

export default SearchBar;
