/**
 * 侧边栏主界面组件 - 免费版
 */

import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { Settings as SettingsIcon, Maximize2, X, Sun, Moon, ArrowUp, ArrowDown, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SearchBar from './components/SearchBar/SearchBar';
import FilterTabs from './components/FilterTabs/FilterTabs';
import BookmarkList from './components/BookmarkList/BookmarkList';
import PreviewPanel from './components/PreviewPanel/PreviewPanel';
import ResizableDivider from './components/ResizableDivider/ResizableDivider';
import ToastContainer from '../components/Toast/ToastContainer';
import { useBookmarkStore } from './store/bookmarkStore';
import { showToast } from '../components/Toast/ToastContainer';
import { getMetadataService } from '../services/metadataService';
import PixelBuddyIcon from './components/PixelBuddyIcon/PixelBuddyIcon';
import '../i18n/config';
import './Sidebar.css';

// Lazy load heavy components
const KeyboardShortcutsHelp = React.lazy(() => import('./components/KeyboardShortcutsHelp/KeyboardShortcutsHelp'));
const SettingsPanel = React.lazy(() => import('./components/Settings/Settings'));
const AIChatPanel = React.lazy(() => import('./components/AIChatPanel/AIChatPanel'));
const RecentTabsList = React.lazy(() => import('./components/RecentTabsList/RecentTabsList'));

const LoadingFallback = () => (
  <div className="loading-fallback" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
    <PixelBuddyIcon size={32} animated />
  </div>
);

const Sidebar: React.FC = () => {
  console.log('[Sidebar] Component rendering...');

  const { t } = useTranslation();

  // 引用书签列表元素，用于自动聚焦
  const bookmarkListRef = useRef<HTMLDivElement>(null);

  // 获取新架构的 store（用于初始化和获取书签数据）
  const bookmarkStore = useBookmarkStore();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [previewPanelVisible, setPreviewPanelVisible] = useState(true);

  const toggleTheme = useCallback(async () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('theme', next);
      } catch (e) {
        console.warn('[Sidebar] Failed to save theme:', e);
      }
      document.documentElement.setAttribute('data-theme', next);
      chrome.storage.local.get(['userSettings']).then((result) => {
        const nextSettings = { ...(result.userSettings || {}), theme: next };
        return chrome.storage.local.set({ userSettings: nextSettings });
      }).catch((e) => {
        console.warn('[Sidebar] Failed to persist theme to userSettings:', e);
      });
      return next;
    });
  }, []);

  const togglePreviewPanel = useCallback(async () => {
    setPreviewPanelVisible((prev) => {
      const next = !prev;
      chrome.storage.local.get(['userSettings']).then((result) => {
        const nextSettings = { ...(result.userSettings || {}), previewPanelVisible: next };
        return chrome.storage.local.set({ userSettings: nextSettings });
      }).catch((e) => {
        console.warn('[Sidebar] Failed to persist previewPanelVisible to userSettings:', e);
      });
      return next;
    });
  }, []);

  // 使用 store 的 currentFilter（与 FilterTabs 和 BookmarkList 保持一致）
  const currentFilter = bookmarkStore.currentFilter;

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Tab 切换状态：'bookmarks' | 'chat'
  const [activeTab, setActiveTab] = useState<'bookmarks' | 'chat'>('bookmarks');
  // AI 聊天有新消息时显示提示
  const [hasUnreadChat, setHasUnreadChat] = useState(false);

  // 面板宽度状态（保留用于预览面板）
  const [previewWidth, setPreviewWidth] = useState(35); // 预览面板宽度（%）
  const [previewCollapsed, setPreviewCollapsed] = useState(false); // 预览面板是否折叠

  console.log('[Sidebar] Store initialized, previewPanelVisible:', previewPanelVisible);

  // 将 loadBookmarks 移到 useEffect 之前定义
  // 优化的快速加载策略
  const loadBookmarks = useCallback(async () => {
    console.log('[Sidebar] Fast loadBookmarks starting...');
    const startTime = performance.now();

    try {
      // 1. 使用 setTimeout 让 UI 先渲染
      await new Promise(resolve => setTimeout(resolve, 0));

      // 3. 检查 Chrome API
      if (typeof chrome === 'undefined' || !chrome.storage) {
        console.warn('[Sidebar] Chrome API not available, using empty state');
        return;
      }

      // 4. 初始化 V2 store（不等待迁移）
      console.log('[Sidebar] Initializing V2 store...');
      const v2Store = useBookmarkStore.getState();
      
      // 异步初始化，不阻塞 UI
      setTimeout(async () => {
        try {
          await v2Store.initialize();
          console.log('[Sidebar] V2 store initialized in background');
        } catch (error) {
          console.error('[Sidebar] Background initialization failed:', error);
        }
      }, 100);

      const duration = performance.now() - startTime;
      console.log(`[Sidebar] Fast loadBookmarks completed in ${duration.toFixed(2)}ms`);
      
    } catch (error) {
      console.error('[Sidebar] Fast loadBookmarks failed:', error);
      useBookmarkStore.getState().setError(t('sidebar.errors.loadBookmarks'));
    }
  }, [t]);

  // 监听 storage 变化，实时响应 Pixel Buddy 点击
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes.sidebarShouldFocusSearch?.newValue === true) {
        console.log('[Sidebar] Storage change detected, focusing search bar...');
        setTimeout(() => {
          const searchInput = document.querySelector<HTMLInputElement>('.search-input');
          if (searchInput) {
            searchInput.focus();
            console.log('[Sidebar] Search bar focused via storage listener');
          }
          // 清除标记
          chrome.storage.local.remove(['sidebarShouldFocusSearch', 'sidebarFocusSearchTimestamp']);
        }, 200);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    console.log('[Sidebar] useEffect running - initializing...');

    // 读取 userSettings（theme / previewPanelVisible）
    chrome.storage.local.get(['userSettings']).then((result) => {
      const userSettings = (result as any).userSettings || {};
      const nextTheme = (userSettings.theme || (localStorage.getItem('theme') as 'light' | 'dark' | null) || 'dark') as 'light' | 'dark';
      setTheme(nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
      setPreviewPanelVisible(true);
      // 读取预览面板宽度
      if (typeof userSettings.previewPanelWidth === 'number') {
        setPreviewWidth(userSettings.previewPanelWidth);
      }
    }).catch(() => {
      try {
        const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
        const nextTheme = savedTheme || 'dark';
        setTheme(nextTheme);
        document.documentElement.setAttribute('data-theme', nextTheme);
      } catch {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    });

    // 初次加载时检查是否需要自动聚焦搜索框
    const checkFocusSearch = async () => {
      try {
        const result = await chrome.storage.local.get(['sidebarShouldFocusSearch', 'sidebarFocusSearchTimestamp']);
        if (result.sidebarShouldFocusSearch) {
          const timestamp = Number(result.sidebarFocusSearchTimestamp || 0);
          const now = Date.now();
          if (now - timestamp < 5000) {
            console.log('[Sidebar] Auto-focusing search bar on init...');
            setTimeout(() => {
              const searchInput = document.querySelector<HTMLInputElement>('.search-input');
              if (searchInput) {
                searchInput.focus();
                console.log('[Sidebar] Search bar focused');
              }
            }, 300);
          }
          await chrome.storage.local.remove(['sidebarShouldFocusSearch', 'sidebarFocusSearchTimestamp']);
        }
      } catch (error) {
        console.warn('[Sidebar] Failed to check focus search flag:', error);
      }
    };
    checkFocusSearch();

    // 检查 URL 参数，是否需要自动打开设置
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openSettings') === 'true') {
      console.log('[Sidebar] Opening settings from URL parameter');
      setShowSettings(true);
      // 清除 URL 参数，避免刷新时重复打开
      window.history.replaceState({}, '', window.location.pathname);
    }

    // 加载面板宽度偏好
    try {
      const savedPreviewWidth = localStorage.getItem('previewPanelWidth');
      if (savedPreviewWidth) setPreviewWidth(Number(savedPreviewWidth));
    } catch (e) {
      console.warn('[Sidebar] Failed to load panel widths:', e);
    }

    const checkWelcomeGuide = async () => {
      try {
        const result = await chrome.storage.local.get('welcomeGuideSeen');
        if (!result.welcomeGuideSeen) {
          setTimeout(() => {
            setShowWelcomeGuide(true);
          }, 1000);
        }
      } catch (error) {
        console.warn('[Sidebar] Failed to check welcome guide:', error);
      }
    };
    checkWelcomeGuide();

    // 加载用户设置（包括 chromeSyncEnabled）- 必须在 loadBookmarks 之前完成
    // 新架构：不再需要初始化旧的同步服务，BookmarkStore 会处理所有初始化
    const initializeData = async () => {
      try {
        // 使用新架构加载书签（包含迁移检查和 V2 store 初始化）
        await loadBookmarks();
      } catch (err) {
        console.error('[Sidebar] Failed to initialize data:', err);
        useBookmarkStore.getState().setError(t('sidebar.errors.loadBookmarks') + ': ' + (err as Error).message);
      }
    };

    initializeData();

    // 消息监听器
    type SidebarMessage =
      | { type: 'BOOKMARK_ADDED' | 'BOOKMARKS_UPDATED' | 'OPEN_SETTINGS' }
      | { type: 'BOOKMARKS_IMPORTED'; count: number }
      | { type: 'ANALYSIS_QUEUE_PROGRESS'; data: { total: number; completed: number; failed: number; pending: number; progress: number } }
      | { type: 'ANALYSIS_QUEUE_COMPLETE'; data: { completed: number; failed: number; total: number } };

    const messageListener = (message: SidebarMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response?: { success: boolean; error?: string }) => void) => {
      console.log('[Sidebar] Received message:', message);

      // 处理打开设置面板的消息（从 popup 菜单发送）
      if (message.type === 'OPEN_SETTINGS') {
        console.log('[Sidebar] Opening settings panel from popup menu');
        setShowSettings(true);
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'BOOKMARK_ADDED' || message.type === 'BOOKMARKS_UPDATED') {
        // 刷新新架构的书签数据
        useBookmarkStore.getState().refresh().then(() => {
          sendResponse({ success: true });
        }).catch(error => {
          console.error('[Sidebar] Failed to reload bookmarks:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true;
      } else if (message.type === 'BOOKMARKS_IMPORTED') {
        console.log(`[Sidebar] ${message.count} bookmarks imported from Chrome`);
        // 刷新新架构的书签数据
        useBookmarkStore.getState().refresh().then(() => {
          showToast(t('sidebar.toast.importSuccess', { count: message.count }), 'success', 5000);
          sendResponse({ success: true });
        }).catch(error => {
          console.error('[Sidebar] Failed to reload bookmarks:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true;
      } else if (message.type === 'ANALYSIS_QUEUE_PROGRESS') {
        // 更新进度
        const { progress } = message.data;
        setAnalysisProgress(progress);
        console.log('[Sidebar] Analysis progress updated:', progress);
        return false;
      } else if (message.type === 'ANALYSIS_QUEUE_COMPLETE') {
        // 分析完成
        const { completed, failed } = message.data;
        setAnalyzing(false);
        setAnalysisProgress(0);

        // 刷新新架构的书签数据
        useBookmarkStore.getState().refresh().then(() => {
          showToast(
            t('sidebar.toast.analysisComplete', { completed, failed }),
            'success',
            5000
          );
        });
        return false;
      }

      return false;
    };

    chrome.runtime?.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime?.onMessage.removeListener(messageListener);
    };
  }, [theme, loadBookmarks, t]);

  // 自动聚焦到书签列表 - 解决 Chrome Side Panel 键盘事件限制问题
  useEffect(() => {
    // 延迟聚焦，确保 DOM 渲染完成
    const focusTimer = setTimeout(() => {
      // 直接聚焦到 .bookmark-list 元素（它有 tabIndex=0）
      const listEl = document.querySelector<HTMLElement>('.bookmark-list');
      if (listEl) {
        // 确保 tabIndex 存在
        if (listEl.getAttribute('tabIndex') === null) {
          listEl.setAttribute('tabIndex', '0');
        }
        listEl.focus();
        console.log('[Sidebar] Auto-focused to .bookmark-list element');

        // 确保选中状态正确
        const items = useBookmarkStore.getState().getFilteredItems();
        if (items.length > 0 && !useBookmarkStore.getState().selectedId) {
          useBookmarkStore.getState().setSelectedId(items[0].chromeId);
          console.log('[Sidebar] Auto-selected first item');
        }
      } else {
        console.warn('[Sidebar] .bookmark-list element not found');
      }
    }, 100);

    return () => clearTimeout(focusTimer);
  }, [currentFilter, activeTab, showSettings]); // 切换过滤器或 Tab 后重新聚焦

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isInputElement = (target: EventTarget | null): boolean => {
        if (!target) return false;
        const element = target as HTMLElement;
        const tagName = element.tagName.toLowerCase();
        return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
      };

      // 优先处理 Escape 键 - 用于关闭帮助面板和设置面板
      if (e.key === 'Escape') {
        if (showKeyboardHelp) {
          e.preventDefault();
          setShowKeyboardHelp(false);
          return;
        }
        if (showSettings) {
          e.preventDefault();
          setShowSettings(false);
          return;
        }
        // 如果在聊天 Tab，按 Escape 切回书签
        if (activeTab === 'chat') {
          e.preventDefault();
          setActiveTab('bookmarks');
          return;
        }
        // 如果没有打开任何面板，按 Escape 取消聚焦
        e.preventDefault();
        // 聚焦到 body，允许重新开始键盘导航
        document.body.focus();
        return;
      }

      // 空格键切换预览面板（不在输入框中时）
      if (e.key === ' ' && !isInputElement(e.target) && e.target === document.body) {
        e.preventDefault();
        togglePreviewPanel();
        return;
      }

      // H 键显示帮助
      if ((e.key === 'h' || e.key === 'H') && !isInputElement(e.target)) {
        e.preventDefault();
        console.log('[Sidebar] H key pressed, toggling keyboard help');
        setShowKeyboardHelp(prev => !prev);
        return;
      }

      // 回收站模式下的快捷键（R 恢复，D 永久删除）
      // 注意：这里不检查 selectedBookmark，因为 BookmarkList 会更新 store 中的 selectedBookmark
      // 我们使用 useBookmarkStore 的 selectedBookmark 状态
      if (currentFilter === 'trash' && !isInputElement(e.target)) {
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          const selectedId = useBookmarkStore.getState().selectedId;
          const selected = selectedId ? useBookmarkStore.getState().getBookmarkById(selectedId) : undefined;
          if (selectedId && selected) {
            console.log('[Sidebar] Restoring bookmark:', selected.title);
            useBookmarkStore.getState().restoreBookmark(selectedId);
            showToast(t('sidebar.toast.bookmarkRestored'), 'success', 3000);
          }
          return;
        }
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          const selectedId = useBookmarkStore.getState().selectedId;
          const selected = selectedId ? useBookmarkStore.getState().getBookmarkById(selectedId) : undefined;
          if (selectedId && selected) {
            console.log('[Sidebar] Permanently deleting bookmark:', selected.title);
            if (confirm(t('sidebar.toast.deleteConfirm', { title: selected.title }))) {
              (async () => {
                try {
                  const metadataService = getMetadataService();
                  await metadataService.initialize();
                  await metadataService.deleteMetadata(selectedId);
                  await useBookmarkStore.getState().refresh();
                  showToast(t('sidebar.toast.permanentlyDeleted'), 'success', 3000);
                } catch (err) {
                  console.error('[Sidebar] Permanently delete failed:', err);
                  showToast(t('sidebar.toast.analysisFailed', { error: (err as Error).message }), 'error', 5000);
                }
              })();
            }
          }
          return;
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    console.log('[Sidebar] Keyboard event listener registered');

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      console.log('[Sidebar] Keyboard event listener removed');
    };
  }, [showKeyboardHelp, showSettings, activeTab, togglePreviewPanel, currentFilter]);

  const handleClose = () => {
    window.close();
  };

  const handleSettings = () => {
    setShowSettings(true);
  };

  const handleExpand = () => {
    console.log('Expand');
  };

  const handleAIAnalyze = async () => {
    console.log('[Sidebar] handleAIAnalyze called', { analyzing, bookmarksLength: bookmarkStore.bookmarks.length });
    if (analyzing) {
      console.log('[Sidebar] Already analyzing, skipping');
      return;
    }

    // 检查 API 配置
    try {
      const result = await chrome.storage.local.get(['aiConfig']);
      const aiConfig = result.aiConfig as any;
      const isOllama = aiConfig?.provider === 'ollama';
      const hasApiKey = aiConfig?.apiKeys?.length > 0 || aiConfig?.apiKey;

      // Ollama 本地模型不需要 API Key，其他都需要
      if (!isOllama && !hasApiKey) {
        showToast(
          t('sidebar.analysis.noApiKey') || '请先在设置中配置 AI API Key',
          'error',
          5000
        );
        return;
      }
    } catch (error) {
      console.error('[Sidebar] Failed to check API config:', error);
      showToast(
        t('sidebar.analysis.configError') || '无法检查 API 配置',
        'error',
        3000
      );
      return;
    }

    // 使用新架构的书签数据
    const v2Bookmarks = bookmarkStore.bookmarks;
    
    // 过滤出需要分析的书签：aiSummary 为空的
    let unanalyzedBookmarks = v2Bookmarks.filter(
      b => !b.aiSummary || b.aiSummary.trim() === ''
    );

    // 检查是否有需要分析的书签
    if (unanalyzedBookmarks.length === 0) {
      // 所有书签都已分析，询问是否重新分析
      if (v2Bookmarks.length === 0) {
        showToast(t('sidebar.analysis.noBookmarks') || '没有可分析的书签', 'info', 3000);
        return;
      }

      const confirmReanalyze = window.confirm(
        t('sidebar.analysis.reanalyzeConfirm', { count: v2Bookmarks.length })
      );

      if (!confirmReanalyze) {
        return;
      }

      // 用户确认重新分析，使用所有书签
      unanalyzedBookmarks = v2Bookmarks;
    }

    setAnalyzing(true);
    setAnalysisProgress(0);

    // 计算预估时间（每个书签约 3-5 秒，包括内容提取和 AI 分析）
    const estimatedMinutes = Math.ceil(unanalyzedBookmarks.length * 4 / 60);
    const timeHint = estimatedMinutes <= 1
      ? t('sidebar.toast.timeHintShort')
      : t('sidebar.toast.timeHintLong', { minutes: estimatedMinutes });

    // 立即提示用户：后台处理 + 预估时间
    showToast(
      t('sidebar.toast.analysisStarted', { count: unanalyzedBookmarks.length }) + ` (${timeHint})`,
      'info',
      8000
    );

    try {
      // 转换为旧格式以兼容后台分析（临时方案）
      const bookmarksForAnalysis = unanalyzedBookmarks.map(b => ({
        id: b.chromeId,
        url: b.url,
        title: b.title,
        aiSummary: b.aiSummary,
        status: b.status,
      }));

      // 发送消息到 background script 启动后台分析
      const response = await chrome.runtime.sendMessage({
        type: 'START_BATCH_ANALYSIS',
        data: { bookmarks: bookmarksForAnalysis }
      });

      if (response.success) {
        console.log('[Sidebar] Background analysis started:', response.data);

        // 开始轮询进度
        const progressInterval = setInterval(async () => {
          try {
            const statusResponse = await chrome.runtime.sendMessage({
              type: 'GET_ANALYSIS_STATUS'
            });

            if (statusResponse.success) {
              const status = statusResponse.data;
              setAnalysisProgress(status.progress);

              console.log('[Sidebar] Analysis progress:', status);

              // 如果完成，停止轮询
              if (!status.isProcessing && status.pending === 0) {
                clearInterval(progressInterval);
                setAnalyzing(false);
                setAnalysisProgress(0);

                // 刷新新架构的书签数据
                await useBookmarkStore.getState().refresh();

                showToast(
                  t('sidebar.toast.analysisComplete', { completed: status.completed, failed: status.failed }),
                  'success',
                  5000
                );
              }
            }
          } catch (error) {
            console.error('[Sidebar] Failed to get analysis status:', error);
          }
        }, 2000); // 每2秒轮询一次

        // 5分钟后停止轮询（防止无限轮询）
        setTimeout(() => {
          clearInterval(progressInterval);
          setAnalyzing(false);
          setAnalysisProgress(0);
        }, 5 * 60 * 1000);

      } else {
        throw new Error(response.error || 'Failed to start background analysis');
      }
    } catch (error) {
      console.error('[Sidebar] Failed to start background analysis:', error);
      showToast(
        t('sidebar.toast.analysisFailed', { error: (error as Error).message }),
        'error',
        5000
      );
      setAnalyzing(false);
      setAnalysisProgress(0);
    }
  };

  const handleCloseWelcomeGuide = async () => {
    setShowWelcomeGuide(false);
    try {
      await chrome.storage.local.set({ welcomeGuideSeen: true });
    } catch (error) {
      console.warn('[Sidebar] Failed to save welcome guide state:', error);
    }
  };

  return (
    <div className="sidebar">
      <ToastContainer position="top-right" />

      {showWelcomeGuide && (
        <div className="welcome-guide-overlay">
          <div className="welcome-guide">
            <div className="welcome-icon">
              👋
            </div>
            <h2>{t('sidebar.welcome.title')}</h2>
            <div className="welcome-content">
              <p>💡 <strong>{t('sidebar.welcome.feature1')}</strong></p>
              <p>{t('sidebar.welcome.feature1Desc')}</p>
              <p className="sub-hint">✨ {t('sidebar.welcome.feature2Desc')}</p>
            </div>
            <button className="welcome-button" onClick={handleCloseWelcomeGuide}>
              {t('sidebar.welcome.close')}
            </button>
          </div>
        </div>
      )}

      <header className="sidebar-header">
        <div className="header-left">
          <h1 className="sidebar-title">{t('sidebar.header.title')}</h1>
        </div>
        <div className="header-right">
          <button
            className={`icon-button ai-analyze-button ${analyzing ? 'analyzing' : ''}`}
            onClick={handleAIAnalyze}
            disabled={analyzing}
            title={analyzing ? t('sidebar.toast.analyzing', { progress: analysisProgress }) : t('sidebar.header.aiAnalyze')}
          >
            <Sparkles size={18} />
          </button>
          <button
            className="icon-button"
            onClick={toggleTheme}
            title={t('sidebar.header.theme')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="icon-button"
            onClick={handleSettings}
            title={t('sidebar.header.settings')}
          >
            <SettingsIcon size={18} />
          </button>
          <button
            className="icon-button"
            onClick={handleExpand}
            title={t('sidebar.header.expand')}
          >
            <Maximize2 size={18} />
          </button>
          <button
            className="icon-button"
            onClick={handleClose}
            title={t('sidebar.header.close')}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Tab 切换栏 */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'bookmarks' ? 'active' : ''}`}
          onClick={() => setActiveTab('bookmarks')}
          title="Ctrl+1"
        >
          <span className="tab-icon">📚</span>
          <span className="tab-label">{t('sidebar.tabs.bookmarks', '书签')}</span>
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('chat');
            setHasUnreadChat(false);
          }}
          title="Ctrl+2"
        >
          <PixelBuddyIcon size={16} />
          <span className="tab-label">{t('sidebar.tabs.chat', 'AI 助手')}</span>
          {hasUnreadChat && <span className="tab-badge" />}
        </button>
      </div>

      {/* 搜索栏和过滤器 - 只在书签 Tab 显示 */}
      {activeTab === 'bookmarks' && (
        <>
          <div className="sidebar-search">
            <SearchBar />
          </div>

          <div className="sidebar-filters">
            <FilterTabs />
          </div>
        </>
      )}

      <div className="sidebar-content">
        {/* 书签 Tab 内容 */}
        {activeTab === 'bookmarks' && (
          <>
            {previewPanelVisible && (
              <>
                <div
                  className="sidebar-preview"
                  style={{
                    width: previewCollapsed ? '0' : `${previewWidth}%`,
                    minWidth: previewCollapsed ? '0' : '250px',
                    transition: 'width 0.3s ease, min-width 0.3s ease'
                  }}
                >
                  <PreviewPanel />
                </div>
                {!previewCollapsed && (
                  <ResizableDivider
                    width={previewWidth}
                    onWidthChange={(width) => {
                      setPreviewWidth(width);
                      chrome.storage.local.get(['userSettings']).then((result) => {
                        const userSettings = (result as any).userSettings || {};
                        chrome.storage.local.set({
                          userSettings: { ...userSettings, previewPanelWidth: width }
                        });
                      }).catch(() => {});
                    }}
                    position="left"
                    minWidth={25}
                    maxWidth={60}
                    collapsible={true}
                    collapsed={previewCollapsed}
                    onCollapsedChange={(collapsed) => {
                      setPreviewCollapsed(collapsed);
                      if (collapsed) {
                        togglePreviewPanel();
                      }
                    }}
                  />
                )}
              </>
            )}

            <div
              className={`sidebar-list ${previewPanelVisible && !previewCollapsed ? 'with-preview' : 'full-width'}`}
              style={{
                flex: '1',
                minWidth: '300px'
              }}
            >
              <div ref={bookmarkListRef} tabIndex={-1}>
                {currentFilter === 'recent' ? (
                  <Suspense fallback={<LoadingFallback />}>
                    <RecentTabsList />
                  </Suspense>
                ) : (
                  <BookmarkList />
                )}
              </div>
            </div>
          </>
        )}

        {/* AI 聊天 Tab 内容 */}
        {activeTab === 'chat' && (
          <div className="sidebar-chat-full">
            <Suspense fallback={<LoadingFallback />}>
              <AIChatPanel
                isOpen={true}
                onClose={() => setActiveTab('bookmarks')}
              />
            </Suspense>
          </div>
        )}
      </div>

      <footer className="sidebar-footer">
        {activeTab === 'bookmarks' && (
          <div className="footer-shortcuts">
            <span className="shortcut">
              <kbd><ArrowUp size={12} /></kbd>
              <kbd><ArrowDown size={12} /></kbd> {t('sidebar.keyboard.navigation')}
            </span>
            <span className="shortcut">
              <kbd>Enter</kbd> {t('sidebar.bookmarks.open')}
            </span>
            {currentFilter === 'trash' ? (
              <>
                <span className="shortcut">
                  <kbd>R</kbd> {t('sidebar.bookmarks.restore')}
                </span>
                <span className="shortcut">
                  <kbd>D</kbd> {t('sidebar.bookmarks.delete')}
                </span>
              </>
            ) : (
              <>
                <span className="shortcut">
                  <kbd>O</kbd> {t('sidebar.footer.shortcuts.newTab')}
                </span>
                <span className="shortcut">
                  <kbd>S</kbd> {t('sidebar.footer.shortcuts.star')}
                </span>
              </>
            )}
            <span className="shortcut">
              <kbd>/</kbd> {t('sidebar.search.placeholder')}
            </span>
            <button
              className="shortcut highlight clickable"
              onClick={() => setShowKeyboardHelp(true)}
              title={t('sidebar.keyboard.shortcuts.h')}
            >
              <kbd>H</kbd> {t('sidebar.footer.shortcuts.more')}
            </button>
          </div>
        )}
        {activeTab === 'chat' && (
          <div className="footer-shortcuts">
            <span className="shortcut">
              <kbd>Ctrl+1</kbd> {t('sidebar.tabs.bookmarks', '书签')}
            </span>
            <span className="shortcut">
              <kbd>Ctrl+2</kbd> {t('sidebar.tabs.chat', 'AI 助手')}
            </span>
            <span className="shortcut">
              <kbd>Alt+A</kbd> {t('sidebar.footer.shortcuts.switchTab', '切换')}
            </span>
          </div>
        )}
      </footer>

      <Suspense fallback={null}>
        <KeyboardShortcutsHelp
          isOpen={showKeyboardHelp}
          onClose={() => setShowKeyboardHelp(false)}
        />
      </Suspense>

      <Suspense fallback={null}>
        <SettingsPanel
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      </Suspense>
    </div>
  );
};

export default Sidebar;
