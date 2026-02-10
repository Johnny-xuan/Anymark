/**
 * Pixel Buddy Icon - 根据用户选择的主题显示不同的像素角色图标
 */

import React, { useEffect, useState } from 'react';

type PixelBuddyTheme = 'classic' | 'cyber' | 'grow' | 'flare' | 'noir';

interface PixelBuddyIconProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

interface ThemeColors {
  body: string;
  highlight: string;
  ribbon: string;
  stars: string;
  outline: string;
  eye: string;
  cheek: string;
  leaf: string;
}

const THEME_COLORS: Record<PixelBuddyTheme, ThemeColors> = {
  classic: {
    body: '#3b82f6',
    highlight: '#2563eb',
    ribbon: '#f56565',
    stars: '#fbd38d',
    outline: '#1e3a8a',
    eye: '#2d3748',
    cheek: '#f9a8d4',
    leaf: '#6ee7b7',
  },
  cyber: {
    body: '#8b5cf6',
    highlight: '#7c3aed',
    ribbon: '#ec4899',
    stars: '#c4b5fd',
    outline: '#4c1d95',
    eye: '#fdf2ff',
    cheek: '#f472b6',
    leaf: '#c4b5fd',
  },
  grow: {
    body: '#10b981',
    highlight: '#059669',
    ribbon: '#34d399',
    stars: '#6ee7b7',
    outline: '#065f46',
    eye: '#065f46',
    cheek: '#6ee7b7',
    leaf: '#6ee7b7',
  },
  flare: {
    body: '#f59e0b',
    highlight: '#fbbf24',
    ribbon: '#f97316',
    stars: '#fde68a',
    outline: '#78350f',
    eye: '#78350f',
    cheek: '#fdba74',
    leaf: '#fde68a',
  },
  noir: {
    body: '#1a1a1a',
    highlight: '#111111',
    ribbon: '#00ff41',
    stars: '#00ff41',
    outline: '#333333',
    eye: '#00ff41',
    cheek: '#00ff41',
    leaf: '#00ff41',
  },
};

/**
 * 获取用户选择的主题
 */
async function getUserTheme(): Promise<PixelBuddyTheme> {
  try {
    const result = await chrome.storage.local.get(['userSettings']);
    const theme = result.userSettings?.pixelBuddyTheme;
    if (theme && ['classic', 'cyber', 'grow', 'flare', 'noir'].includes(theme)) {
      return theme as PixelBuddyTheme;
    }
  } catch (e) {
    console.warn('[PixelBuddyIcon] Failed to load theme:', e);
  }
  return 'classic';
}

