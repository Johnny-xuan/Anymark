/**
 * Onboarding Component - v1.0 Launch
 * 现代简洁设计，突出 AI Agent 和 Pixel Buddy 角色
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../i18n/config';
import './Onboarding.css';

// 主题类型和颜色配置 - 与项目保持一致
type PixelBuddyTheme = 'classic' | 'cyber' | 'grow' | 'flare' | 'noir';

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

// Pixel Buddy SVG 组件 - 与项目中 PixelBuddyIcon 保持一致
interface BuddySVGProps {
  theme: PixelBuddyTheme;
  size?: number;
  animated?: boolean;
}

const BuddySVG: React.FC<BuddySVGProps> = ({ theme, size = 64, animated = true }) => {
  const colors = THEME_COLORS[theme];
  const showLeafs = theme === 'grow';
  const isNoir = theme === 'noir';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={`buddy-svg ${animated ? 'animated' : ''} theme-${theme}`}
    >
      <style>
        {`
          @keyframes leaf-sway {
            0%, 100% { transform: rotate(-5deg); }
            50% { transform: rotate(5deg); }
          }
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
        <rect x="6" y="9" width="20" height="19" rx="2" fill={colors.body} />
        {/* 书本高光 */}
        <rect x="6" y="9" width="4" height="19" rx="2" fill={colors.highlight} opacity="0.4" />
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
      <g className="buddy-eyes">
        {theme === 'cyber' ? (
          <>
            {/* Vex: 左眼正常，右眼是义眼/故障方块 */}
            <circle cx="12" cy="17" r="1.5" fill={colors.eye} />
            <rect x="16.5" y="15.5" width="3" height="3" fill="#00ff41" opacity="0.9" />
            <circle cx="12.5" cy="16.5" r="0.5" fill="white" />
          </>
        ) : theme === 'noir' ? (
          <>
            {/* Null: 像素墨镜 (Cool Sunglasses) */}
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
        // Null - 佩戴墨镜，极简的酷嘴
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
    </svg>
  );
};

// 互动 Agent 演示组件 - 斜杠命令菜单（匹配产品实际交互）
interface SlashCommand {
  command: string;
  icon: string;
  label: string;
  description: string;
  demoUser: string;
  demoAssistant: string;
}

