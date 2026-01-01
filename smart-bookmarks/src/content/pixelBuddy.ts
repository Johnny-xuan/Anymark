/**
 * 像素小助手 - 可爱的浮动书签管家
 * 一个像素风格的可爱角色，帮助用户快速访问书签功能
 */

// 使用IIFE包裹避免全局变量冲突
(function() {
  'use strict';

let buddy: HTMLElement | null = null;
let isDragging = false;
let currentX = 0;
let currentY = 0;
let initialX = 0;
let initialY = 0;
const extensionInvalidated = false;

/**
 * 检查扩展上下文是否仍然有效
 */
function isExtensionValid(): boolean {
  if (extensionInvalidated) return false;
  try {
    // 尝试访问 chrome.runtime 以检查上下文是否有效
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

/**
 * 像素风格的小助手SVG（一个可爱的书本精灵）
 */
const PIXEL_BUDDY_SVG = `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <!-- 身体 - 书本形状 -->
  <g class="buddy-body">
    <!-- 书本外描边 -->
    <rect class="book-outline" x="11" y="19" width="42" height="38" rx="3"/>

    <!-- 书本底色 -->
    <rect class="book-body" x="12" y="20" width="40" height="36" rx="2"/>

    <!-- 书本高光 -->
    <rect class="book-highlight" x="12" y="20" width="6" height="36" rx="2"/>

    <!-- 书页 -->
    <rect class="page-line line-1" x="18" y="22" width="2" height="32" opacity="0.3"/>
    <rect class="page-line line-2" x="22" y="22" width="2" height="32" opacity="0.2"/>
    <rect class="page-line line-3" x="26" y="22" width="2" height="32" opacity="0.15"/>

    <!-- 书本装饰 -->
    <rect class="book-emblem" x="34" y="26" width="10" height="2" rx="1"/>
    <rect class="book-emblem" x="34" y="30" width="8" height="2" rx="1"/>

    <!-- 书签丝带 -->
    <rect class="ribbon" x="30" y="8" width="4" height="20"/>
    <polygon class="ribbon-tip" points="30,28 34,28 32,32"/>
  </g>

  <!-- 眼睛 -->
  <g class="buddy-eyes">
    <circle class="eye-left" cx="26" cy="36" r="3" fill="#2d3748"/>
    <circle class="eye-right" cx="38" cy="36" r="3" fill="#2d3748"/>
    <circle class="eye-shine-left" cx="27" cy="35" r="1" fill="white"/>
    <circle class="eye-shine-right" cx="39" cy="35" r="1" fill="white"/>
  </g>

  <!-- 脸颊 -->
  <g class="buddy-cheeks">
    <circle class="cheek cheek-left" cx="22" cy="41" r="2"/>
    <circle class="cheek cheek-right" cx="42" cy="41" r="2"/>
  </g>

  <!-- 嘴巴 - 根据主题动态设置 -->
  <g class="buddy-mouth-group">
    <!-- classic: Koda 博学者 - 小弧线，温和微笑 -->
    <path class="buddy-mouth mouth-classic" d="M 28 44 Q 32 46.4 36 44"
          stroke="#2d3748" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- cyber: Vex 赛博猎人 - 斜嘴/酷，不对称的自信笑 -->
    <path class="buddy-mouth mouth-cyber" d="M 28 45 Q 31 44 36 42"
          stroke="#fdf2ff" stroke-width="2" fill="none" stroke-linecap="round" style="display:none"/>
    <!-- grow: Sprout 知识园丁 - 开心微笑弧线 -->
    <path class="buddy-mouth mouth-grow" d="M 28 44 Q 32 48 36 44"
          stroke="#065f46" stroke-width="2" fill="none" stroke-linecap="round" style="display:none"/>
    <!-- flare: Flare 灵感探险家 - 大一点的开心微笑 -->
    <path class="buddy-mouth mouth-flare" d="M 27 44 Q 32 49 37 44"
          stroke="#78350f" stroke-width="2" fill="none" stroke-linecap="round" style="display:none"/>
    <!-- noir: Null 二进制管家 - 直线，冷静中性 -->
    <path class="buddy-mouth mouth-noir" d="M 28 44 L 36 44"
          stroke="#00ff41" stroke-width="2" fill="none" stroke-linecap="round" style="display:none"/>
  </g>

  <!-- 手臂 -->
  <g class="buddy-arms">
    <rect class="arm-left" x="8" y="32" width="8" height="4" rx="2"/>
    <rect class="arm-right" x="48" y="32" width="8" height="4" rx="2"/>
  </g>

  <!-- 星星装饰 -->
  <g class="buddy-stars">
    <circle class="star" cx="10" cy="16" r="2" opacity="0.8"/>
    <circle class="star" cx="54" cy="16" r="1.5" opacity="0.6"/>
    <circle class="star" cx="14" cy="58" r="1.5" opacity="0.7"/>

    <path class="leaf leaf-1" d="M8 15 C6 16 6 19 9 20 C12 19 12 16 8 15 Z"/>
    <path class="leaf leaf-2" d="M52 15 C50 16 50 19 53 19.8 C56 19 56 16 52 15 Z"/>
    <path class="leaf leaf-3" d="M12 57 C10 58 10 61 13 61.5 C16 61 16 58 12 57 Z"/>
  </g>
</svg>
`;

/**
 * CSS样式
 */
const BUDDY_STYLES = `
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
  }

  @keyframes blink {
    0%, 90%, 100% { transform: scaleY(1); }
    95% { transform: scaleY(0.1); }
  }

  @keyframes wiggle {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-5deg); }
    75% { transform: rotate(5deg); }
  }

  @keyframes sparkle {
    0%, 100% { opacity: 0.4; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.2); }
  }

  @keyframes leaf-sway {
    0%, 100% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(6deg) scale(1.05); }
  }

  @keyframes wave-arm-left {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-20deg); }
  }

  @keyframes wave-arm-right {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(20deg); }
  }

  @keyframes neon-pulse {
    0%, 100% { filter: drop-shadow(0 0 5px #8b5cf6) brightness(1); }
    50% { filter: drop-shadow(0 0 15px #ec4899) brightness(1.2); }
  }

  @keyframes soft-breath {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }

  @keyframes coin-flip {
    0% { transform: rotateY(0deg); }
    100% { transform: rotateY(360deg); }
  }

  @keyframes scanline {
    0% { opacity: 1; }
    50% { opacity: 0.7; }
    100% { opacity: 1; }
  }

  #pixel-buddy-container {
    position: fixed !important;
    width: 64px !important;
    height: 64px !important;
    z-index: 2147483647 !important;
    cursor: grab !important;
    user-select: none !important;
    filter: drop-shadow(0 4px 12px rgba(102, 126, 234, 0.3)) !important;
    transition: filter 0.3s ease !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    --buddy-body: #3b82f6;
    --buddy-highlight: #2563eb;
    --buddy-ribbon: #f56565;
    --buddy-stars: #fbd38d;
    --buddy-outline: #1e3a8a;
    --buddy-page-line: #ffffff;
    --buddy-emblem: rgba(255, 255, 255, 0.45);
    --buddy-eye: #2d3748;
    --buddy-eye-shine: #ffffff;
    --buddy-mouth: #2d3748;
    --buddy-cheek: #f9a8d4;
    --buddy-leaf: #6ee7b7;
    --buddy-tooltip-bg: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    --buddy-tooltip-border: #0284c7;
  }

  #pixel-buddy-container:hover {
    filter: drop-shadow(0 6px 20px rgba(102, 126, 234, 0.5));
  }

  #pixel-buddy-container.dragging {
    cursor: grabbing;
    filter: drop-shadow(0 8px 24px rgba(102, 126, 234, 0.6));
  }

  #pixel-buddy-container.idle .buddy-body {
    animation: float 3s ease-in-out infinite;
  }

  #pixel-buddy-container.idle .buddy-eyes {
    animation: blink 4s ease-in-out infinite;
    transform-origin: center;
  }

  #pixel-buddy-container.idle .buddy-stars circle {
    animation: sparkle 2s ease-in-out infinite;
  }

  #pixel-buddy-container.idle .buddy-stars circle:nth-child(2) {
    animation-delay: 0.5s;
  }

  #pixel-buddy-container.idle .buddy-stars circle:nth-child(3) {
    animation-delay: 1s;
  }

  #pixel-buddy-container:hover .arm-left {
    animation: wave-arm-left 0.6s ease-in-out 2;
    transform-origin: right center;
  }

  #pixel-buddy-container:hover .arm-right {
    animation: wave-arm-right 0.6s ease-in-out 2;
    transform-origin: left center;
  }

  #pixel-buddy-container:hover {
    animation: wiggle 0.5s ease-in-out 2;
  }

  #pixel-buddy-container .book-outline {
    fill: none;
    stroke: var(--buddy-outline);
    stroke-width: 0.5;
    opacity: 0.3;
  }

  #pixel-buddy-container .book-body {
    fill: var(--buddy-body);
  }

  #pixel-buddy-container .book-highlight {
    fill: var(--buddy-highlight);
  }

  #pixel-buddy-container .page-line {
    fill: var(--buddy-page-line);
  }

  #pixel-buddy-container .book-emblem {
    fill: var(--buddy-emblem);
  }

  #pixel-buddy-container .ribbon,
  #pixel-buddy-container .ribbon-tip {
    fill: var(--buddy-ribbon);
  }

  #pixel-buddy-container .buddy-stars .star {
    fill: var(--buddy-stars);
  }

  #pixel-buddy-container .buddy-stars .leaf {
    fill: var(--buddy-leaf);
    display: none;
    transform-origin: center;
    transform-box: fill-box;
  }

  #pixel-buddy-container .arm-left,
  #pixel-buddy-container .arm-right {
    fill: var(--buddy-body);
  }

  #pixel-buddy-container .buddy-eyes .eye-left,
  #pixel-buddy-container .buddy-eyes .eye-right {
    fill: var(--buddy-eye);
  }

  #pixel-buddy-container .buddy-eyes .eye-shine-left,
  #pixel-buddy-container .buddy-eyes .eye-shine-right {
    fill: var(--buddy-eye-shine);
  }

  #pixel-buddy-container .buddy-mouth {
    stroke: var(--buddy-mouth);
  }

  #pixel-buddy-container .buddy-cheeks .cheek {
    fill: var(--buddy-cheek);
    opacity: 0.35;
  }

  /* 提示气泡 */
  #buddy-tooltip {
    position: absolute;
    bottom: 72px;
    left: 50%;
    transform: translateX(-50%) scale(0);
    background: var(--buddy-tooltip-bg);
    color: white;
    padding: 8px 12px;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  #buddy-tooltip .buddy-tooltip-name {
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.2px;
  }

  #buddy-tooltip .buddy-tooltip-slogan {
    margin-top: 4px;
    font-size: 11px;
    opacity: 0.9;
    white-space: normal;
    max-width: 180px;
    line-height: 1.4;
  }

  #buddy-tooltip::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--buddy-tooltip-border);
  }

  #pixel-buddy-container:hover #buddy-tooltip {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }

  /* 赛博霓虹 */
  #pixel-buddy-container.cyber .buddy-body {
    animation: neon-pulse 2s ease-in-out infinite;
  }

  #pixel-buddy-container.cyber #buddy-tooltip {
    background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
    border: 1px solid #ff79c6;
  }

  /* 森系萌芽 */
  #pixel-buddy-container.grow .buddy-body {
    animation: soft-breath 4s ease-in-out infinite;
    transform-origin: center bottom;
  }

  #pixel-buddy-container.grow .buddy-stars circle {
    display: none;
  }

  #pixel-buddy-container.grow .buddy-stars .leaf {
    display: block;
    animation: leaf-sway 3s ease-in-out infinite;
  }

  #pixel-buddy-container.grow .buddy-stars .leaf-2 {
    animation-delay: 0.4s;
  }

  #pixel-buddy-container.grow .buddy-stars .leaf-3 {
    animation-delay: 0.8s;
  }

  /* 余晖探索 */
  #pixel-buddy-container.flare:active {
    animation: coin-flip 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  #pixel-buddy-container.flare #buddy-tooltip {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  }

  /* 极客终端 */
  #pixel-buddy-container.noir {
    filter: sepia(0) contrast(1.2) !important;
  }

  #pixel-buddy-container.noir .buddy-body {
    animation: scanline 0.1s steps(2) infinite;
  }

  #pixel-buddy-container.noir #buddy-tooltip {
    background: #000;
    color: #00ff41;
    border: 1px solid #00ff41;
    font-family: 'Courier New', monospace;
  }
`;

type PixelBuddyTheme = 'classic' | 'cyber' | 'grow' | 'flare' | 'noir';

const THEME_CONFIG: Record<PixelBuddyTheme, {
  body: string;
  highlight: string;
  ribbon: string;
  stars: string;
  outline: string;
  pageLine: string;
  emblem: string;
  eye: string;
  eyeShine: string;
  mouth: string;
  cheek: string;
  leaf: string;
  name: string;
  slogan: string;
  tooltipBg: string;
  tooltipBorder: string;
}> = {
  classic: {
    body: '#3b82f6',
    highlight: '#2563eb',
    ribbon: '#f56565',
    stars: '#fbd38d',
    outline: '#2563eb',  // 与高光同色，更协调
    pageLine: '#ffffff',
    emblem: 'rgba(255, 255, 255, 0.45)',
    eye: '#2d3748',
    eyeShine: '#ffffff',
    mouth: '#2d3748',
    cheek: '#f9a8d4',
    leaf: '#6ee7b7',
    name: '经典学院 (Blue)',
    slogan: '井井有条，是知识的优雅。',
    tooltipBg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    tooltipBorder: '#0284c7',
  },
  cyber: {
    body: '#8b5cf6',
    highlight: '#7c3aed',
    ribbon: '#ec4899',
    stars: '#c4b5fd',
    outline: '#a78bfa',  // 浅紫色，更协调
    pageLine: '#f5d0fe',
    emblem: 'rgba(255, 255, 255, 0.5)',
    eye: '#fdf2ff',
    eyeShine: '#ffffff',
    mouth: '#fdf2ff',
    cheek: '#f472b6',
    leaf: '#c4b5fd',
    name: '赛博霓虹 (Cyber)',
    slogan: '在数字洪流中，捕捉关键信号。',
    tooltipBg: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
    tooltipBorder: '#ff79c6',
  },
  grow: {
    body: '#10b981',
    highlight: '#059669',
    ribbon: '#34d399',
    stars: '#6ee7b7',
    outline: '#34d399',  // 与丝带同色，更协调
    pageLine: '#ecfdf5',
    emblem: 'rgba(255, 255, 255, 0.45)',
    eye: '#065f46',
    eyeShine: '#ffffff',
    mouth: '#065f46',
    cheek: '#6ee7b7',
    leaf: '#6ee7b7',
    name: '森系萌芽 (Grow)',
    slogan: '收藏只是开始，生长才是目的。',
    tooltipBg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    tooltipBorder: '#059669',
  },
  flare: {
    body: '#f59e0b',
    highlight: '#fbbf24',
    ribbon: '#f97316',
    stars: '#fde68a',
    outline: '#fbbf24',  // 与高光同色，更协调
    pageLine: '#fff7ed',
    emblem: 'rgba(255, 255, 255, 0.5)',
    eye: '#78350f',
    eyeShine: '#ffffff',
    mouth: '#78350f',
    cheek: '#fdba74',
    leaf: '#fde68a',
    name: '余晖探索 (Flare)',
    slogan: '每一次点击，都是一次新的探险！',
    tooltipBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    tooltipBorder: '#d97706',
  },
  noir: {
    body: '#1a1a1a',
    highlight: '#111111',
    ribbon: '#00ff41',
    stars: '#00ff41',
    outline: '#333333',  // 深灰色，更协调
    pageLine: '#00ff41',
    emblem: 'rgba(0, 255, 65, 0.55)',
    eye: '#00ff41',
    eyeShine: '#b7ffcd',
    mouth: '#00ff41',
    cheek: '#00ff41',
    leaf: '#00ff41',
    name: '极客终端 (Noir)',
    slogan: '拒绝繁杂，回归极简逻辑。',
    tooltipBg: '#000000',
    tooltipBorder: '#00ff41',
  },
};

const THEME_CLASSNAMES = Object.keys(THEME_CONFIG) as PixelBuddyTheme[];

function normalizeTheme(value: unknown): PixelBuddyTheme {
  if (value && THEME_CLASSNAMES.includes(value as PixelBuddyTheme)) {
    return value as PixelBuddyTheme;
  }
  return 'classic';
}

async function getSelectedTheme(): Promise<PixelBuddyTheme> {
  // 检查扩展上下文是否仍然有效
  if (!isExtensionValid()) return 'classic';

  try {
    if (chrome?.storage?.local) {
      const result = await chrome.storage.local.get(['userSettings']);
      // 统一从 userSettings 中读取
      const stored = result.userSettings?.pixelBuddyTheme;
      return normalizeTheme(stored);
    }
  } catch (e) {
    console.warn('[Pixel Buddy] Failed to load theme from storage:', e);
  }

  return 'classic';
}

function applyTheme(theme: PixelBuddyTheme) {
  if (!buddy) return;
  THEME_CLASSNAMES.forEach((name) => buddy?.classList.remove(name));
  buddy.classList.add(theme);

  const themeConfig = THEME_CONFIG[theme];
  const nameEl = buddy.querySelector('.buddy-tooltip-name') as HTMLElement | null;
  const sloganEl = buddy.querySelector('.buddy-tooltip-slogan') as HTMLElement | null;
  // 只显示 slogan，不显示 name
  if (nameEl) nameEl.textContent = themeConfig.slogan;
  if (sloganEl) sloganEl.textContent = '';

  buddy.style.setProperty('--buddy-body', themeConfig.body);
  buddy.style.setProperty('--buddy-highlight', themeConfig.highlight);
  buddy.style.setProperty('--buddy-ribbon', themeConfig.ribbon);
  buddy.style.setProperty('--buddy-stars', themeConfig.stars);
  buddy.style.setProperty('--buddy-outline', themeConfig.outline);
  buddy.style.setProperty('--buddy-page-line', themeConfig.pageLine);
  buddy.style.setProperty('--buddy-emblem', themeConfig.emblem);
  buddy.style.setProperty('--buddy-eye', themeConfig.eye);
  buddy.style.setProperty('--buddy-eye-shine', themeConfig.eyeShine);
  buddy.style.setProperty('--buddy-mouth', themeConfig.mouth);
  buddy.style.setProperty('--buddy-cheek', themeConfig.cheek);
  buddy.style.setProperty('--buddy-leaf', themeConfig.leaf);
  buddy.style.setProperty('--buddy-tooltip-bg', themeConfig.tooltipBg);
  buddy.style.setProperty('--buddy-tooltip-border', themeConfig.tooltipBorder);

  // 切换嘴巴表情 - 根据主题显示对应的嘴巴
  const mouthPaths = buddy.querySelectorAll('.buddy-mouth');
  mouthPaths.forEach((path) => {
    const el = path as HTMLElement;
    if (el.classList.contains(`mouth-${theme}`)) {
      el.style.display = 'block';
      el.style.stroke = themeConfig.mouth;
    } else {
      el.style.display = 'none';
    }
  });
}

function registerThemeListener() {
  // 检查扩展上下文是否仍然有效
  if (!isExtensionValid() || !chrome?.storage?.onChanged) return;

  chrome.storage.onChanged.addListener((changes, area) => {
    // 再次检查扩展有效性
    if (!isExtensionValid() || area !== 'local') return;

    // 统一监听 userSettings 的变化
    if (changes.userSettings) {
      const newSettings = changes.userSettings.newValue;
      const oldSettings = changes.userSettings.oldValue;

      // 只有当主题真正变化时才应用
      if (newSettings?.pixelBuddyTheme !== oldSettings?.pixelBuddyTheme) {
        console.log('[Pixel Buddy] 🔄 Theme changed:', {
          old: oldSettings?.pixelBuddyTheme,
          new: newSettings?.pixelBuddyTheme
        });
        const nextTheme = normalizeTheme(newSettings?.pixelBuddyTheme);
        applyTheme(nextTheme);
      }
    }

    if (changes.pixelBuddyTheme) {
      const nextTheme = normalizeTheme(changes.pixelBuddyTheme.newValue);
      applyTheme(nextTheme);
    }

    if (changes.pixelBuddyThemeUpdatedAt) {
      getSelectedTheme().then((nextTheme) => applyTheme(nextTheme));
    }
  });
}

/**
 * 创建像素小助手
 */
async function createPixelBuddy() {
  if (buddy) {
    console.log('[Pixel Buddy] Already exists, skipping creation');
    return;
  }

  console.log('[Pixel Buddy] Creating pixel buddy...');

  // 检查body是否存在
  if (!document.body) {
    console.error('[Pixel Buddy] document.body does not exist');
    return;
  }

  // 添加样式
  const styleEl = document.createElement('style');
  styleEl.textContent = BUDDY_STYLES;
  document.head.appendChild(styleEl);
  console.log('[Pixel Buddy] Styles injected');

  // 创建容器
  buddy = document.createElement('div');
  buddy.id = 'pixel-buddy-container';
  buddy.className = 'idle';
  buddy.innerHTML = `
    ${PIXEL_BUDDY_SVG}
    <div id="buddy-tooltip">
      <div class="buddy-tooltip-name"></div>
      <div class="buddy-tooltip-slogan"></div>
    </div>
  `;

  // 初始位置（右下角）- 先设置位置样式
  buddy.style.position = 'fixed';
  buddy.style.bottom = '80px';
  buddy.style.right = '20px';
  buddy.style.width = '64px';
  buddy.style.height = '64px';
  buddy.style.zIndex = '2147483647';
  buddy.style.display = 'block';
  buddy.style.visibility = 'visible';
  buddy.style.opacity = '1';

  // 然后应用主题（CSS 变量不会被覆盖）
  const selectedTheme = await getSelectedTheme();
  applyTheme(selectedTheme);

  // 点击事件
  buddy.addEventListener('click', handleClick);

  // 拖拽事件
  buddy.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  // 触摸事件支持
  buddy.addEventListener('touchstart', touchStart, { passive: false });
  document.addEventListener('touchmove', touchMove, { passive: false });
  document.addEventListener('touchend', touchEnd);

  // 窗口调整大小监听，确保元素不超出边界
  window.addEventListener('resize', handleResize);

  document.body.appendChild(buddy);
  registerThemeListener();

  // 轮询检查主题变化（确保100%刷新）
  startThemePolling();

  console.log('[Pixel Buddy] Added to DOM');
  console.log('[Pixel Buddy] Position:', buddy.getBoundingClientRect());
  console.log('[Pixel Buddy] Computed styles:', {
    display: window.getComputedStyle(buddy).display,
    visibility: window.getComputedStyle(buddy).visibility,
    opacity: window.getComputedStyle(buddy).opacity,
    zIndex: window.getComputedStyle(buddy).zIndex,
    position: window.getComputedStyle(buddy).position,
  });
  console.log('[Pixel Buddy] Initialized successfully');
}

/**
 * 轮询检查主题变化 - 确保 Settings 保存后能刷新
 */
let lastThemeCheck = 0;
function startThemePolling() {
  // 每2秒检查一次存储中的主题设置
  // 使用 chrome.storage.local.get 回调模式，避免 CSP 问题（Chrome 130+）
  setInterval(function() {
    if (!buddy) return;

    // 检查扩展上下文是否仍然有效
    if (!isExtensionValid()) return;

    chrome.storage.local.get(['userSettings', 'pixelBuddyTheme', 'pixelBuddyThemeUpdatedAt'], function(result: {
      userSettings?: { pixelBuddyTheme?: string };
      pixelBuddyTheme?: string;
      pixelBuddyThemeUpdatedAt?: number;
    }) {
      if (!buddy || !isExtensionValid()) return;

      const storedTheme = result.pixelBuddyTheme || (result.userSettings && result.userSettings.pixelBuddyTheme);
      const updateTime = result.pixelBuddyThemeUpdatedAt || 0;

      // 如果有新的更新时间且比上次检查的晚，刷新主题
      if (updateTime > lastThemeCheck) {
        lastThemeCheck = updateTime;
        const theme = normalizeTheme(storedTheme);
        console.log('[Pixel Buddy] Polling detected theme change:', theme);
        applyTheme(theme);
      }
    });
  }, 2000);
}

/**
 * 点击处理 - 根据用户设置打开侧边栏或新标签页
 */
async function handleClick(e: MouseEvent | TouchEvent) {
  if (isDragging) return;

  e.stopPropagation();
  e.preventDefault();

  console.log('[Pixel Buddy] Clicked');

  // 播放点击动画
  if (buddy) {
    buddy.classList.remove('idle');
    buddy.style.animation = 'wiggle 0.3s ease-in-out';
    setTimeout(() => {
      if (buddy) {
        buddy.style.animation = '';
        buddy.classList.add('idle');
      }
    }, 300);
  }

  // 检查扩展上下文是否有效
  if (!isExtensionValid()) {
    console.warn('[Pixel Buddy] Extension context invalidated');
    return;
  }

  // 获取用户设置的打开方式
  try {
    const result = await chrome.storage.local.get(['userSettings']);
    const openMode = result.userSettings?.openMode || 'sidebar';
    
    console.log('[Pixel Buddy] Open mode:', openMode);

    if (openMode === 'tab') {
      // 用户选择新标签页模式 - 通过 background script 打开
      console.log('[Pixel Buddy] Opening in new tab (user preference)');
      chrome.runtime.sendMessage({ type: 'OPEN_IN_TAB' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Pixel Buddy] Failed to open in tab:', chrome.runtime.lastError);
        } else if (response?.success) {
          console.log('[Pixel Buddy] Opened in new tab successfully');
        }
      });
      return;
    }

    // 侧边栏模式：尝试通过 background script 打开
    console.log('[Pixel Buddy] Requesting side panel open...');
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Pixel Buddy] Failed to send message:', chrome.runtime.lastError);
        console.log('[Pixel Buddy] Falling back to new tab...');
        // 回退到新标签页
        chrome.runtime.sendMessage({ type: 'OPEN_IN_TAB' });
        return;
      }

      if (response?.success) {
        console.log('[Pixel Buddy] Side panel opened successfully');
        return;
      }

      // 如果 background 打开失败，尝试在新标签页打开
      console.log('[Pixel Buddy] Background failed to open side panel:', response?.error);
      console.log('[Pixel Buddy] Opening in new tab as fallback...');
      chrome.runtime.sendMessage({ type: 'OPEN_IN_TAB' });
    });
  } catch (error) {
    console.error('[Pixel Buddy] Error opening sidebar:', error);
    // 尝试通过 background 打开新标签页
    chrome.runtime.sendMessage({ type: 'OPEN_IN_TAB' });
  }
}

