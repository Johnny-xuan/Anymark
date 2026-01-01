import React, { useState } from 'react';
import { Chrome, Star, Calendar, TrendingUp, TrendingDown, Trash, Tags, ChevronDown, ChevronUp, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBookmarkStoreV2 } from '../../store/bookmarkStoreV2';
import TagCloud from '../TagCloud/TagCloud';
import type { FilterType } from '../../../types/bookmark';
import '../../../i18n/config';
import './FilterTabs.css';

interface FilterTab {
  id: FilterType;
  label: string;
  icon: React.ReactNode;
}

const FilterTabs: React.FC = () => {
  const { t } = useTranslation();
  // 使用新版 Store V2
  const { currentFilter, setCurrentFilter, getFilteredItems } =
    useBookmarkStoreV2();
  const [showTagCloud, setShowTagCloud] = useState(false);

  const filteredBookmarks = getFilteredItems();

  // 动态生成过滤器标签（支持国际化）
  const filterTabs: FilterTab[] = [
    {
      id: 'chrome',
      label: 'Chrome',
      icon: <Chrome size={16} />,
    },
    {
      id: 'starred',
      label: t('sidebar.filters.favorites'),
      icon: <Star size={16} />,
    },
    {
      id: 'recent',
      label: t('sidebar.filters.recent'),
      icon: <Calendar size={16} />,
    },
    {
      id: 'popular',
      label: t('sidebar.filters.popular'),
      icon: <TrendingUp size={16} />,
    },
    {
      id: 'longtail',
      label: t('sidebar.filters.longTail'),
      icon: <TrendingDown size={16} />,
    },
    {
      id: 'trash',
      label: t('sidebar.filters.trash'),
      icon: <Trash size={16} />,
    },
  ];

  // 过滤器描述（用于 tooltip）
  const filterDescriptions: Record<FilterType, string> = {
    chrome: t('sidebar.filters.descriptions.chrome'),
    starred: t('sidebar.filters.descriptions.favorites'),
    recent: t('sidebar.filters.descriptions.recent'),
    popular: t('sidebar.filters.descriptions.popular'),
    longtail: t('sidebar.filters.descriptions.longTail'),
    trash: t('sidebar.filters.descriptions.trash'),
    // 保留旧的以防类型错误
    frequent: 'Visited bookmarks',
    unvisited: 'Unvisited bookmarks',
    important: 'Important bookmarks',
  };

  // 监听全局数字键1-7快速切换
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在输入框，跳过
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // 数字键1-7切换过滤器
      if (e.key >= '1' && e.key <= '7') {
        const tabIndex = parseInt(e.key) - 1;
        if (tabIndex < filterTabs.length) {
          e.preventDefault();
          // 使用函数式更新避免依赖 setCurrentFilter
          useBookmarkStoreV2.getState().setCurrentFilter(filterTabs[tabIndex].id);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []); // 空依赖，事件处理器是自包含的

  const handleTabClick = (filterId: FilterType) => {
    setCurrentFilter(filterId);
  };

  return (
    <div className="filter-tabs-wrapper">
      <div className="filter-tabs">
        <div className="tabs-list" role="tablist">
          {filterTabs.map((tab, index) => (
            <button
              key={tab.id}
              className={`tab-button ${
                currentFilter === tab.id ? 'active' : ''
              }`}
              onClick={() => handleTabClick(tab.id)}
              role="tab"
              aria-selected={currentFilter === tab.id}
              title={`${tab.label} - ${filterDescriptions[tab.id]}\n${t('sidebar.keyboard.shortcuts.chrome')}: ${index + 1}`}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
          
          {/* 标签云按钮 */}
          <button
            className={`tab-button tag-cloud-btn ${showTagCloud ? 'active' : ''}`}
            onClick={() => setShowTagCloud(!showTagCloud)}
            title={t('sidebar.tagCloud.title')}
          >
            <span className="tab-icon"><Tags size={16} /></span>
            <span className="tab-icon toggle-icon">
              {showTagCloud ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </button>
        </div>

        {/* 书签计数 */}
        <div className="tabs-count">
          {filteredBookmarks.length} {t('sidebar.bookmarks.count', { count: filteredBookmarks.length })}
        </div>
      </div>
      
      {/* 标签云面板 - 内联显示，不使用绝对定位 */}
      {showTagCloud && (
        <div className="tag-cloud-panel-inline">
          <TagCloud onClose={() => setShowTagCloud(false)} />
        </div>
      )}
    </div>
  );
};

export default FilterTabs;
