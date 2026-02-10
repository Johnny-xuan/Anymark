/**
 * ViewModeSelector - Finder 风格视图切换器
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { List, LayoutGrid, Columns } from 'lucide-react';
import './ViewModeSelector.css';

export type ViewMode = 'list' | 'grid' | 'column';

interface ViewModeSelectorProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  disabled?: boolean;
}

const ViewModeSelector: React.FC<ViewModeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  
  const VIEW_MODES: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'list', icon: <List size={16} />, label: t('viewMode.list', 'List') },
    { mode: 'grid', icon: <LayoutGrid size={16} />, label: t('viewMode.grid', 'Grid') },
    { mode: 'column', icon: <Columns size={16} />, label: t('viewMode.column', 'Column') },
  ];

  return (
    <div className="view-mode-selector" role="group" aria-label={t('viewMode.label', 'View mode')}>
      {VIEW_MODES.map(({ mode, icon, label }) => (
        <button
          key={mode}
          className={`view-mode-btn ${value === mode ? 'active' : ''}`}
          onClick={() => onChange(mode)}
          disabled={disabled}
          title={label}
          aria-pressed={value === mode}
        >
          {icon}
        </button>
      ))}
    </div>
  );
};

export default ViewModeSelector;