/**
 * 在新标签页打开侧边栏（通过 background script）
 * @deprecated 使用 chrome.runtime.sendMessage({ type: 'OPEN_IN_TAB' }) 代替
 */
function openSidebarInNewTab() {
  if (!isExtensionValid()) {
    console.warn('[Pixel Buddy] Extension context invalidated');
    return;
  }
  // 通过 background script 打开新标签页
  chrome.runtime.sendMessage({ type: 'OPEN_IN_TAB' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Pixel Buddy] Failed to open in tab:', chrome.runtime.lastError);
    }
  });
}

/**
 * 拖拽开始
 */
function dragStart(e: MouseEvent) {
  if (e.button !== 0) return; // 只响应左键

  e.preventDefault();

  isDragging = false; // 先设为false，移动后再设为true

  // 如果元素已经有left/top，使用当前位置；否则使用初始位置
  const rect = buddy?.getBoundingClientRect();
  if (rect) {
    currentX = rect.left;
    currentY = rect.top;
  }

  initialX = e.clientX - currentX;
  initialY = e.clientY - currentY;

  if (buddy) {
    buddy.classList.remove('idle');
  }
}

/**
 * 拖拽中
 */
function drag(e: MouseEvent) {
  if (initialX === 0 && initialY === 0) return;

  const deltaX = Math.abs(e.clientX - initialX - currentX);
  const deltaY = Math.abs(e.clientY - initialY - currentY);

  // 移动超过3px才认为是拖拽（更灵敏）
  if (deltaX > 3 || deltaY > 3) {
    isDragging = true;
  }

  if (!isDragging || !buddy) return;

  e.preventDefault();
  e.stopPropagation();

  currentX = e.clientX - initialX;
  currentY = e.clientY - initialY;

  // 限制在视口内，留出边距
  const margin = 10; // 边距，避免完全贴边
  const maxX = window.innerWidth - 64 - margin;
  const maxY = window.innerHeight - 64 - margin;

  currentX = Math.max(margin, Math.min(currentX, maxX));
  currentY = Math.max(margin, Math.min(currentY, maxY));

  // 使用transform提高性能
  buddy.style.left = currentX + 'px';
  buddy.style.top = currentY + 'px';
  buddy.style.right = 'auto';
  buddy.style.bottom = 'auto';
  buddy.classList.add('dragging');
}

