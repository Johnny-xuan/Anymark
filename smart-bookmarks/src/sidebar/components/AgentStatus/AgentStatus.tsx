/**
 * AgentStatus - 轻量级状态指示器
 * 
 * 设计理念：Calm Terminal
 * - 不使用花哨的卡片和动画
 * - 用简单的符号和文字表达状态
 * - 像终端日志一样自然流动
 * - 支持详细模式展示透明化信息
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './AgentStatus.css';

export type StatusType = 'thinking' | 'searching' | 'executing' | 'complete' | 'error' | 'reflection' | 'hallucination' | 'parse-fix';

export interface AgentStatusStep {
  id: string;
  type: StatusType;
  message: string;
  detail?: string;
  timestamp: number;
  /** 详细信息（用于展开显示） */
  expandedDetail?: {
    /** 完整内容 */
    content?: string;
    /** 数据（JSON 格式） */
    data?: any;
    /** 应用的修复 */
    fixes?: string[];
    /** 警告信息 */
    warnings?: string[];
  };
}

interface AgentStatusProps {
  steps: AgentStatusStep[];
  isActive?: boolean;
  /** 是否启用详细模式（可展开查看详情） */
  detailedMode?: boolean;
}

// 简单的符号，不用图标
const getStatusSymbol = (type: StatusType, isLast: boolean, isActive: boolean): string => {
  if (isLast && isActive) {
    return '●'; // 活动状态用实心圆
  }
  switch (type) {
    case 'complete':
      return '✓';
    case 'error':
      return '✗';
    case 'reflection':
      return '↻';
    case 'hallucination':
      return '⚠';
    case 'parse-fix':
      return '⚙';
    default:
      return '○';
  }
};

const getStatusColor = (type: StatusType): string => {
  switch (type) {
    case 'complete':
      return 'var(--status-success, #10b981)';
    case 'error':
      return 'var(--status-error, #ef4444)';
    case 'reflection':
      return 'var(--status-warning, #f59e0b)';
    case 'hallucination':
      return 'var(--status-warning, #f59e0b)';
    case 'parse-fix':
      return 'var(--status-info, #3b82f6)';
    case 'thinking':
    case 'searching':
    case 'executing':
    default:
      return 'var(--text-tertiary, #6b7280)';
  }
};

/** 格式化 JSON 数据用于显示 */
const formatJsonForDisplay = (data: any, maxLength: number = 500): string => {
  try {
    const str = JSON.stringify(data, null, 2);
    if (str.length > maxLength) {
      return str.slice(0, maxLength) + '\n... (truncated)';
    }
    return str;
  } catch {
    return String(data);
  }
};

const AgentStatus: React.FC<AgentStatusProps> = ({ 
  steps, 
  isActive = false,
  detailedMode = false,
}) => {
  const { t } = useTranslation();
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }, []);

  if (steps.length === 0) return null;

  return (
    <div className="agent-status">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const symbol = getStatusSymbol(step.type, isLast, isActive);
        const color = isLast && isActive ? 'var(--accent-primary, #6366f1)' : getStatusColor(step.type);
        const isExpanded = expandedSteps.has(step.id);
        const hasExpandedDetail = detailedMode && step.expandedDetail;
        
        return (
          <div 
            key={step.id} 
            className={`status-line ${step.type} ${isLast && isActive ? 'active' : ''} ${hasExpandedDetail ? 'expandable' : ''}`}
          >
            <span className="status-symbol" style={{ color }}>
              {symbol}
            </span>
            <div className="status-content">
              <span 
                className="status-text"
                onClick={hasExpandedDetail ? () => toggleExpand(step.id) : undefined}
                style={hasExpandedDetail ? { cursor: 'pointer' } : undefined}
              >
                {step.message}
                {step.detail && (
                  <span className="status-detail">{step.detail}</span>
                )}
                {hasExpandedDetail && (
                  <span className="expand-indicator">
                    {isExpanded ? ' ▼' : ' ▶'}
                  </span>
                )}
              </span>
              
              {/* 展开的详细信息面板 */}
              {hasExpandedDetail && isExpanded && (
                <div className="expanded-panel">
                  {step.expandedDetail?.content && (
                    <div className="expanded-section">
                      <div className="expanded-label">{t('agentStatus.content', '内容')}</div>
                      <pre className="expanded-content">{step.expandedDetail.content}</pre>
                    </div>
                  )}
                  {step.expandedDetail?.data && (
                    <div className="expanded-section">
                      <div className="expanded-label">{t('agentStatus.data', '数据')}</div>
                      <pre className="expanded-data">
                        {formatJsonForDisplay(step.expandedDetail.data)}
                      </pre>
                    </div>
                  )}
                  {step.expandedDetail?.fixes && step.expandedDetail.fixes.length > 0 && (
                    <div className="expanded-section">
                      <div className="expanded-label">{t('agentStatus.appliedFixes', '应用的修复')}</div>
                      <ul className="expanded-list">
                        {step.expandedDetail.fixes.map((fix, i) => (
                          <li key={i}>{fix}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {step.expandedDetail?.warnings && step.expandedDetail.warnings.length > 0 && (
                    <div className="expanded-section warning">
                      <div className="expanded-label">{t('agentStatus.warnings', '警告')}</div>
                      <ul className="expanded-list">
                        {step.expandedDetail.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AgentStatus;
