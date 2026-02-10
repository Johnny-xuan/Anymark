/**
 * 书签导入进度组件
 */

import React from 'react';
import { Download, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './ImportProgress.css';

interface ImportProgressProps {
  current: number;
  total: number;
  isComplete: boolean;
}

const ImportProgress: React.FC<ImportProgressProps> = ({ current, total, isComplete }) => {
  const { t } = useTranslation();
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  if (isComplete && current === 0) {
    return null; // 完全隐藏
  }

  return (
    <div className="import-progress-container">
      <div className="import-progress-card">
        {isComplete ? (
          <>
            <div className="import-success-icon">
              <CheckCircle size={48} />
            </div>
            <h3 className="import-title">{t('importProgress.title')}</h3>
            <p className="import-subtitle">
              {t('sidebar.toast.importSuccess', { count: total })}
            </p>
          </>
        ) : (
          <>
            <div className="import-loading-icon">
              <Download size={48} className="download-icon" />
            </div>
            <h3 className="import-title">{t('importProgress.importing')}</h3>
            <p className="import-subtitle">
              {current} / {total} ({percentage}%)
            </p>
            <div className="import-progress-bar">
              <div
                className="import-progress-fill"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="import-hint">{t('importProgress.hint')}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default ImportProgress;