/**
 * 拖拽结束
 */
function dragEnd() {
  initialX = 0;
  initialY = 0;

  if (buddy) {
    buddy.classList.remove('dragging');

    // 延迟恢复idle状态
    setTimeout(() => {
      if (!isDragging && buddy) {
        buddy.classList.add('idle');
      }
      isDragging = false;
    }, 100);
  }
}

/**
 * 触摸开始
 */
function touchStart(e: TouchEvent) {
  if (!e.touches.length) return;
  e.preventDefault();

  isDragging = false;
  const touch = e.touches[0];

  // 获取当前位置
  const rect = buddy?.getBoundingClientRect();
  if (rect) {
    currentX = rect.left;
    currentY = rect.top;
  }

  initialX = touch.clientX - currentX;
  initialY = touch.clientY - currentY;

  if (buddy) {
    buddy.classList.remove('idle');
  }
}

/**
 * 触摸移动
 */
function touchMove(e: TouchEvent) {
  if (!e.touches.length || (initialX === 0 && initialY === 0) || !buddy) return;

  const touch = e.touches[0];
  const deltaX = Math.abs(touch.clientX - initialX - currentX);
  const deltaY = Math.abs(touch.clientY - initialY - currentY);

  // 移动超过3px才认为是拖拽（与鼠标一致）
  if (deltaX > 3 || deltaY > 3) {
    isDragging = true;
    e.preventDefault();
    e.stopPropagation();
  }

  if (!isDragging) return;

  currentX = touch.clientX - initialX;
  currentY = touch.clientY - initialY;

  // 限制在视口内，留出边距
  const margin = 10;
  const maxX = window.innerWidth - 64 - margin;
  const maxY = window.innerHeight - 64 - margin;

  currentX = Math.max(margin, Math.min(currentX, maxX));
  currentY = Math.max(margin, Math.min(currentY, maxY));

  buddy.style.left = currentX + 'px';
  buddy.style.top = currentY + 'px';
  buddy.style.right = 'auto';
  buddy.style.bottom = 'auto';
  buddy.classList.add('dragging');
}

