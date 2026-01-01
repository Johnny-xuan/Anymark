/**
 * 侧边栏主界面组件 - 免费版
 */

import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { Settings as SettingsIcon, Maximize2, X, Sun, Moon, ArrowUp, ArrowDown, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SearchBar from './components/SearchBar/SearchBar';
import FilterTabs from './components/FilterTabs/FilterTabs';
import BookmarkListV2 from './components/BookmarkList/BookmarkListV2';
import PreviewPanelV2 from './components/PreviewPanel/PreviewPanelV2';
import ResizableDivider from './components/ResizableDivider/ResizableDivider';
import ToastContainer from '../components/Toast/ToastContainer';
import { useBookmarkStore } from './store/bookmarkStore';
import { useBookmarkStoreV2 } from './store/bookmarkStoreV2';
import { getMigrationService } from '../services/migrationService';
import { getDefaultAnalyzer } from '../utils/aiAnalyzer';
import { showToast } from '../components/Toast/ToastContainer';
import { useChatStore } from '../chat/chatStore';
import type { IBookmark, IFolder } from '../types/bookmark';
import PixelBuddyIcon from './components/PixelBuddyIcon/PixelBuddyIcon';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import type { SyncStatusType } from './components/SyncStatusIndicator';
import type { BookmarkConflict, ResolutionResult } from '../utils/chromeSyncCompat';
import '../i18n/config';
import './Sidebar.css';

// Lazy load heavy components
const KeyboardShortcutsHelp = React.lazy(() => import('./components/KeyboardShortcutsHelp/KeyboardShortcutsHelp'));
const SettingsPanel = React.lazy(() => import('./components/Settings/Settings'));
const AIChatPanel = React.lazy(() => import('./components/AIChatPanel/AIChatPanel'));
const ConflictDialog = React.lazy(() => import('./components/ConflictDialog/ConflictDialog'));
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

  const {
    previewPanelVisible,
    togglePreviewPanel,
    setLoading,
    setError,
    setBookmarks,
    bookmarks,
    updateBookmark,
    theme,
    toggleTheme,
    selectedBookmark,
    restoreBookmark,
    permanentlyDeleteBookmark,
  } = useBookmarkStore();

  // 获取chat store以初始化记忆
  const chatStore = useChatStore();

  // 获取新架构的 store（用于初始化和获取书签数据）
  const bookmarkStoreV2 = useBookmarkStoreV2();
  
  // 使用 V2 store 的 currentFilter（与 FilterTabs 和 BookmarkListV2 保持一致）
  const currentFilter = bookmarkStoreV2.currentFilter;

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);

  // 同步状态
  const [syncStatus, setSyncStatus] = useState<SyncStatusType>('disabled');
  const [syncConflicts, setSyncConflicts] = useState<BookmarkConflict[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  // 面板宽度状态
  const [previewWidth, setPreviewWidth] = useState(35); // 预览面板宽度（%）
  const [chatWidth, setChatWidth] = useState(35); // AI聊天面板宽度（%）
  const [previewCollapsed, setPreviewCollapsed] = useState(false); // 预览面板是否折叠
  const [chatCollapsed, setChatCollapsed] = useState(false); // AI聊天面板是否折叠

  console.log('[Sidebar] Store initialized, previewPanelVisible:', previewPanelVisible);

  // 将 loadBookmarks 移到 useEffect 之前定义
  // 新架构：使用 BookmarkStoreV2 初始化，Chrome Native 作为唯一数据源
  const loadBookmarks = useCallback(async () => {
    console.log('[Sidebar] loadBookmarks starting (V2 architecture)...');

    try {
      setLoading(true);

      if (typeof chrome === 'undefined' || !chrome.storage) {
        throw new Error('Chrome Storage API not available');
      }

      console.log('[Sidebar] Chrome API available, initializing V2 store...');

      // 检查是否需要迁移
      const migrationService = getMigrationService();
      const needsMigration = await migrationService.needsMigration();
      
      if (needsMigration) {
        console.log('[Sidebar] Migration needed, running migration...');
        showToast(t('sidebar.toast.migrating') || '正在迁移数据...', 'info', 5000);
        
        const migrationResult = await migrationService.migrate((progress) => {
          console.log('[Sidebar] Migration progress:', progress);
        });
        
        if (migrationResult.success) {
          console.log('[Sidebar] Migration completed successfully');
          showToast(
            t('sidebar.toast.migrationComplete', { count: migrationResult.migratedBookmarks }) || 
            `迁移完成，已迁移 ${migrationResult.migratedBookmarks} 个书签`,
            'success',
            3000
          );
        } else {
          console.warn('[Sidebar] Migration completed with errors:', migrationResult.errors);
          showToast(
            t('sidebar.toast.migrationPartial') || '迁移部分完成，部分书签可能需要手动处理',
            'warning',
            5000
          );
        }
      }

      // 使用新架构的 BookmarkStoreV2 初始化
      // 这会从 Chrome Native 加载书签并合并元数据
      await useBookmarkStoreV2.getState().initialize();
      
      // 同时保持旧 store 的兼容性（用于其他组件）
      // 从 Extension Storage 加载书签和文件夹（旧数据，用于兼容）
      const result = await chrome.storage.local.get(['bookmarks', 'folders']);
      const existingBookmarks: IBookmark[] = (result.bookmarks as IBookmark[]) || [];
      const existingFolders: IFolder[] = (result.folders as IFolder[]) || [];

      console.log('[Sidebar] Loaded bookmarks from storage (legacy):', existingBookmarks.length);
      console.log('[Sidebar] Loaded folders from storage (legacy):', existingFolders.length);

      // 更新旧 store 的文件夹状态（兼容性）
      useBookmarkStore.setState({ folders: existingFolders });

      // 如果书签数量过多，进行内存优化
      if (existingBookmarks.length > 5000) {
        console.warn('[Sidebar] Large bookmark set detected, applying memory optimization');
        const optimizedBookmarks = existingBookmarks
          .sort((a, b) => (b.analytics?.importance || 50) - (a.analytics?.importance || 50))
          .slice(0, 5000);

        console.log(`[Sidebar] Optimized to ${optimizedBookmarks.length} bookmarks from ${existingBookmarks.length}`);
        setBookmarks(optimizedBookmarks);

        showToast(
          t('sidebar.toast.memoryOptimized', {
            total: existingBookmarks.length,
            loaded: optimizedBookmarks.length
          }) || `已加载 ${optimizedBookmarks.length} 个书签（共 ${existingBookmarks.length} 个）`,
          'info',
          5000
        );
      } else {
        setBookmarks(existingBookmarks);
        console.log('[Sidebar] Set bookmarks list (legacy), count:', existingBookmarks.length);
      }

      setLoading(false);
      console.log('[Sidebar] loadBookmarks completed successfully (V2 architecture)');
    } catch (error) {
      console.error('[Sidebar] Failed to load bookmarks:', error);
      setError(t('sidebar.errors.loadBookmarks'));
      setLoading(false);
    }
  }, [setLoading, setError, setBookmarks, t]);

  // 更新同步状态
  const updateSyncStatus = useCallback(async () => {
    try {
      const result = await chrome.storage.local.get(['userSettings', 'pendingConflicts', 'syncStatus']);
      const settings = result.userSettings || {};

      if (!settings.chromeSyncEnabled) {
        setSyncStatus('disabled');
        setSyncConflicts([]);
        return;
      }

      const pendingConflicts = result.pendingConflicts || [];
      const storedStatus = result.syncStatus;

      if (pendingConflicts.length > 0) {
        setSyncStatus('has_conflicts');
        setSyncConflicts(pendingConflicts);
      } else if (storedStatus?.status) {
        setSyncStatus(storedStatus.status);
      } else {
        setSyncStatus('synced');
      }
    } catch (error) {
      console.error('[Sidebar] Failed to update sync status:', error);
      setSyncStatus('error');
    }
  }, []);

  // 处理冲突解决
  const handleResolveConflicts = useCallback(async (conflicts: BookmarkConflict[]): Promise<ResolutionResult> => {
    try {
      const { conflictResolver } = await import('../utils/chromeSyncCompat');
      const store = useBookmarkStore.getState();

      const result = await conflictResolver.applyResolutions(
        conflicts,
        // updatePlugin
        async (bookmark, updates) => {
          await store.updateBookmark(bookmark.id, updates);
        },
        // updateChrome
        async (chromeId, updates) => {
          if (chrome.bookmarks) {
            await chrome.bookmarks.update(chromeId, updates);
          }
        },
        // createPluginBookmark
        async (bookmarkData) => {
          const newBookmark = await store.addBookmark(bookmarkData as IBookmark);
          return newBookmark;
        },
        // moveChrome
        async (chromeId, destination) => {
          if (chrome.bookmarks) {
            await chrome.bookmarks.move(chromeId, destination);
          }
        }
      );

      if (result.success) {
        // 清除待处理冲突
        await chrome.storage.local.set({ pendingConflicts: [], syncStatus: { status: 'synced', conflictCount: 0 } });
        setSyncConflicts([]);
        setSyncStatus('synced');
        showToast(t('conflict.result.success', { count: result.resolved }), 'success', 3000);
      } else {
        showToast(t('conflict.result.partial', { resolved: result.resolved, failed: result.failed }), 'warning', 5000);
      }

      return result;
    } catch (error) {
      console.error('[Sidebar] Failed to resolve conflicts:', error);
      return {
        success: false,
        resolved: 0,
        failed: conflicts.length,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }, [t]);

  // 处理同步状态点击
  const handleSyncStatusClick = useCallback(() => {
    if (syncStatus === 'has_conflicts' && syncConflicts.length > 0) {
      setShowConflictDialog(true);
    } else if (syncStatus === 'error') {
      // 重试同步
      updateSyncStatus();
    }
  }, [syncStatus, syncConflicts, updateSyncStatus]);

  // 监听从设置面板打开冲突对话框的事件
  useEffect(() => {
    const handleOpenConflictDialog = () => {
      if (syncConflicts.length > 0) {
        setShowConflictDialog(true);
      }
    };

    window.addEventListener('openConflictDialog', handleOpenConflictDialog);
    return () => {
      window.removeEventListener('openConflictDialog', handleOpenConflictDialog);
    };
  }, [syncConflicts]);

  useEffect(() => {
    console.log('[Sidebar] useEffect running - initializing...');

    // 检查 URL 参数，是否需要自动打开设置
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openSettings') === 'true') {
      console.log('[Sidebar] Opening settings from URL parameter');
      setShowSettings(true);
      // 清除 URL 参数，避免刷新时重复打开
      window.history.replaceState({}, '', window.location.pathname);
    }

    // 初始化Agent记忆系统
    if (!chatStore.memoryInitialized) {
      chatStore.initializeMemory().catch(err => {
        console.error('[Sidebar] Failed to initialize agent memory:', err);
      });
    }

    // 执行自动维护（归档和删除过期书签）
    import('./store/bookmarkStore').then(({ runAutoMaintenance }) => {
      runAutoMaintenance().catch(err => {
        console.warn('[Sidebar] Auto maintenance failed:', err);
      });
    });

    // 初始化IndexedDB（如果用户启用）
    const initializeIndexedDB = async () => {
      try {
        // 读取用户设置
        const settingsResult = await chrome.storage.local.get('userSettings');
        const userSettings = settingsResult.userSettings;

        if (userSettings?.indexedDBEnabled) {
          console.log('[Sidebar] Initializing IndexedDB...');
          const { getPaginatedStorage } = await import('../utils/paginatedStorage');
          const storage = await getPaginatedStorage();

          // 检查是否需要从Chrome Storage迁移数据
          const migrationResult = await chrome.storage.local.get('indexedDBMigrated');
          if (!migrationResult.indexedDBMigrated) {
            console.log('[Sidebar] Migrating data from Chrome Storage to IndexedDB...');
            await storage.migrateFromChromeStorage();
            await chrome.storage.local.set({ indexedDBMigrated: true });
            console.log('[Sidebar] Migration completed');
          }

          console.log('[Sidebar] IndexedDB initialized successfully');
        }
      } catch (error) {
        console.warn('[Sidebar] Failed to initialize IndexedDB:', error);
      }
    };

    initializeIndexedDB();

    // 加载面板宽度偏好
    try {
      const savedPreviewWidth = localStorage.getItem('previewPanelWidth');
      const savedChatWidth = localStorage.getItem('chatPanelWidth');
      if (savedPreviewWidth) setPreviewWidth(Number(savedPreviewWidth));
      if (savedChatWidth) setChatWidth(Number(savedChatWidth));
    } catch (e) {
      console.warn('[Sidebar] Failed to load panel widths:', e);
    }

    try {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
      if (savedTheme && savedTheme !== theme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }
    } catch (e) {
      console.warn('[Sidebar] Failed to load theme:', e);
      document.documentElement.setAttribute('data-theme', 'dark');
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
    // 新架构：不再需要初始化旧的同步服务，BookmarkStoreV2 会处理所有初始化
    const initializeData = async () => {
      try {
        // 先加载设置
        await useBookmarkStore.getState().loadSettings();
        console.log('[Sidebar] User settings loaded');

        // 使用新架构加载书签（包含迁移检查和 V2 store 初始化）
        await loadBookmarks();

        // 更新同步状态
        await updateSyncStatus();
      } catch (err) {
        console.error('[Sidebar] Failed to initialize data:', err);
        setError(t('sidebar.errors.loadBookmarks') + ': ' + (err as Error).message);
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
        useBookmarkStoreV2.getState().refresh().then(() => {
          sendResponse({ success: true });
        }).catch(error => {
          console.error('[Sidebar] Failed to reload bookmarks:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true;
      } else if (message.type === 'BOOKMARKS_IMPORTED') {
        console.log(`[Sidebar] ${message.count} bookmarks imported from Chrome`);
        // 刷新新架构的书签数据
        useBookmarkStoreV2.getState().refresh().then(() => {
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
        useBookmarkStoreV2.getState().refresh().then(() => {
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
  }, [theme, chatStore, loadBookmarks, setError]);

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
        const store = useBookmarkStore.getState();
        const filteredBookmarks = store.getFilteredBookmarks();
        if (filteredBookmarks.length > 0 && (store.selectedIndex === -1 || store.selectedIndex >= filteredBookmarks.length)) {
          store.setSelectedIndex(0);
          console.log('[Sidebar] Auto-selected first item');
        }
      } else {
        console.warn('[Sidebar] .bookmark-list element not found');
      }
    }, 100);

    return () => clearTimeout(focusTimer);
  }, [currentFilter, showAIChat, showSettings]); // 切换过滤器或面板后重新聚焦

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
        if (showAIChat) {
          e.preventDefault();
          setShowAIChat(false);
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

      // Alt+A 切换 AI 聊天
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        console.log('[Sidebar] Alt+A pressed, toggling AI chat');
        setShowAIChat(prev => !prev);
        return;
      }

      // 回收站模式下的快捷键（R 恢复，D 永久删除）
      // 注意：这里不检查 selectedBookmark，因为 BookmarkList 会更新 store 中的 selectedBookmark
      // 我们使用 useBookmarkStore 的 selectedBookmark 状态
      if (currentFilter === 'trash' && !isInputElement(e.target)) {
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          // 获取当前选中的书签
          const state = useBookmarkStore.getState();
          if (state.selectedBookmark) {
            console.log('[Sidebar] Restoring bookmark:', state.selectedBookmark.title);
            state.restoreBookmark(state.selectedBookmark.id);
            showToast(t('sidebar.toast.bookmarkRestored'), 'success', 3000);
          }
          return;
        }
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          const state = useBookmarkStore.getState();
          if (state.selectedBookmark) {
            console.log('[Sidebar] Permanently deleting bookmark:', state.selectedBookmark.title);

            if (confirm(t('sidebar.toast.deleteConfirm', { title: state.selectedBookmark.title }))) {
              state.permanentlyDeleteBookmark(state.selectedBookmark.id);
              showToast(t('sidebar.toast.permanentlyDeleted'), 'success', 3000);
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
  }, [showKeyboardHelp, showSettings, showAIChat, togglePreviewPanel, currentFilter]);

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
    console.log('[Sidebar] handleAIAnalyze called', { analyzing, bookmarksLength: bookmarkStoreV2.bookmarks.length });
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
    const v2Bookmarks = bookmarkStoreV2.bookmarks;
    
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
                await useBookmarkStoreV2.getState().refresh();

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
          {/* 同步状态指示器 */}
          <SyncStatusIndicator
            status={syncStatus}
            conflictCount={syncConflicts.length}
            onClick={handleSyncStatusClick}
            compact
          />
          <button
            className={`icon-button ai-chat-button ${showAIChat ? 'active' : ''}`}
            onClick={() => setShowAIChat(prev => !prev)}
            title={`${t('chat.title')} (Alt+A)`}
          >
            <PixelBuddyIcon size={18} animated />
          </button>
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

      <div className="sidebar-search">
        <SearchBar />
      </div>

      <div className="sidebar-filters">
        <FilterTabs />
      </div>

      <div className="sidebar-content">
        {showAIChat && (
          <>
            <div
              className="sidebar-ai-chat"
              style={{
                width: chatCollapsed ? '0' : `${chatWidth}%`,
                minWidth: chatCollapsed ? '0' : '250px',
                transition: 'width 0.3s ease, min-width 0.3s ease'
              }}
            >
              <Suspense fallback={<LoadingFallback />}>
                <AIChatPanel
                  isOpen={showAIChat}
                  onClose={() => setShowAIChat(false)}
                />
              </Suspense>
            </div>
            {!chatCollapsed && (
              <ResizableDivider
                width={chatWidth}
                onWidthChange={(width) => {
                  setChatWidth(width);
                  try {
                    localStorage.setItem('chatPanelWidth', width.toString());
                  } catch (e) {
                    console.warn('[Sidebar] Failed to save chat panel width:', e);
                  }
                }}
                position="left"
                minWidth={20}
                maxWidth={50}
                collapsible={true}
                collapsed={chatCollapsed}
                onCollapsedChange={(collapsed) => {
                  setChatCollapsed(collapsed);
                  if (!collapsed && previewPanelVisible) {
                    togglePreviewPanel();
                  }
                }}
              />
            )}
          </>
        )}

        {!showAIChat && previewPanelVisible && (
          <>
            <div
              className="sidebar-preview"
              style={{
                width: previewCollapsed ? '0' : `${previewWidth}%`,
                minWidth: previewCollapsed ? '0' : '250px',
                transition: 'width 0.3s ease, min-width 0.3s ease'
              }}
            >
              <PreviewPanelV2 />
            </div>
            {!previewCollapsed && (
              <ResizableDivider
                width={previewWidth}
                onWidthChange={(width) => {
                  setPreviewWidth(width);
                  try {
                    localStorage.setItem('previewPanelWidth', width.toString());
                  } catch (e) {
                    console.warn('[Sidebar] Failed to save preview panel width:', e);
                  }
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
          className={`sidebar-list ${(showAIChat && !chatCollapsed) || (previewPanelVisible && !previewCollapsed)
              ? 'with-preview'
              : 'full-width'
            }`}
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
              <BookmarkListV2 />
            )}
          </div>
        </div>
      </div>

      <footer className="sidebar-footer">
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

      {/* 冲突解决对话框 */}
      <Suspense fallback={null}>
        <ConflictDialog
          isOpen={showConflictDialog}
          conflicts={syncConflicts}
          onResolve={handleResolveConflicts}
          onCancel={() => setShowConflictDialog(false)}
        />
      </Suspense>
    </div>
  );
};

export default Sidebar;
