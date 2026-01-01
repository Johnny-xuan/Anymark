/**
 * 键盘导航 Hook
 */

import { useEffect, useCallback } from 'react';
import { useBookmarkStore } from '../store/bookmarkStore';

export type KeyboardMode = 'normal' | 'search' | 'command';

interface UseKeyboardOptions {
  mode?: KeyboardMode;
  onEnter?: () => void;
  onEscape?: () => void;
}

export function useKeyboard(options: UseKeyboardOptions = {}) {
  const {
    mode = 'normal',
    onEnter,
    onEscape,
  } = options;

  const {
    navigateUp,
    navigateDown,
    togglePreviewPanel,
  } = useBookmarkStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 如果焦点在输入框，跳过某些快捷键
      const isInputFocused =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      // 全局快捷键（即使在输入框中也生效）
      if (e.key === 'Escape') {
        e.preventDefault();
        if (onEscape) {
          onEscape();
        } else if (isInputFocused) {
          (e.target as HTMLInputElement).blur();
        }
        return;
      }

      // 如果在输入框中，其他快捷键不生效
      if (isInputFocused && mode !== 'search') {
        return;
      }

      // 根据模式处理不同的快捷键
      switch (mode) {
        case 'normal':
          handleNormalMode(e);
          break;
        case 'search':
          handleSearchMode(e);
          break;
        case 'command':
          handleCommandMode(e);
          break;
      }
    },
    [mode, onEnter, onEscape, navigateUp, navigateDown, togglePreviewPanel]
  );

  const handleNormalMode = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        navigateUp();
        break;

      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        navigateDown();
        break;

      case 'Enter':
        e.preventDefault();
        if (onEnter) {
          onEnter();
        }
        break;

      case ' ':
        if (e.target === document.body) {
          e.preventDefault();
          togglePreviewPanel();
        }
        break;

      case '/':
        e.preventDefault();
        // 聚焦搜索框
        const searchInput = document.querySelector<HTMLInputElement>(
          '.search-input'
        );
        searchInput?.focus();
        break;

      case 'g':
        // 支持 gg 跳到顶部
        // TODO: 实现组合键逻辑
        break;

      case 'G':
        // 跳到底部
        // TODO: 实现
        break;
    }
  };

  const handleSearchMode = (e: KeyboardEvent) => {
    // 搜索模式下的特殊处理
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onEnter) {
        onEnter();
      }
    }
  };

  const handleCommandMode = (_e: KeyboardEvent) => {
    // 命令模式下的特殊处理
    // TODO: 实现命令面板逻辑
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return {
    mode,
  };
}