const PixelBuddyIcon: React.FC<PixelBuddyIconProps> = ({
  size = 24,
  className = '',
  animated = false,
}) => {
  const [theme, setTheme] = useState<PixelBuddyTheme>('classic');
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    getUserTheme().then(setTheme);

    // 监听主题变化
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local') return;
      if (changes.userSettings) {
        const newSettings = changes.userSettings.newValue;
        if (newSettings?.pixelBuddyTheme) {
          const validThemes = ['classic', 'cyber', 'grow', 'flare', 'noir'];
          if (validThemes.includes(newSettings.pixelBuddyTheme)) {
            setTheme(newSettings.pixelBuddyTheme as PixelBuddyTheme);
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const colors = THEME_COLORS[theme];

  // 根据主题调整 SVG 元素的显示
  const showLeafs = theme === 'grow';
  const isNoir = theme === 'noir';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={`pixel-buddy-icon ${className}`}
      style={{
        ...(animated ? { animation: 'float 3s ease-in-out infinite' } : {}),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 定义动画 */}
      <style>
        {`
          @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-2px); }
          }
          @keyframes blink {
            0%, 90%, 100% { transform: scaleY(1); }
            95% { transform: scaleY(0.3); }
          }
          .pixel-buddy-icon:hover .buddy-body {
            animation: wiggle 0.3s ease-in-out;
          }
          .pixel-buddy-icon:hover .arm-left {
            animation: wave-arm-left 0.4s ease-in-out;
          }
          .pixel-buddy-icon:hover .arm-right {
            animation: wave-arm-right 0.4s ease-in-out;
          }
          @keyframes wiggle {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-3deg); }
            75% { transform: rotate(3deg); }
          }
          @keyframes wave-arm-left {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(-15deg); }
          }
          @keyframes wave-arm-right {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(15deg); }
          }
        `}
      </style>

      {/* 书本身体 */}
      <g className="buddy-body">
        {/* 书本底色 */}
        <rect
          x="6"
          y="9"
          width="20"
          height="19"
          rx="2"
          fill={colors.body}
        />
        {/* 书本高光 */}
        <rect
          x="6"
          y="9"
          width="4"
          height="19"
          rx="2"
          fill={colors.highlight}
          opacity="0.4"
        />
        {/* 书页线 */}
        <line x1="11" y1="11" x2="11" y2="25" stroke={isNoir ? colors.stars : '#ffffff'} strokeWidth="0.5" opacity="0.3" />
        <line x1="13" y1="11" x2="13" y2="25" stroke={isNoir ? colors.stars : '#ffffff'} strokeWidth="0.5" opacity="0.2" />
        <line x1="15" y1="11" x2="15" y2="25" stroke={isNoir ? colors.stars : '#ffffff'} strokeWidth="0.5" opacity="0.15" />
      </g>

      {/* 书签丝带 */}
      <g className="buddy-ribbon">
        <rect x="15" y="4" width="2" height="10" fill={colors.ribbon} />
        <polygon points="15,14 17,14 16,16" fill={colors.ribbon} />
      </g>

      {/* 眼睛 */}
      <g className="buddy-eyes" style={animated ? { animation: 'blink 4s ease-in-out infinite', transformOrigin: 'center' } : {}}>
        <circle cx="12" cy="17" r="1.5" fill={colors.eye} />
        <circle cx="18" cy="17" r="1.5" fill={colors.eye} />
        {/* 眼睛高光 */}
        <circle cx="12.5" cy="16.5" r="0.5" fill="white" />
        <circle cx="18.5" cy="16.5" r="0.5" fill="white" />
      </g>

      {/* 脸颊 */}
      <g className="buddy-cheeks">
        <circle cx="10" cy="20" r="1" fill={colors.cheek} opacity="0.35" />
        <circle cx="20" cy="20" r="1" fill={colors.cheek} opacity="0.35" />
      </g>

      {/* 嘴巴 - 根据角色性格定制表情 */}
      {theme === 'classic' && (
        // Koda 博学者 - 小弧线，温和微笑
        <path d="M 13.5 22 Q 15 23.2 16.5 22" stroke={colors.eye} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      )}
      {theme === 'cyber' && (
        // Vex 赛博猎人 - 斜嘴/酷，不对称的自信笑
        <path d="M 13 22.5 Q 14.5 22 17 21" stroke={colors.eye} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      )}
      {theme === 'grow' && (
        // Sprout 知识园丁 - 开心微笑弧线
        <path d="M 13 22 Q 15 24 17 22" stroke={colors.eye} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      )}
      {theme === 'flare' && (
        // Flare 灵感探险家 - 大一点的开心微笑
        <path d="M 12.5 22 Q 15 24.5 17.5 22" stroke={colors.eye} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      )}
      {theme === 'noir' && (
        // Null 二进制管家 - 直线，冷静中性
        <path d="M 13 22 L 17 22" stroke={colors.eye} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      )}

      {/* 手臂 */}
      <g className="buddy-arms">
        <rect className="arm-left" x="4" y="16" width="4" height="2" rx="1" fill={colors.body} />
        <rect className="arm-right" x="22" y="16" width="4" height="2" rx="1" fill={colors.body} />
      </g>

      {/* 星星装饰 - classic/cyber/flare */}
      {!showLeafs && (
        <g className="buddy-stars">
          <circle cx="5" cy="8" r="1" fill={colors.stars} opacity="0.8" />
          <circle cx="25" cy="8" r="0.8" fill={colors.stars} opacity="0.6" />
        </g>
      )}

      {/* 叶子装饰 - grow */}
      {showLeafs && (
        <g className="buddy-leafs" style={animated ? { animation: 'leaf-sway 3s ease-in-out infinite' } : {}}>
          <path d="M4 8 C3 9 3 11 5 11.5 C7 11 7 8 4 8 Z" fill={colors.leaf} />
          <path d="M26 8 C25 9 25 11 27 11.5 C29 11 29 8 26 8 Z" fill={colors.leaf} />
        </g>
      )}
    </svg>
  );
};

export default PixelBuddyIcon;
