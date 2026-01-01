/**
 * 键盘快捷键帮助面板
 */

import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './KeyboardHelp.css';

interface KeyboardHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const KeyboardHelp: React.FC<KeyboardHelpProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const shortcuts = [
    {
      category: t('sidebar.keyboardHelp.categories.navigation'),
      items: [
        { keys: ['↑', 'k'], description: t('sidebar.keyboardHelp.items.prevItem') },
        { keys: ['↓', 'j'], description: t('sidebar.keyboardHelp.items.nextItem') },
        { keys: ['Enter'], description: t('sidebar.keyboardHelp.items.openBookmark') },
        { keys: ['Home', 'g'], description: t('sidebar.keyboardHelp.items.jumpTop') },
        { keys: ['End', 'G'], description: t('sidebar.keyboardHelp.items.jumpBottom') },
        { keys: ['PageUp'], description: t('sidebar.keyboardHelp.items.pageUp') },
        { keys: ['PageDown'], description: t('sidebar.keyboardHelp.items.pageDown') },
      ],
    },
    {
      category: t('sidebar.keyboardHelp.categories.bookmarkActions'),
      items: [
        { keys: ['O'], description: t('sidebar.keyboardHelp.items.openNewTab') },
        { keys: ['Y'], description: t('sidebar.keyboardHelp.items.copyUrl') },
        { keys: ['S'], description: t('sidebar.keyboardHelp.items.toggleStar') },
        { keys: ['E'], description: t('sidebar.keyboardHelp.items.editBookmark') },
        { keys: ['D'], description: t('sidebar.keyboardHelp.items.deleteToTrash') },
      ],
    },
    {
      category: t('sidebar.keyboardHelp.categories.filters'),
      items: [
        { keys: ['1'], description: t('sidebar.keyboardHelp.items.filterAll') },
        { keys: ['2'], description: t('sidebar.keyboardHelp.items.filterCategories') },
        { keys: ['3'], description: t('sidebar.keyboardHelp.items.filterStarred') },
        { keys: ['4'], description: t('sidebar.keyboardHelp.items.filterRecent') },
        { keys: ['5'], description: t('sidebar.keyboardHelp.items.filterPopular') },
        { keys: ['6'], description: t('sidebar.keyboardHelp.items.filterTrash') },
      ],
    },
    {
      category: t('sidebar.keyboardHelp.categories.search'),
      items: [
        { keys: ['/', '⌘K'], description: t('sidebar.keyboardHelp.items.focusSearch') },
        { keys: ['Enter'], description: t('sidebar.keyboardHelp.items.openFirstMatch') },
        { keys: ['Esc'], description: t('sidebar.keyboardHelp.items.clearSearch') },
      ],
    },
    {
      category: t('sidebar.keyboardHelp.categories.trash'),
      items: [
        { keys: ['R'], description: t('sidebar.keyboardHelp.items.restoreBookmark') },
        { keys: ['⇧D'], description: t('sidebar.keyboardHelp.items.permanentDelete') },
      ],
    },
    {
      category: t('sidebar.keyboardHelp.categories.other'),
      items: [
        { keys: ['Space'], description: t('sidebar.keyboardHelp.items.togglePreview') },
        { keys: ['H'], description: t('sidebar.keyboardHelp.items.showHideHelp') },
      ],
    },
  ];

  return (
    <div className="keyboard-help-overlay" onClick={onClose}>
      <div className="keyboard-help-panel" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="help-header">
          <h2>{t('sidebar.keyboardHelp.title')}</h2>
          <button className="help-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="help-content">
          {shortcuts.map((section) => (
            <div key={section.category} className="help-section">
              <h3 className="help-category">{section.category}</h3>
              <div className="help-items">
                {section.items.map((item, index) => (
                  <div key={index} className="help-item">
                    <div className="help-keys">
                      {item.keys.map((key, i) => (
                        <React.Fragment key={i}>
                          <kbd className="help-key">{key}</kbd>
                          {i < item.keys.length - 1 && (
                            <span className="help-or">{t('sidebar.keyboardHelp.or')}</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="help-description">{item.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 底部提示 */}
        <div className="help-footer">
          <p>{t('sidebar.keyboardHelp.closeHint')}</p>
        </div>
      </div>
    </div>
  );
};

export default KeyboardHelp;
