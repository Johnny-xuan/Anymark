/**
 * 思考过程卡片组件
 * 类似 ChatGPT 的可折叠思考过程展示
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './ThinkingCard.css';

export interface ThinkingStep {
  id: string;
  message: string;
  timestamp: number;
  type?: 'thinking' | 'tool' | 'result' | 'error';
}

interface ThinkingCardProps {
  steps: ThinkingStep[];
  isComplete?: boolean;
}

const ThinkingCard: React.FC<ThinkingCardProps> = ({ steps, isComplete = false }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  if (steps.length === 0) return null;

  return (
    <div className={`thinking-card ${isComplete ? 'complete' : 'active'}`}>
      {/* 头部 - 可点击展开/折叠 */}
      <button
        className="thinking-card-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="thinking-card-icon">
          <Brain size={16} />
        </div>
        <div className="thinking-card-title">
          {isComplete ? t('thinkingCard.thinkingProcess') : t('thinkingCard.thinking')}
        </div>
        <div className="thinking-card-toggle">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {/* 内容 - 可展开 */}
      {isExpanded && (
        <div className="thinking-card-content">
          {steps.map((step, index) => (
            <div key={step.id} className={`thinking-step ${step.type || 'thinking'}`}>
              <div className="step-number">{index + 1}</div>
              <div className="step-message">{step.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* 底部进度条 */}
      {!isComplete && (
        <div className="thinking-card-progress">
          <div className="progress-bar"></div>
        </div>
      )}
    </div>
  );
};

export default ThinkingCard;
