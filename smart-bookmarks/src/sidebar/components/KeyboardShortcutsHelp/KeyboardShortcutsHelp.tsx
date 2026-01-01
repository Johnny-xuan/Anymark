/**
 * 快捷键帮助弹窗
 */

import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../../i18n/config';
import './KeyboardShortcutsHelp.css';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  
  if (!isOpen) return null;

  const shortcuts = [
    {
      category: t('sidebar.keyboard.navigation'),
      items: [
        { keys: ['↑'], desc: t('sidebar.keyboard.shortcuts.up') },
        { keys: ['↓'], desc: t('sidebar.keyboard.shortcuts.down') },
        { keys: ['j'], desc: t('sidebar.keyboard.shortcuts.jk') + ' (j)' },
        { keys: ['k'], desc: t('sidebar.keyboard.shortcuts.jk') + ' (k)' },
        { keys: ['g'], desc: t('sidebar.keyboard.shortcuts.jumpFirst') },
        { keys: ['G'], desc: t('sidebar.keyboard.shortcuts.jumpLast') },
        { keys: ['PgUp'], desc: t('sidebar.keyboard.shortcuts.pageUp') },
        { keys: ['PgDn'], desc: t('sidebar.keyboard.shortcuts.pageDown') },
      ],
    },
    {
      category: t('sidebar.keyboard.actions'),
      items: [
        { keys: ['Enter'], desc: t('sidebar.keyboard.shortcuts.enter') },
        { keys: ['O'], desc: t('sidebar.keyboard.shortcuts.openNewTab') },
        { keys: ['E'], desc: t('sidebar.bookmarks.edit') },
        { keys: ['Y'], desc: t('sidebar.bookmarks.copyUrl') },
        { keys: ['S'], desc: t('sidebar.keyboard.shortcuts.star') },
        { keys: ['D'], desc: t('sidebar.bookmarks.delete') },
      ],
    },
    {
      category: t('sidebar.search.placeholder'),
      items: [
        { keys: ['⌘', 'K'], desc: t('sidebar.keyboard.shortcuts.focusSearch') },
        { keys: ['/'], desc: t('sidebar.keyboard.shortcuts.slash') },
        { keys: ['Enter'], desc: t('sidebar.keyboard.shortcuts.openFirst') },
        { keys: ['Esc'], desc: t('sidebar.keyboard.shortcuts.escape') },
      ],
    },
    {
      category: t('sidebar.keyboard.filterTabs'),
      items: [
        { keys: ['1'], desc: t('sidebar.keyboard.shortcuts.chrome') },
        { keys: ['2'], desc: t('sidebar.filters.uncategorized') },
        { keys: ['3'], desc: t('sidebar.filters.favorites') },
        { keys: ['4'], desc: t('sidebar.keyboard.shortcuts.recent') },
        { keys: ['5'], desc: t('sidebar.keyboard.shortcuts.popular') },
        { keys: ['6'], desc: t('sidebar.keyboard.shortcuts.longTail') },
        { keys: ['7'], desc: t('sidebar.filters.trash') },
      ],
    },
    {
      category: t('sidebar.filters.trash'),
      items: [
        { keys: ['R'], desc: t('sidebar.keyboard.shortcuts.r') },
        { keys: ['D'], desc: t('sidebar.keyboard.shortcuts.d') },
      ],
    },
    {
      category: t('sidebar.filters.uncategorized') + ' ' + t('sidebar.keyboard.shortcuts.view', '视图'),
      items: [
        { keys: ['C'], desc: t('sidebar.keyboard.shortcuts.toggleCategory', '展开/折叠当前分类') },
        { keys: ['A'], desc: t('sidebar.keyboard.shortcuts.expandAll', '展开所有分类') },
        { keys: ['Z'], desc: t('sidebar.keyboard.shortcuts.collapseAll', '折叠所有分类') },
      ],
    },
    {
      category: t('sidebar.keyboard.panels'),
      items: [
        { keys: ['Space'], desc: t('sidebar.keyboard.shortcuts.space') },
        { keys: ['Alt', 'A'], desc: t('sidebar.keyboard.shortcuts.altA') },
        { keys: ['H'], desc: t('sidebar.keyboard.shortcuts.h') },
      ],
    },
  ];

  return (
    <>
      <div className="shortcuts-overlay" onClick={onClose} />
      <div className="shortcuts-dialog">
        <div className="shortcuts-header">
          <h2>⌨️ {t('sidebar.keyboard.title')}</h2>
          <button className="shortcuts-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="shortcuts-content">
          {shortcuts.map((section) => (
            <div key={section.category} className="shortcuts-section">
              <h3 className="shortcuts-category">{section.category}</h3>
              <div className="shortcuts-list">
                {section.items.map((item, index) => (
                  <div key={index} className="shortcut-item">
                    <div className="shortcut-keys">
                      {item.keys.map((key, i) => (
                        <React.Fragment key={i}>
                          <kbd className="shortcut-key">{key}</kbd>
                          {i < item.keys.length - 1 && <span className="key-plus">+</span>}
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="shortcut-desc">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcuts-footer">
          <p className="shortcuts-tip">
            💡 {t('onboarding.shortcuts.note')}
          </p>
        </div>
      </div>
    </>
  );
};

export default KeyboardShortcutsHelp;
