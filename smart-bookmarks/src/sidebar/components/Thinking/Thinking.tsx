/**
 * Thinking 组件 - 极简纯文本思考过程
 *
 * 特性：
 * 1. 活跃时自动展开，完成后自动折叠
 * 2. 展开/折叠带平滑高度过渡动画（CSS grid trick）
 * 3. 内容超出 max-height 时出现滚动
 * 4. answer 类型已从 thinkingEntries 中移除
 */

import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import './Thinking.css';

export interface ThinkingEntry {
  type: 'thought' | 'action' | 'observation' | 'reflection' | 'answer';
  content: string;
  timestamp: number;
  success?: boolean;
}

interface ThinkingProps {
  entries: ThinkingEntry[];
  isActive: boolean;
}

const MAX_ENTRIES = 50;

const Thinking: React.FC<ThinkingProps> = ({ entries, isActive }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 活跃时自动展开，完成后自动折叠
  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  }, [isActive]);

  // 自动滚动到底部（仅在活跃且展开时）
  useEffect(() => {
    if (expanded && isActive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, expanded, isActive]);

  const toggle = useCallback(() => setExpanded(p => !p), []);

  const visibleEntries = useMemo(() => {
    return entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries;
  }, [entries]);

  if (entries.length === 0 && !isActive) return null;

  // 获取步骤类型显示名称
  const getTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      thought: t('thinking.types.thought', '思考'),
      action: t('thinking.types.action', '执行'),
      observation: t('thinking.types.observation', '结果'),
      reflection: t('thinking.types.reflection', '反思'),
      answer: t('thinking.types.answer', '答案'),
    };
    return labels[type] || type;
  };

  return (
    <div className={`thinking-box ${isActive ? 'thinking-active' : ''}`}>
      <div className="thinking-header" onClick={toggle}>
        <span className="thinking-header-toggle">
          {expanded ? '▼' : '▶'}
        </span>
        <span className="thinking-header-title">
          {isActive ? t('thinking.thinkingInProgress', '思考中...') : t('thinking.thinkingProcess', '思考过程')}
        </span>
        <span className="thinking-header-count">({entries.length}{t('thinking.steps', '步')})</span>
        {isActive && <span className="thinking-indicator" />}
      </div>

      {/* CSS grid 动画容器：0fr ↔ 1fr 实现平滑高度过渡 */}
      <div className={`thinking-body-wrapper ${expanded ? 'thinking-expanded' : 'thinking-collapsed'}`}>
        <div className="thinking-body-inner">
          <div className="thinking-body-scroll" ref={scrollRef}>
            {visibleEntries.length === 0 ? (
              <div className="thinking-empty">{t('thinking.waiting', '等待思考...')}</div>
            ) : (
              visibleEntries.map((entry, i) => (
                <div key={entry.timestamp || i} className="thinking-line">
                  <span className={`thinking-type thinking-type-${entry.type} ${entry.success === false ? 'thinking-type-error' : ''}`}>
                    [{getTypeLabel(entry.type)}]
                  </span>
                  <span className="thinking-text">
                    {entry.content.length > 1000 ? entry.content.slice(0, 1000) + '...' : entry.content}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(Thinking);