/**
 * 触摸结束
 */
function touchEnd() {
  dragEnd();
}

/**
 * 窗口调整大小处理
 */
function handleResize() {
  if (!buddy) return;

  // 如果元素使用了left/top定位，需要调整以确保不超出边界
  const rect = buddy.getBoundingClientRect();

  const margin = 10;
  const maxX = window.innerWidth - 64 - margin;
  const maxY = window.innerHeight - 64 - margin;

  // 只有当元素超出边界时才调整
  if (rect.left > maxX) {
    currentX = maxX;
    buddy.style.left = currentX + 'px';
  }
  if (rect.top > maxY) {
    currentY = maxY;
    buddy.style.top = currentY + 'px';
  }
}

/**
 * 初始化函数 - 确保DOM准备好后再创建
 */
function initPixelBuddy() {
  console.log('[Pixel Buddy] Script loaded');
  console.log('[Pixel Buddy] Current page:', window.location.href);
  console.log('[Pixel Buddy] Document readyState:', document.readyState);

  // 检查是否在特殊页面（Chrome内部页面）
  if (window.location.protocol === 'chrome:' ||
      window.location.protocol === 'chrome-extension:' ||
      window.location.protocol === 'about:') {
    console.log('[Pixel Buddy] Chrome internal page detected, skipping injection');
    return;
  }

  if (document.readyState === 'loading') {
    // DOM还在加载中，等待DOMContentLoaded
    console.log('[Pixel Buddy] Waiting for DOM to be ready...');
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Pixel Buddy] DOMContentLoaded triggered');
      createPixelBuddy();
    });
  } else {
    // DOM已准备好，立即创建
    console.log('[Pixel Buddy] DOM ready, creating immediately');
    createPixelBuddy();
  }
}

// 初始化
initPixelBuddy();

console.log('[Pixel Buddy] Initialization complete');

})(); // IIFE结束
