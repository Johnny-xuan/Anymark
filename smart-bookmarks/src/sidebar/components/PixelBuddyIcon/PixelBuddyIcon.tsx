import React from 'react';

// 主题类型定义
export type PixelBuddyTheme = 'classic' | 'cyber' | 'grow' | 'flare' | 'noir';

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
    leaf: '#10b981', // Emerald 500 - More visible green
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

interface PixelBuddyIconProps {
  theme?: PixelBuddyTheme;
  size?: number;
  className?: string;
  animated?: boolean;
}

const PixelBuddyIcon: React.FC<PixelBuddyIconProps> = ({
  theme = 'classic',
  size = 32,
  className = '',
  animated = true,
}) => {
  const colors = THEME_COLORS[theme];
  const showLeafs = theme === 'grow';
  const isNoir = theme === 'noir';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`pixel-buddy-icon theme-${theme} ${className}`}
    >
      <style>
        {`
          .pixel-buddy-icon.theme-classic .buddy-body { filter: drop-shadow(0 2px 4px rgba(59, 130, 246, 0.3)); }
          .pixel-buddy-icon.theme-cyber .buddy-body { filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.5)); }
          .pixel-buddy-icon.theme-grow .buddy-body { filter: drop-shadow(0 2px 4px rgba(16, 185, 129, 0.3)); }
          .pixel-buddy-icon.theme-flare .buddy-body { filter: drop-shadow(0 2px 8px rgba(245, 158, 11, 0.4)); }
          .pixel-buddy-icon.theme-noir .buddy-body { filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5)); }

          /* Animations */
          .pixel-buddy-icon .buddy-eyes { transform-origin: center; }
          .pixel-buddy-icon:hover .buddy-eyes { animation: blink 0.5s ease-in-out; }
          
          @keyframes blink {
            0%, 100% { transform: scaleY(1); }
            50% { transform: scaleY(0.1); }
          }
          @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-2px); }
          }
           @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 0.8; }
          }
           @keyframes glow {
            0%, 100% { filter: drop-shadow(0 0 2px ${colors.stars}); }
            50% { filter: drop-shadow(0 0 5px ${colors.stars}); }
          }
          
          /* Blink Animation for Idle State */
          ${animated ? `
            .buddy-eyes { animation: blink-idle 4s infinite; }
            .buddy-body { animation: float 3s ease-in-out infinite; }
          ` : ''}

          @keyframes blink-idle {
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
          
          /* Forest Breath Animations */
          @keyframes breeze-flow {
            0%, 100% { transform: translate(-1px, 1px) rotate(-3deg); }
            50% { transform: translate(1px, -1px) rotate(3deg); }
          }
          @keyframes breeze-back {
            0%, 100% { transform: translate(1px, -1px) rotate(2deg); }
            50% { transform: translate(-1px, 1px) rotate(-2deg); }
          }
        `}
      </style>

      {/* 3D 后景叶子 (Back Layer Leaves) - 围绕 (Surround) */}
      {showLeafs && (
        <g className="buddy-leafs-back">
          {/* 左后衬叶 */}
          <g style={animated ? { animation: 'breeze-back 6s ease-in-out infinite' } : {}}>
            <path d="M2 12 Q 0 10 4 8 Q 6 11 2 12 Z" fill={colors.outline} opacity="0.4" />
          </g>
          {/* 右后衬叶 */}
          <g style={animated ? { animation: 'breeze-back 7s ease-in-out infinite', animationDelay: '1s' } : {}}>
            <path d="M30 20 Q 32 18 28 16 Q 26 19 30 20 Z" fill={colors.outline} opacity="0.4" />
          </g>
        </g>
      )}

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
        {theme === 'cyber' ? (
          <>
            {/* Vex: 左眼正常，右眼是义眼/故障方块 */}
            <circle cx="12" cy="17" r="1.5" fill={colors.eye} />
            <rect x="16.5" y="15.5" width="3" height="3" fill="#00ff41" opacity="0.9" /> {/* 亮绿色赛博义眼 */}
            <circle cx="12.5" cy="16.5" r="0.5" fill="white" />
          </>
        ) : theme === 'noir' ? (
          <>
            {/* Null: 像素墨镜 (Cool Sunglasses) - 🕶️ */}
            {/* 镜片 */}
            <rect x="9" y="15" width="6" height="4" fill="#00ff41" opacity="0.9" rx="1" />
            <rect x="17" y="15" width="6" height="4" fill="#00ff41" opacity="0.9" rx="1" />
            {/* 鼻梁架 */}
            <rect x="15" y="16" width="2" height="1" fill="#00ff41" opacity="0.9" />
            {/* 高光 */}
            <rect x="10" y="16" width="2" height="1" fill="white" opacity="0.6" />
            <rect x="18" y="16" width="2" height="1" fill="white" opacity="0.6" />
          </>
        ) : theme === 'grow' ? (
          <>
            {/* Sprout: 可爱圆眼 (无睫毛) */}
            <circle cx="12" cy="17" r="1.5" fill={colors.eye} />
            <circle cx="18" cy="17" r="1.5" fill={colors.eye} />

            {/* 眼睛高光 */}
            <circle cx="12.5" cy="16.5" r="0.5" fill="white" />
            <circle cx="18.5" cy="16.5" r="0.5" fill="white" />
          </>
        ) : (
          <>
            <circle cx="12" cy="17" r="1.5" fill={colors.eye} />
            <circle cx="18" cy="17" r="1.5" fill={colors.eye} />
            {/* 眼睛高光 */}
            <circle cx="12.5" cy="16.5" r="0.5" fill="white" />
            <circle cx="18.5" cy="16.5" r="0.5" fill="white" />
          </>
        )}
      </g>

      {/* 脸颊 */}
      <g className="buddy-cheeks">
        <circle cx="10" cy="20" r="1" fill={colors.cheek} opacity={theme === 'grow' ? 0.8 : 0.35} />
        <circle cx="20" cy="20" r="1" fill={colors.cheek} opacity={theme === 'grow' ? 0.8 : 0.35} />
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
        // Sprout 知识园丁 - 可爱少女笑 (Girl Smile)
        <path d="M 13.5 22 Q 15 23.5 16.5 22 Z" fill={colors.eye} opacity="0.8" />
      )}
      {theme === 'flare' && (
        // Flare 灵感探险家 - 大一点的开心微笑
        <path d="M 12.5 22 Q 15 24.5 17.5 22" stroke={colors.eye} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      )}
      {theme === 'noir' && (
        // Null - 佩戴墨镜，不需要嘴巴或者一个极简的酷嘴
        <path d="M 14 23 L 18 23" stroke={colors.eye} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      )}

      {/* 手臂 */}
      <g className="buddy-arms">
        <rect className="arm-left" x="4" y="16" width="4" height="2" rx="1" fill={colors.body} />
        <rect className="arm-right" x="22" y="16" width="4" height="2" rx="1" fill={colors.body} />
      </g>

      {/* 星星装饰 - classic/flare (只有这些主题显示星星) */}
      {!showLeafs && theme !== 'cyber' && theme !== 'noir' && (
        <g className="buddy-stars">
          <circle cx="5" cy="8" r="1" fill={colors.stars} opacity="0.8" />
          <circle cx="25" cy="8" r="0.8" fill={colors.stars} opacity="0.6" />
        </g>
      )}

      {/* 故障装饰 - cyber (方块) */}
      {theme === 'cyber' && (
        <g className="buddy-glitch" style={animated ? { animation: 'float 2s ease-in-out infinite reverse' } : {}}>
          <rect x="4" y="7" width="2" height="2" fill={colors.stars} opacity="0.8" />
          <rect x="26" y="9" width="1.5" height="1.5" fill={colors.stars} opacity="0.6" />
          <rect x="24" y="5" width="1" height="1" fill={colors.stars} opacity="0.4" />
        </g>
      )}

      {/* 二进制装饰 - noir (0/1 流) */}
      {theme === 'noir' && (
        <g className="buddy-matrix" style={animated ? { animation: 'float 3s linear infinite' } : {}}>
          <text x="4" y="10" fontSize="8" fill={colors.stars} opacity="0.6" style={{ fontFamily: 'monospace' }}>1</text>
          <text x="26" y="8" fontSize="6" fill={colors.stars} opacity="0.4" style={{ fontFamily: 'monospace' }}>0</text>
          <text x="5" y="25" fontSize="6" fill={colors.stars} opacity="0.3" style={{ fontFamily: 'monospace' }}>0</text>
        </g>
      )}

      {/* 3D 前景叶子 (Front Layer Leaves) - 拂袖 (Breeze Sleeve) */}
      {/* 3D 前景装饰 (Front Decorations) - 花饰 (Flower Accessory) */}
      {showLeafs && (
        <g className="buddy-flower-accessory" style={animated ? { animation: 'leaf-sway 4s ease-in-out infinite', transformOrigin: '24px 12px' } : {}}>
          {/* 花朵主体 - 侧边发卡 (Hair Clip Style) */}
          <g transform="translate(23, 11) scale(0.8)">
            {/* 花瓣 (白色/粉色) */}
            <circle cx="0" cy="-2" r="2" fill="#FCE7F3" /> {/* Top */}
            <circle cx="2" cy="0" r="2" fill="#FCE7F3" />  {/* Right */}
            <circle cx="0" cy="2" r="2" fill="#FCE7F3" />  {/* Bottom */}
            <circle cx="-2" cy="0" r="2" fill="#FCE7F3" /> {/* Left */}

            {/* 花蕊 (黄色) */}
            <circle cx="0" cy="0" r="1.5" fill="#FCD34D" />
          </g>
        </g>
      )}
    </svg >
  );
};

export default PixelBuddyIcon;
