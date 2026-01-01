/**
 * QuickActionBar - 快捷功能选择器
 * 帮助用户明确表达意图，消除歧义
 * 
 * 设计理念：
 * - 用户说"搜索 X"时，LLM 不知道是搜书签还是找资源
 * - 快捷组件让用户主动表明意图，而不是让 LLM 猜测
 */

import React from 'react';
import { Search, Sparkles, Globe, Flame, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './QuickActionBar.css';

export interface QuickAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  tag: string;
  description: string;
  color: string;
  tool?: string;  // 对应的工具名
  action?: string; // 工具的 action
}

interface QuickActionBarProps {
  onSelect: (action: QuickAction) => void;
  selectedAction: QuickAction | null;
  disabled?: boolean;
}

const QuickActionBar: React.FC<QuickActionBarProps> = ({
  onSelect,
  selectedAction,
  disabled = false
}) => {
  const { t } = useTranslation();

  // 快捷操作列表 - 消除歧义设计
  const getQuickActions = (): QuickAction[] => [
    {
      id: 'search',
      icon: <Search size={14} />,
      label: t('quickAction.searchBookmarks', '搜书签'),
      tag: `[${t('quickAction.searchBookmarks', '搜书签')}]`,
      description: t('quickAction.searchBookmarksDesc', '在已保存的书签中搜索'),
      color: '#3b82f6', // blue
      tool: 'search',
    },
    {
      id: 'discover',
      icon: <Globe size={14} />,
      label: t('quickAction.discover', '找资源'),
      tag: `[${t('quickAction.discover', '找资源')}]`,
      description: t('quickAction.discoverDesc', '在网上找新资源'),
      color: '#10b981', // green
      tool: 'discover',
      action: 'web',
    },
    {
      id: 'trending',
      icon: <Flame size={14} />,
      label: t('quickAction.trending', '看热门'),
      tag: `[${t('quickAction.trending', '看热门')}]`,
      description: t('quickAction.trendingDesc', '查看 GitHub 热门项目'),
      color: '#f59e0b', // amber
      tool: 'discover',
      action: 'trending',
    },
    {
      id: 'organize',
      icon: <Sparkles size={14} />,
      label: t('quickAction.organize', '整理'),
      tag: `[${t('quickAction.organize', '整理')}]`,
      description: t('quickAction.organizeDesc', '用 AI 整理书签'),
      color: '#8b5cf6', // purple
      tool: 'organize',
      action: 'suggest',
    },
    {
      id: 'chat',
      icon: <MessageCircle size={14} />,
      label: t('quickAction.chat', '聊天'),
      tag: `[${t('quickAction.chat', '聊天')}]`,
      description: t('quickAction.chatDesc', '闲聊模式'),
      color: '#6b7280', // gray
    },
  ];

  return (
    <div className="quick-action-bar">
      {getQuickActions().map((action) => {
        const isActive = selectedAction?.id === action.id;
        return (
          <button
            key={action.id}
            className={`quick-action-btn ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(action)}
            title={action.description}
            disabled={disabled}
            style={{
              '--action-color': action.color,
              '--action-color-light': `${action.color}20`,
            } as React.CSSProperties}
          >
            <span className="quick-action-icon">{action.icon}</span>
            <span className="quick-action-label">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default QuickActionBar;
