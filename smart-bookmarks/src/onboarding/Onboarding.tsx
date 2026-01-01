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

      {/* 星星装饰 - classic/cyber/flare/noir */}
      {!showLeafs && (
        <g className="buddy-stars">
          <circle cx="5" cy="8" r="1" fill={colors.stars} opacity="0.8" />
          <circle cx="25" cy="8" r="0.8" fill={colors.stars} opacity="0.6" />
        </g>
      )}

      {/* 叶子装饰 - grow */}
      {showLeafs && (
        <g className="buddy-leafs">
          <path d="M4 8 C3 9 3 11 5 11.5 C7 11 7 8 4 8 Z" fill={colors.leaf} />
          <path d="M26 8 C25 9 25 11 27 11.5 C29 11 29 8 26 8 Z" fill={colors.leaf} />
        </g>
      )}
    </svg>
  );
};

// 互动 Agent 演示组件
const AgentDemo: React.FC = () => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');

  // 预设的演示对话 - 与实际 QuickActionBar 的 5 个功能对应
  const demoConversations = [
    {
      id: 'search',
      icon: '🔍',
      label: t('onboarding.agentDemo.action1', '搜书签'),
      user: t('onboarding.agentDemo.demo1.user', '找我的 React 学习资料'),
      assistant: t('onboarding.agentDemo.demo1.assistant', '找到 8 个 React 相关书签：React 官方文档、React Hooks 教程、Redux 入门... 需要我打开哪个？'),
    },
    {
      id: 'discover',
      icon: '🌐',
      label: t('onboarding.agentDemo.action2', '找资源'),
      user: t('onboarding.agentDemo.demo2.user', '推荐一些 Python 学习资源'),
      assistant: t('onboarding.agentDemo.demo2.assistant', '为你推荐：Real Python、Python 官方教程、Automate the Boring Stuff... 要我帮你收藏吗？'),
    },
    {
      id: 'trending',
      icon: '🔥',
      label: t('onboarding.agentDemo.action3', '看热门'),
      user: t('onboarding.agentDemo.demo3.user', '最近有什么热门项目'),
      assistant: t('onboarding.agentDemo.demo3.assistant', '本周热门：shadcn/ui、langchain、ollama... 都是 AI 和开发工具相关的项目 🔥'),
    },
    {
      id: 'organize',
      icon: '✨',
      label: t('onboarding.agentDemo.action4', '整理'),
      user: t('onboarding.agentDemo.demo4.user', '帮我整理所有技术书签'),
      assistant: t('onboarding.agentDemo.demo4.assistant', '好的！我找到了 23 个技术相关书签，已按 Frontend、Backend、DevOps 分类整理完成 ✨'),
    },
    {
      id: 'chat',
      icon: '💬',
      label: t('onboarding.agentDemo.action5', '聊天'),
      user: t('onboarding.agentDemo.demo5.user', '你好呀'),
      assistant: t('onboarding.agentDemo.demo5.assistant', '你好！我是 AnyMark 的 AI 助手，有什么可以帮你的吗？😊'),
    },
  ];

  const simulateChat = async (userMsg: string, assistantMsg: string) => {
    // 添加用户消息
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsTyping(true);
    
    // 模拟打字延迟
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    // 添加助手回复
    setMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);
    setIsTyping(false);
  };

  const handleQuickAction = (index: number) => {
    if (isTyping) return;
    const demo = demoConversations[index];
    simulateChat(demo.user, demo.assistant);
  };

  const handleSend = () => {
    if (!inputValue.trim() || isTyping) return;
    const userInput = inputValue;
    setInputValue('');
    
    // 找一个匹配的演示回复
    const matchedDemo = demoConversations.find(d => 
      userInput.includes('整理') || userInput.includes('organize')
    ) || demoConversations[0];
    
    simulateChat(userInput, matchedDemo.assistant);
  };

  return (
    <div className="agent-demo-container">
      {/* 左侧功能列表 - 与右侧 5 个快捷按钮对应 */}
      <div className="agent-features-list">
        <div className="feature-item">
          <span className="feature-icon">🔍</span>
          <div className="feature-text">
            <h4>{t('onboarding.agent.search.title')}</h4>
            <p>{t('onboarding.agent.search.desc')}</p>
          </div>
        </div>
        <div className="feature-item">
          <span className="feature-icon">🌐</span>
          <div className="feature-text">
            <h4>{t('onboarding.agent.discover.title')}</h4>
            <p>{t('onboarding.agent.discover.desc')}</p>
          </div>
        </div>
        <div className="feature-item">
          <span className="feature-icon">🔥</span>
          <div className="feature-text">
            <h4>{t('onboarding.agent.trending.title')}</h4>
            <p>{t('onboarding.agent.trending.desc')}</p>
          </div>
        </div>
        <div className="feature-item">
          <span className="feature-icon">✨</span>
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
              <p>{t('onboarding.agentDemo.welcome', '👋 点击下方按钮试试看！')}</p>
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

        <div className="chat-window-actions">
          {demoConversations.map((demo, index) => (
            <button 
              key={demo.id}
              onClick={() => handleQuickAction(index)} 
              disabled={isTyping}
            >
              {demo.icon} {demo.label}
            </button>
          ))}
        </div>

        <div className="chat-window-input">
          <input 
            type="text" 
            placeholder={t('onboarding.agentDemo.placeholder', '试着输入你的问题...')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isTyping}
          />
          <button onClick={handleSend} disabled={!inputValue.trim() || isTyping}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
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
              <div className="shortcut-item">
                <kbd>y</kbd>
                <span>{t('onboarding.shortcuts.copy')}</span>
              </div>
            </div>
            <div className="shortcut-group">
              <h4>{t('onboarding.shortcuts.global')}</h4>
              <div className="shortcut-item">
                <kbd>⌘</kbd><kbd>J</kbd>
                <span>{t('onboarding.shortcuts.sidebar')}</span>
              </div>
              <div className="shortcut-item">
                <kbd>⌘</kbd><kbd>K</kbd>
                <span>{t('onboarding.shortcuts.save')}</span>
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
