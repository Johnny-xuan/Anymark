/**
 * Docs Component - 产品文档 & 隐私政策
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Zap, Plug, Keyboard, Github, Menu, X, Twitter, Sun, Moon, Home } from 'lucide-react';
import './Docs.css';

// 导航结构定义
interface NavItem {
  id: string;
  labelKey: string;
}

interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

const NAV_STRUCTURE: NavGroup[] = [
  {
    titleKey: 'docs.nav.overview',
    items: [
      { id: 'getting-started', labelKey: 'docs.nav.gettingStarted' },
      { id: 'installation', labelKey: 'docs.nav.installation' },
    ],
  },
  {
    titleKey: 'docs.nav.features',
    items: [
      { id: 'ai-agent', labelKey: 'docs.nav.aiAgent' },
      { id: 'smart-save', labelKey: 'docs.nav.smartSave' },
      { id: 'multi-provider', labelKey: 'docs.nav.multiProvider' },
      { id: 'pixel-buddies', labelKey: 'docs.nav.pixelBuddies' },
      { id: 'keyboard-shortcuts', labelKey: 'docs.nav.keyboardShortcuts' },
      { id: 'chrome-sync', labelKey: 'docs.nav.chromeSync' },
    ],
  },
  {
    titleKey: 'docs.nav.support',
    items: [
      { id: 'faq', labelKey: 'docs.nav.faq' },
      { id: 'privacy-policy', labelKey: 'docs.nav.privacyPolicy' },
    ],
  },
];

const Docs: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [activeSection, setActiveSection] = useState('getting-started');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('docs-theme') as 'dark' | 'light') || 'dark';
    } catch { return 'dark'; }
  });
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('docs-theme', theme); } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // IntersectionObserver for active section tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-56px 0px -70% 0px', threshold: 0 }
    );

    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Handle hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          setActiveSection(hash);
        }
      }, 100);
    }
  }, []);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      window.history.replaceState(null, '', `#${id}`);
      setActiveSection(id);
      setSidebarOpen(false);
    }
  }, []);

  const registerRef = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
  }, []);

  return (
    <div className="docs-wrapper">
      {/* Header */}
      <header className="docs-header">
        <div className="docs-header-left">
          <button className="docs-menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <img src="./icon-128.png" alt="AnyMark" className="docs-header-logo" />
          <span className="docs-header-title">AnyMark Docs</span>
          <span className="docs-header-badge">v1.0</span>
          <a href="./onboarding.html" className="docs-home-link" title="Home"><Home size={14} /> Home</a>
        </div>
        <div className="docs-header-right">
          <select className="docs-lang-select" value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
            <option value="ja">日本語</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
          </select>
          <button className="docs-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <a href="https://x.com/JohnXuann" className="docs-header-social" target="_blank" rel="noopener noreferrer" title="X / Twitter"><Twitter size={15} /></a>
          <a href="https://github.com/Johnny-xuan/Anymark" className="docs-github-link" target="_blank" rel="noopener noreferrer"><Github size={15} /> GitHub</a>
        </div>
      </header>

      <div className="docs-layout">
        {/* Sidebar */}
        <nav className={`docs-sidebar ${sidebarOpen ? 'open' : ''}`}>
          {NAV_STRUCTURE.map((group) => (
            <div key={group.titleKey} className="nav-section">
              <div className="nav-section-title">{t(group.titleKey)}</div>
              {group.items.map((item) => (
                <a
                  key={item.id}
                  className={`nav-link ${activeSection === item.id ? 'active' : ''}`}
                  onClick={() => scrollTo(item.id)}
                >
                  {t(item.labelKey)}
                </a>
              ))}
            </div>
          ))}
        </nav>

        {/* Content */}
        <main className="docs-content">

          {/* Getting Started */}
          <section id="getting-started" className="docs-section" ref={registerRef('getting-started')}>
            <h2>{t('docs.gettingStarted.title')}</h2>
            <div className="docs-section-divider" />
            <p>{t('docs.gettingStarted.intro')}</p>

            <div className="docs-feature-grid">
              <div className="docs-feature-card">
                <div className="docs-feature-icon"><Bot size={22} /></div>
                <div className="docs-feature-name">{t('docs.gettingStarted.feature1.title')}</div>
                <div className="docs-feature-desc">{t('docs.gettingStarted.feature1.desc')}</div>
              </div>
              <div className="docs-feature-card">
                <div className="docs-feature-icon"><Zap size={22} /></div>
                <div className="docs-feature-name">{t('docs.gettingStarted.feature2.title')}</div>
                <div className="docs-feature-desc">{t('docs.gettingStarted.feature2.desc')}</div>
              </div>
              <div className="docs-feature-card">
                <div className="docs-feature-icon"><Plug size={22} /></div>
                <div className="docs-feature-name">{t('docs.gettingStarted.feature3.title')}</div>
                <div className="docs-feature-desc">{t('docs.gettingStarted.feature3.desc')}</div>
              </div>
              <div className="docs-feature-card">
                <div className="docs-feature-icon"><Keyboard size={22} /></div>
                <div className="docs-feature-name">{t('docs.gettingStarted.feature4.title')}</div>
                <div className="docs-feature-desc">{t('docs.gettingStarted.feature4.desc')}</div>
              </div>
            </div>
          </section>

          {/* Installation */}
          <section id="installation" className="docs-section" ref={registerRef('installation')}>
            <h2>{t('docs.installation.title')}</h2>
            <div className="docs-section-divider" />

            <h3>{t('docs.installation.storeTitle')}</h3>
            <div className="docs-steps">
              <div className="docs-step">
                <div className="docs-step-num">1</div>
                <div className="docs-step-text">{t('docs.installation.step1')}</div>
              </div>
              <div className="docs-step">
                <div className="docs-step-num">2</div>
                <div className="docs-step-text">{t('docs.installation.step2')}</div>
              </div>
              <div className="docs-step">
                <div className="docs-step-num">3</div>
                <div className="docs-step-text">{t('docs.installation.step3')}</div>
              </div>
            </div>

            <h3>{t('docs.installation.manualTitle')}</h3>
            <div className="docs-steps">
              <div className="docs-step">
                <div className="docs-step-num">1</div>
                <div className="docs-step-text">{t('docs.installation.manual1')}</div>
              </div>
              <div className="docs-step">
                <div className="docs-step-num">2</div>
                <div className="docs-step-text">{t('docs.installation.manual2')}</div>
              </div>
              <div className="docs-step">
                <div className="docs-step-num">3</div>
                <div className="docs-step-text">{t('docs.installation.manual3')}</div>
              </div>
              <div className="docs-step">
                <div className="docs-step-num">4</div>
                <div className="docs-step-text">{t('docs.installation.manual4')}</div>
              </div>
            </div>
          </section>

          {/* AI Agent */}
          <section id="ai-agent" className="docs-section" ref={registerRef('ai-agent')}>
            <h2>{t('docs.aiAgent.title')}</h2>
            <div className="docs-section-divider" />
            <p>{t('docs.aiAgent.intro')}</p>

            <h3>{t('docs.aiAgent.commandsTitle')}</h3>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t('docs.aiAgent.colCommand')}</th>
                  <th>{t('docs.aiAgent.colDesc')}</th>
                  <th>{t('docs.aiAgent.colExample')}</th>
                </tr>
              </thead>
              <tbody>
                {['find', 'ls', 'tree', 'cd', 'stats', 'starred', 'help'].map((cmd) => (
                  <tr key={cmd}>
                    <td><code>/{cmd}</code></td>
                    <td>{t(`docs.aiAgent.cmd.${cmd}.desc`)}</td>
                    <td>{t(`docs.aiAgent.cmd.${cmd}.example`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>{t('docs.aiAgent.nlTitle')}</h3>
            <p>{t('docs.aiAgent.nlDesc')}</p>

            <h3>{t('docs.aiAgent.toolsTitle')}</h3>
            <p>{t('docs.aiAgent.toolsDesc')}</p>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t('docs.aiAgent.colTool')}</th>
                  <th>{t('docs.aiAgent.colPurpose')}</th>
                </tr>
              </thead>
              <tbody>
                {['ls', 'cd', 'find', 'tree', 'mv', 'rm', 'mkdir', 'star', 'cat', 'open', 'cp', 'stat', 'wc'].map((tool) => (
                  <tr key={tool}>
                    <td><code>{tool}</code></td>
                    <td>{t(`docs.aiAgent.tool.${tool}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Smart Save */}
          <section id="smart-save" className="docs-section" ref={registerRef('smart-save')}>
            <h2>{t('docs.smartSave.title')}</h2>
            <div className="docs-section-divider" />
            <p>{t('docs.smartSave.intro')}</p>

            <h3>{t('docs.smartSave.howTitle')}</h3>
            <div className="docs-steps">
              <div className="docs-step">
                <div className="docs-step-num">1</div>
                <div className="docs-step-text">{t('docs.smartSave.step1')}</div>
              </div>
              <div className="docs-step">
                <div className="docs-step-num">2</div>
                <div className="docs-step-text">{t('docs.smartSave.step2')}</div>
              </div>
              <div className="docs-step">
                <div className="docs-step-num">3</div>
                <div className="docs-step-text">{t('docs.smartSave.step3')}</div>
              </div>
            </div>
          </section>

          {/* Multi-Provider */}
          <section id="multi-provider" className="docs-section" ref={registerRef('multi-provider')}>
            <h2>{t('docs.multiProvider.title')}</h2>
            <div className="docs-section-divider" />
            <p>{t('docs.multiProvider.intro')}</p>

            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t('docs.multiProvider.colProvider')}</th>
                  <th>{t('docs.multiProvider.colModels')}</th>
                  <th>{t('docs.multiProvider.colType')}</th>
                </tr>
              </thead>
              <tbody>
                {['openai', 'gemini', 'deepseek', 'ollama'].map((p) => (
                  <tr key={p}>
                    <td><strong>{t(`docs.multiProvider.provider.${p}.name`)}</strong></td>
                    <td>{t(`docs.multiProvider.provider.${p}.models`)}</td>
                    <td>{t(`docs.multiProvider.provider.${p}.type`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>{t('docs.multiProvider.setupTitle')}</h3>
            <p>{t('docs.multiProvider.setupDesc')}</p>
          </section>

          {/* Pixel Buddies */}
          <section id="pixel-buddies" className="docs-section" ref={registerRef('pixel-buddies')}>
            <h2>{t('docs.pixelBuddies.title')}</h2>
            <div className="docs-section-divider" />
            <p>{t('docs.pixelBuddies.intro')}</p>

            <div className="docs-feature-grid">
              {['koda', 'vex', 'sprout', 'zing', 'null'].map((buddy) => (
                <div key={buddy} className="docs-feature-card">
                  <div className="docs-feature-name">{t(`docs.pixelBuddies.${buddy}.name`)}</div>
                  <div className="docs-feature-desc">{t(`docs.pixelBuddies.${buddy}.desc`)}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section id="keyboard-shortcuts" className="docs-section" ref={registerRef('keyboard-shortcuts')}>
            <h2>{t('docs.shortcuts.title')}</h2>
            <div className="docs-section-divider" />
            <p>{t('docs.shortcuts.intro')}</p>

            <h3>{t('docs.shortcuts.navTitle')}</h3>
            <table className="docs-table">
              <thead>
                <tr><th>{t('docs.shortcuts.colKey')}</th><th>{t('docs.shortcuts.colAction')}</th></tr>
              </thead>
              <tbody>
                {['updown', 'jk', 'enter', 'gG', 'pgupdown'].map((k) => (
                  <tr key={k}>
                    <td><code>{t(`docs.shortcuts.nav.${k}.key`)}</code></td>
                    <td>{t(`docs.shortcuts.nav.${k}.action`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>{t('docs.shortcuts.actTitle')}</h3>
            <table className="docs-table">
              <thead>
                <tr><th>{t('docs.shortcuts.colKey')}</th><th>{t('docs.shortcuts.colAction')}</th></tr>
              </thead>
              <tbody>
                {['s', 'd', 'y', 'e', 'slash'].map((k) => (
                  <tr key={k}>
                    <td><code>{t(`docs.shortcuts.act.${k}.key`)}</code></td>
                    <td>{t(`docs.shortcuts.act.${k}.action`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>{t('docs.shortcuts.globalTitle')}</h3>
            <table className="docs-table">
              <thead>
                <tr><th>{t('docs.shortcuts.colKey')}</th><th>{t('docs.shortcuts.colAction')}</th></tr>
              </thead>
              <tbody>
                {['cmdJ', 'cmdK', 'h'].map((k) => (
                  <tr key={k}>
                    <td><code>{t(`docs.shortcuts.global.${k}.key`)}</code></td>
                    <td>{t(`docs.shortcuts.global.${k}.action`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Chrome Sync */}
          <section id="chrome-sync" className="docs-section" ref={registerRef('chrome-sync')}>
            <h2>{t('docs.chromeSync.title')}</h2>
            <div className="docs-section-divider" />
            <p>{t('docs.chromeSync.intro')}</p>

            <h3>{t('docs.chromeSync.bidirectionalTitle')}</h3>
            <p>{t('docs.chromeSync.bidirectionalDesc')}</p>

            <h3>{t('docs.chromeSync.cloudTitle')}</h3>
            <p>{t('docs.chromeSync.cloudDesc')}</p>
          </section>

          {/* FAQ */}
          <section id="faq" className="docs-section" ref={registerRef('faq')}>
            <h2>{t('docs.faq.title')}</h2>
            <div className="docs-section-divider" />

            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="docs-faq-item">
                <div className="docs-faq-q">{t(`docs.faq.q${n}.q`)}</div>
                <div className="docs-faq-a">{t(`docs.faq.q${n}.a`)}</div>
              </div>
            ))}
          </section>

          {/* Privacy Policy */}
          <section id="privacy-policy" className="docs-section" ref={registerRef('privacy-policy')}>
            <h2>{t('docs.privacy.title')}</h2>
            <div className="docs-section-divider" />
            <p><em>{t('docs.privacy.effectiveDate')}</em></p>
            <p>{t('docs.privacy.intro')}</p>

            <h3>{t('docs.privacy.dataCollection.title')}</h3>
            <p>{t('docs.privacy.dataCollection.desc')}</p>

            <h3>{t('docs.privacy.permissions.title')}</h3>
            <p>{t('docs.privacy.permissions.intro')}</p>
            <div>
              {['bookmarks', 'storage', 'tabs', 'activeTab', 'sidePanel', 'notifications', 'scripting', 'contextMenus', 'alarms', 'history', 'favicon'].map((perm) => (
                <div key={perm} className="docs-permission-item">
                  <div className="docs-permission-name"><code>{perm}</code></div>
                  <div className="docs-permission-reason">{t(`docs.privacy.permissions.${perm}`)}</div>
                </div>
              ))}
            </div>

            <h3>{t('docs.privacy.hostPermissions.title')}</h3>
            <p>{t('docs.privacy.hostPermissions.allUrls')}</p>
            <p>{t('docs.privacy.hostPermissions.apiEndpoints')}</p>

            <h3>{t('docs.privacy.dataHandling.title')}</h3>
            <ul>
              <li>{t('docs.privacy.dataHandling.localStorage')}</li>
              <li>{t('docs.privacy.dataHandling.apiKeys')}</li>
              <li>{t('docs.privacy.dataHandling.noTracking')}</li>
              <li>{t('docs.privacy.dataHandling.aiRequests')}</li>
              <li>{t('docs.privacy.dataHandling.chromeSync')}</li>
              <li>{t('docs.privacy.dataHandling.openSource')}</li>
            </ul>

            <h3>{t('docs.privacy.thirdParty.title')}</h3>
            <p>{t('docs.privacy.thirdParty.desc')}</p>

            <h3>{t('docs.privacy.rights.title')}</h3>
            <p>{t('docs.privacy.rights.desc')}</p>

            <h3>{t('docs.privacy.contact.title')}</h3>
            <p>{t('docs.privacy.contact.desc')}</p>
          </section>

          {/* Footer */}
          <footer className="docs-footer">
            <p>AnyMark — {t('docs.footer.tagline')}</p>
            <p>{t('docs.footer.license')}</p>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default Docs;
