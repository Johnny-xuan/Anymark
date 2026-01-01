/**
 * 增强的进度指示器组件
 * 显示 AI 工作状态的详细信息
 */

import React from 'react';
import { Brain, Wrench, Cog, PenTool } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProgressInfo } from '../../../utils/agent/types';
import './ProgressIndicator.css';

interface ProgressIndicatorProps {
  progress: ProgressInfo;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ progress }) => {
  const { t } = useTranslation();

  // 根据阶段选择图标和颜色（使用主题色）
  const getStageInfo = () => {
    const themeColor = 'var(--accent-primary, #3b82f6)'; // 主题色
    const themeBg = 'rgba(59, 130, 246, 0.1)';

    switch (progress.stage) {
      case 'thinking':
        return {
          icon: <Brain size={16} />,
          color: themeColor,
          bgColor: themeBg,
          label: t('progressIndicator.thinking'),
        };
      case 'tool_calling':
        return {
          icon: <Wrench size={16} />,
          color: themeColor,
          bgColor: themeBg,
          label: t('progressIndicator.toolCalling'),
        };
      case 'tool_executing':
        return {
          icon: <Cog size={16} />,
          color: themeColor,
          bgColor: themeBg,
          label: t('progressIndicator.toolExecuting'),
        };
      case 'responding':
        return {
          icon: <PenTool size={16} />,
          color: themeColor,
          bgColor: themeBg,
          label: t('progressIndicator.responding'),
        };
      default:
        return {
          icon: <Brain size={16} />,
          color: themeColor,
          bgColor: themeBg,
          label: t('progressIndicator.processing'),
        };
    }
  };

  const stageInfo = getStageInfo();

  return (
    <div className="progress-indicator-enhanced">
      <div
        className="progress-icon-wrapper"
        style={{ 
          '--icon-color': stageInfo.color,
          '--icon-bg': stageInfo.bgColor,
        } as React.CSSProperties}
      >
        {stageInfo.icon}
      </div>
      <div className="progress-content">
        <div className="progress-stage">{stageInfo.label}</div>
        <div className="progress-message">{progress.message}</div>
        {progress.toolName && (
          <div className="progress-tool">
            <span className="tool-badge">{progress.toolName}</span>
            {progress.toolIndex !== undefined && progress.totalTools && (
              <span className="tool-count">
                {progress.toolIndex + 1} / {progress.totalTools}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="progress-spinner">
        <div className="spinner"></div>
      </div>
    </div>
  );
};

export default ProgressIndicator;