const AgentDemo: React.FC = () => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // 斜杠命令 - 与产品中 SlashToolsMenu 的命令对应
  const slashCommands: SlashCommand[] = [
    {
      command: '/find',
      icon: '🔍',
      label: t('onboarding.agentDemo.cmd.find.label', 'Find'),
      description: t('onboarding.agentDemo.cmd.find.desc', '搜索书签和文件夹'),
      demoUser: t('onboarding.agentDemo.demo1.user', 'find React 学习资料'),
      demoAssistant: t('onboarding.agentDemo.demo1.assistant', '找到 8 个 React 相关书签：React 官方文档、React Hooks 教程、Redux 入门... 需要我打开哪个？'),
    },
    {
      command: '/ls',
      icon: '📁',
      label: t('onboarding.agentDemo.cmd.ls.label', 'List'),
      description: t('onboarding.agentDemo.cmd.ls.desc', '查看当前目录内容'),
      demoUser: t('onboarding.agentDemo.demo2.user', 'ls'),
      demoAssistant: t('onboarding.agentDemo.demo2.assistant', '📁 前端 (12)\n📁 后端 (8)\n📁 DevOps (5)\n📁 设计 (3)\n⭐ React Docs\n⭐ GitHub'),
    },
    {
      command: '/tree',
      icon: '🌳',
      label: t('onboarding.agentDemo.cmd.tree.label', 'Tree'),
      description: t('onboarding.agentDemo.cmd.tree.desc', '显示目录树结构'),
      demoUser: t('onboarding.agentDemo.demo3.user', 'tree'),
      demoAssistant: t('onboarding.agentDemo.demo3.assistant', '📂 书签\n├── 📁 前端 (12)\n│   ├── React Docs\n│   └── Vue Guide\n├── 📁 后端 (8)\n└── 📁 DevOps (5)'),
    },
    {
      command: '/stats',
      icon: '📊',
      label: t('onboarding.agentDemo.cmd.stats.label', 'Stats'),
      description: t('onboarding.agentDemo.cmd.stats.desc', '书签统计数据'),
      demoUser: t('onboarding.agentDemo.demo4.user', 'stats'),
      demoAssistant: t('onboarding.agentDemo.demo4.assistant', '📊 总计：128 个书签，15 个文件夹\n⭐ 星标：12 | 🏷️ 已标签：89\n🔥 最常访问：GitHub、Stack Overflow'),
    },
  ];

  // 根据输入过滤命令
  const filteredCommands = slashCommands.filter(cmd => {
    if (!inputValue || inputValue === '/') return true;
    const searchTerm = inputValue.toLowerCase().replace('/', '');
    return cmd.command.toLowerCase().includes(searchTerm) || cmd.label.toLowerCase().includes(searchTerm);
  });

  // 根据输入显示/隐藏斜杠菜单
  useEffect(() => {
    if (inputValue.startsWith('/') && !isTyping) {
      setShowSlashMenu(true);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, [inputValue, isTyping]);

  const simulateChat = async (userMsg: string, assistantMsg: string) => {
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setShowSlashMenu(false);
    setIsTyping(true);
    await new Promise(resolve => setTimeout(resolve, 1200));
    setMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);
    setIsTyping(false);
  };

  const handleSelectCommand = (cmd: SlashCommand) => {
    if (isTyping) return;
    setInputValue('');
    simulateChat(cmd.demoUser, cmd.demoAssistant);
  };

  const handleSend = () => {
    if (!inputValue.trim() || isTyping) return;
    if (showSlashMenu && filteredCommands.length > 0) {
      handleSelectCommand(filteredCommands[selectedCommandIndex]);
      return;
    }
    const userInput = inputValue;
    setInputValue('');
    simulateChat(userInput, slashCommands[0].demoAssistant);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSelectCommand(filteredCommands[selectedCommandIndex]);
      } else if (e.key === 'Escape') {
        setShowSlashMenu(false);
      }
    } else if (e.key === 'Enter') {
      handleSend();
    }
  };

  // 点击输入框时自动填入 /
  const handleInputFocus = () => {
    if (!inputValue && !isTyping && messages.length === 0) {
      setInputValue('/');
    }
  };

  return (
    <div className="agent-demo-container">
      {/* 左侧功能列表 */}
      <div className="agent-features-list">
        <div className="feature-item">
          <span className="feature-icon">🔍</span>
          <div className="feature-text">
            <h4>{t('onboarding.agent.search.title')}</h4>
            <p>{t('onboarding.agent.search.desc')}</p>
          </div>
        </div>
        <div className="feature-item">
          <span className="feature-icon">📂</span>
          <div className="feature-text">
            <h4>{t('onboarding.agent.discover.title')}</h4>
            <p>{t('onboarding.agent.discover.desc')}</p>
          </div>
        </div>
        <div className="feature-item">
          <span className="feature-icon">📊</span>
          <div className="feature-text">
            <h4>{t('onboarding.agent.trending.title')}</h4>
            <p>{t('onboarding.agent.trending.desc')}</p>
          </div>
        </div>
        <div className="feature-item">
          <span className="feature-icon">🧠</span>
          <div className="feature-text">
            <h4>{t('onboarding.agent.organize.title')}</h4>
            <p>{t('onboarding.agent.organize.desc')}</p>
          </div>
        </div>
        <div className="feature-item">
          <span className="feature-icon">💬</span>
          <div className="feature-text">
            <h4>{t('onboarding.agent.chat.title')}</h4>
            <p>{t('onboarding.agent.chat.desc')}</p>
          </div>
        </div>
      </div>

      {/* 右侧聊天窗口 */}
      <div className="agent-chat-window">
        <div className="chat-window-header">
          <div className="chat-window-title">
            <BuddySVG theme="classic" size={24} animated />
            <span>{t('onboarding.agentDemo.agentName', 'AnyMark Agent')}</span>
          </div>
          <div className="chat-window-status">
            <span className="status-dot"></span>
            {t('onboarding.agentDemo.online', 'Online')}
          </div>
        </div>

        <div className="chat-window-messages">
          {messages.length === 0 ? (
            <div className="chat-welcome-demo">
              <BuddySVG theme="classic" size={48} animated />
              <p>{t('onboarding.agentDemo.welcome', '在下方输入框中输入 / 查看可用命令！')}</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`demo-message ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="message-avatar">
                    <BuddySVG theme="classic" size={20} animated={false} />
                  </div>
                )}
                <div className="message-content">{msg.content}</div>
              </div>
            ))
          )}
          {isTyping && (
            <div className="demo-message assistant">
              <div className="message-avatar">
                <BuddySVG theme="classic" size={20} animated={false} />
              </div>
              <div className="typing-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
        </div>

        {/* 斜杠命令菜单 + 输入框 */}
        <div className="chat-window-input-area">
          {showSlashMenu && filteredCommands.length > 0 && (
            <div className="slash-menu-demo">
              <div className="slash-menu-header">
                {t('onboarding.agentDemo.commands', '命令')}
                <span className="slash-menu-count">{filteredCommands.length}</span>
              </div>
              {filteredCommands.map((cmd, index) => (
                <div
                  key={cmd.command}
                  className={`slash-menu-item ${index === selectedCommandIndex ? 'selected' : ''}`}
                  onClick={() => handleSelectCommand(cmd)}
                  onMouseEnter={() => setSelectedCommandIndex(index)}
                >
                  <span className="slash-menu-icon">{cmd.icon}</span>
                  <div className="slash-menu-info">
                    <span className="slash-menu-command">{cmd.command}</span>
                    <span className="slash-menu-desc">{cmd.description}</span>
                  </div>
                  {index === selectedCommandIndex && (
                    <span className="slash-menu-indicator">↵</span>
                  )}
                </div>
              ))}
              <div className="slash-menu-footer">
                <kbd>↑</kbd><kbd>↓</kbd> {t('onboarding.agentDemo.navigate', '导航')}
                <kbd>Enter</kbd> {t('onboarding.agentDemo.select', '选择')}
              </div>
            </div>
          )}

          <div className="chat-window-input">
            <input
              type="text"
              placeholder={t('onboarding.agentDemo.placeholder', '输入 / 查看命令...')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              disabled={isTyping}
            />
            <button onClick={handleSend} disabled={!inputValue.trim() || isTyping}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Onboarding: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [currentSection, setCurrentSection] = useState(0);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const isAnimating = useRef(false);
  const touchStartY = useRef(0);
  const totalSections = 5;

  const finishOnboarding = () => {
    chrome.storage.local.set({ onboardingSeen: true }, () => {
      chrome.runtime.sendMessage({ type: 'TOGGLE_SIDEBAR' });
      window.close();
    });
  };

  const scrollToSection = useCallback((index: number) => {
    if (index < 0 || index >= totalSections || isAnimating.current) return;
    isAnimating.current = true;
    setCurrentSection(index);
    const section = sectionRefs.current[index];
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => { isAnimating.current = false; }, 1000);
  }, [totalSections]);

  useEffect(() => {
    let accumulatedDelta = 0;
    const threshold = 50;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isAnimating.current) return;
      accumulatedDelta += e.deltaY;
      if (Math.abs(accumulatedDelta) >= threshold) {
        if (accumulatedDelta > 0 && currentSection < totalSections - 1) {
          scrollToSection(currentSection + 1);
        } else if (accumulatedDelta < 0 && currentSection > 0) {
          scrollToSection(currentSection - 1);
        }
        accumulatedDelta = 0;
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [currentSection, scrollToSection, totalSections]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
    const handleTouchEnd = (e: TouchEvent) => {
      if (isAnimating.current) return;
      const diff = touchStartY.current - e.changedTouches[0].clientY;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && currentSection < totalSections - 1) scrollToSection(currentSection + 1);
        else if (diff < 0 && currentSection > 0) scrollToSection(currentSection - 1);
      }
    };
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [currentSection, scrollToSection, totalSections]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnimating.current) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') {
        e.preventDefault();
        scrollToSection(currentSection + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
        e.preventDefault();
        scrollToSection(currentSection - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSection, scrollToSection]);

  // Pixel Buddy 角色数据 - 使用项目中的主题名
  const buddies: Array<{
    theme: PixelBuddyTheme;
    nameKey: string;
  }> = [
      { theme: 'classic', nameKey: 'koda' },
      { theme: 'cyber', nameKey: 'vex' },
      { theme: 'grow', nameKey: 'sprout' },
      { theme: 'flare', nameKey: 'flare' },
      { theme: 'noir', nameKey: 'null' },
    ];

  return (
    <div className="onboarding-wrapper">
      {/* Top-left Logo */}
      <div className="top-logo">
        <img src="/icon-128.png" alt="AnyMark" className="top-logo-img" />
        <span className="top-logo-text">{t('onboarding.appName', 'AnyMark')}</span>
      </div>

      <div className="language-toggle-container">
        <a href="./docs.html" className="docs-link-top" title="Documentation">Docs</a>
        <select className="language-toggle" value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
          <option value="en">{t('onboarding.language.english', 'English')}</option>
          <option value="zh-CN">{t('onboarding.language.chinese', '简体中文')}</option>
          <option value="ja">{t('onboarding.language.japanese', '日本語')}</option>
          <option value="de">{t('onboarding.language.german', 'Deutsch')}</option>
          <option value="es">{t('onboarding.language.spanish', 'Español')}</option>
          <option value="fr">{t('onboarding.language.french', 'Français')}</option>
        </select>
      </div>

      {/* Hero Section */}
      <section className="onboarding-section hero-section" ref={(el) => { sectionRefs.current[0] = el; }}>
        <div className="section-content">
          <h1 className="hero-title">{t('onboarding.hero.title')}</h1>
          <p className="hero-subtitle">{t('onboarding.hero.subtitle')}</p>
          <p className="hero-tagline">{t('onboarding.hero.description')}</p>
          <div className="hero-cta">
            <button className="btn-primary" onClick={() => scrollToSection(1)}>
              {t('onboarding.hero.explore')}
            </button>
          </div>
          <div className="scroll-indicator">
            <span className="scroll-text">{t('onboarding.hero.scroll')}</span>
            <div className="scroll-arrow">↓</div>
          </div>
        </div>
      </section>

      {/* Pixel Buddy Section - 五个角色 */}
      <section className="onboarding-section buddies-section" ref={(el) => { sectionRefs.current[1] = el; }}>
        <div className="section-content">
          <h2 className="section-title">{t('onboarding.buddies.heading')}</h2>
          <p className="section-desc">{t('onboarding.buddies.subtitle')}</p>
          <div className="buddies-grid">
            {buddies.map((buddy, index) => (
              <div key={buddy.theme} className={`buddy-card buddy-${buddy.theme}`} style={{ animationDelay: `${index * 0.1}s` }}>
                <div className="buddy-avatar">
                  <BuddySVG theme={buddy.theme} size={64} animated />
                </div>
                <h3 className="buddy-name">{t(`onboarding.buddies.${buddy.nameKey}.name`)}</h3>
                <p className="buddy-role">{t(`onboarding.buddies.${buddy.nameKey}.role`)}</p>
                <p className="buddy-quote">"{t(`onboarding.buddies.${buddy.nameKey}.quote`)}"</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent Features - Interactive Demo */}
      <section className="onboarding-section features-section" ref={(el) => { sectionRefs.current[2] = el; }}>
        <div className="section-content">
          <h2 className="section-title">{t('onboarding.agent.heading')}</h2>
          <p className="section-desc">{t('onboarding.agent.subtitle')}</p>
          <AgentDemo />
        </div>
      </section>

      {/* Shortcuts Section */}
      <section className="onboarding-section shortcuts-section" ref={(el) => { sectionRefs.current[3] = el; }}>
        <div className="section-content">
          <h2 className="section-title">{t('onboarding.shortcuts.heading')}</h2>
          <p className="section-desc">{t('onboarding.shortcuts.subtitle')}</p>
          <div className="shortcuts-container">
            {/* 导航快捷键 */}
            <div className="shortcut-group">
              <h4>{t('onboarding.shortcuts.navigation')}</h4>
              <div className="shortcut-item">
                <kbd>↑</kbd><kbd>↓</kbd>
                <span>{t('onboarding.shortcuts.updown')}</span>
              </div>
              <div className="shortcut-item">
                <kbd>j</kbd><kbd>k</kbd>
                <span>{t('onboarding.shortcuts.vimNav')}</span>
              </div>
              <div className="shortcut-item">
                <kbd>Enter</kbd>
                <span>{t('onboarding.shortcuts.open')}</span>
              </div>
            </div>
            <div className="shortcut-group">
              <h4>{t('onboarding.shortcuts.actions')}</h4>
              <div className="shortcut-item">
                <kbd>s</kbd>
                <span>{t('onboarding.shortcuts.star')}</span>
              </div>
              <div className="shortcut-item">
                <kbd>d</kbd>
                <span>{t('onboarding.shortcuts.delete')}</span>
              </div>
            </div>
            <div className="shortcut-group">
              <h4>{t('onboarding.shortcuts.global')}</h4>
              <div className="shortcut-item">
                <kbd>H</kbd>
                <span>{t('onboarding.shortcuts.help')}</span>
              </div>
              <div className="shortcut-item">
                <kbd>Space</kbd>
                <span>{t('onboarding.shortcuts.preview')}</span>
              </div>
              <div className="shortcut-item">
                <kbd>Esc</kbd>
                <span>{t('onboarding.shortcuts.escape')}</span>
              </div>
            </div>
          </div>
          <p className="shortcuts-note">{t('onboarding.shortcuts.note')}</p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="onboarding-section cta-section" ref={(el) => { sectionRefs.current[4] = el; }}>
        <div className="section-content">
          <div className="cta-buddies">
            {buddies.map((buddy, index) => (
              <div key={buddy.theme} className="cta-buddy-wrapper" style={{ animationDelay: `${index * 0.1}s` }}>
                <BuddySVG theme={buddy.theme} size={56} animated />
              </div>
            ))}
          </div>
          <h2 className="cta-title">{t('onboarding.cta.heading')}</h2>
          <p className="cta-desc">{t('onboarding.cta.text')}</p>
          <button className="btn-start" onClick={finishOnboarding}>
            {t('onboarding.cta.button')}
          </button>
          <p className="cta-hint">{t('onboarding.cta.hint')}</p>
        </div>
      </section>

      {/* Navigation Dots */}
      <div className="dots-navigation">
        {Array.from({ length: totalSections }).map((_, i) => (
          <button
            key={i}
            className={`dot ${currentSection === i ? 'active' : ''}`}
            onClick={() => scrollToSection(i)}
            aria-label={`Go to section ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default Onboarding;
