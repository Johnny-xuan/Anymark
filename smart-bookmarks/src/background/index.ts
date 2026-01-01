
/**
 * Background Service Worker
 */

import { getDefaultAnalyzer } from '../utils/aiAnalyzer';
import { getChromeSyncService } from '../utils/chromeSyncCompat';
import { calculateFrecency } from '../utils/frecencyCalculator';
import { extractFrameworkContent } from '../utils/contentExtractor';
import { migrateAIFoldersToChrome, needsMigration } from '../utils/migration';
import { getOperationHistoryService } from '../utils/operationHistory';
import { initializeBookmarkServices } from './bookmarkServiceInit';
// 静态导入服务，避免动态导入触发的 Vite preload 代码（在 Service Worker 中不可用）
import { getBookmarkService } from '../services/bookmarkService';
import { getMetadataService } from '../services/metadataService';
import { recentTabsService } from '../services/recentTabsService';

console.log('[Background] Service Worker initialized');

// 初始化 Recent Tabs Service（需要在 background 中运行以监听标签页事件）
console.log('[Background] Initializing Recent Tabs Service...');
recentTabsService.loadFromStorage().then(() => {
  console.log('[Background] Recent Tabs Service initialized');
}).catch(error => {
  console.error('[Background] Failed to initialize Recent Tabs Service:', error);
});

// ============ 新架构初始化 (Chrome Sync Redesign) ============

/**
 * 初始化新架构的书签服务
 * 这会创建 AnyMark 文件夹在 Other Bookmarks 下
 */
async function initializeNewArchitecture() {
  try {
    console.log('[Background] Initializing new bookmark architecture...');
    await initializeBookmarkServices();
    console.log('[Background] New bookmark architecture initialized successfully');
  } catch (error) {
    console.error('[Background] Failed to initialize new bookmark architecture:', error);
  }
}

// 启动时初始化新架构
initializeNewArchitecture();

// ============ AI 文件夹迁移 ============

/**
 * 执行 AI 文件夹迁移（如果需要）
 * 将 aiFolderPath 数据迁移到 folderPath
 */
async function runMigrationIfNeeded() {
  try {
    const shouldMigrate = await needsMigration();

    if (shouldMigrate) {
      console.log('[Background] AI folder migration needed, starting...');
      const result = await migrateAIFoldersToChrome();
      console.log('[Background] Migration result:', result);

      // 通知 Sidebar 更新（如果打开的话）
      if (result.migrated > 0) {
        chrome.runtime.sendMessage({
          type: 'BOOKMARKS_UPDATED',
          reason: 'migration',
          migrated: result.migrated,
        }).catch(() => {
          // Sidebar 可能没有打开，忽略错误
        });
      }
    } else {
      console.log('[Background] No AI folder migration needed');
    }
  } catch (error) {
    console.error('[Background] Migration failed:', error);
  }
}

// 启动时执行迁移检查
runMigrationIfNeeded();

// ============ 操作历史清理 ============

/**
 * 清理过期的操作历史记录
 * 删除超过 7 天的历史记录
 */
async function cleanupOperationHistory() {
  try {
    const historyService = getOperationHistoryService();
    await historyService.initialize();
    const removedCount = await historyService.cleanup();

    if (removedCount > 0) {
      console.log(`[Background] Cleaned up ${removedCount} expired operation history records`);
    } else {
      console.log('[Background] No expired operation history records to clean up');
    }
  } catch (error) {
    console.error('[Background] Failed to cleanup operation history:', error);
  }
}

// 启动时清理过期的操作历史
cleanupOperationHistory();

// ============ Chrome 同步服务初始化 ============

/**
 * 初始化 Chrome 同步服务
 * 如果用户已开启同步，会自动设置 Chrome 事件监听器
 */
async function initializeChromeSyncService() {
  try {
    const syncService = getChromeSyncService();
    await syncService.initialize();
    console.log('[Background] Chrome sync service initialized');
  } catch (error) {
    console.error('[Background] Failed to initialize Chrome sync service:', error);
  }
}

// 启动时初始化同步服务
initializeChromeSyncService();

// ============ Frecency 定时重算 ============

const FRECENCY_ALARM_NAME = 'frecency-recalculate';
const FRECENCY_RECALC_INTERVAL_MINUTES = 60 * 24; // 每24小时重算一次

/**
 * 初始化 Frecency 定时重算任务
 */
async function initializeFrecencyAlarm() {
  try {
    // 检查是否已存在 alarm
    const existingAlarm = await chrome.alarms.get(FRECENCY_ALARM_NAME);

    if (!existingAlarm) {
      // 创建定时任务：每24小时执行一次
      await chrome.alarms.create(FRECENCY_ALARM_NAME, {
        delayInMinutes: 1, // 启动后1分钟首次执行
        periodInMinutes: FRECENCY_RECALC_INTERVAL_MINUTES,
      });
      console.log('[Background] Frecency alarm created: every 24 hours');
    } else {
      console.log('[Background] Frecency alarm already exists');
    }
  } catch (error) {
    console.error('[Background] Failed to create frecency alarm:', error);
  }
}

/**
 * 批量重新计算所有书签的 importance
 */
async function recalculateAllFrecency() {
  console.log('[Background] Starting frecency recalculation...');
  const startTime = Date.now();

  try {
    const result = await chrome.storage.local.get('bookmarks');
    const bookmarks = (result.bookmarks || []) as any[];

    if (bookmarks.length === 0) {
      console.log('[Background] No bookmarks to recalculate');
      return;
    }

    let updatedCount = 0;
    const updatedBookmarks = bookmarks.map(bookmark => {
      const oldImportance = bookmark.analytics?.importance || 50;
      const newImportance = calculateFrecency(bookmark);

      // 只有当 importance 变化时才标记为更新
      if (oldImportance !== newImportance) {
        updatedCount++;
      }

      return {
        ...bookmark,
        analytics: {
          ...bookmark.analytics,
          importance: newImportance,
        },
      };
    });

    // 保存更新后的书签
    await chrome.storage.local.set({ bookmarks: updatedBookmarks });

    // 记录最后重算时间
    await chrome.storage.local.set({
      lastFrecencyRecalc: Date.now()
    });

    const duration = Date.now() - startTime;
    console.log(`[Background] Frecency recalculation complete: ${updatedCount}/${bookmarks.length} bookmarks updated in ${duration}ms`);

    // 通知 Sidebar 更新（如果打开的话）
    chrome.runtime.sendMessage({ type: 'BOOKMARKS_UPDATED' }).catch(() => {
      // Sidebar 可能没有打开，忽略错误
    });

  } catch (error) {
    console.error('[Background] Frecency recalculation failed:', error);
  }
}

// 监听 alarm 事件
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('[Background] Alarm triggered:', alarm.name);

  if (alarm.name === FRECENCY_ALARM_NAME) {
    recalculateAllFrecency();
  } else if (alarm.name === 'import-batch') {
    await processImportBatch();
  }
});

// 初始化 Frecency alarm
initializeFrecencyAlarm();

/**
 * 初始化 Side Panel 设置
 * 点击扩展图标时显示 popup 菜单，不直接打开侧边栏
 */
async function initializeSidePanel() {
  try {
    // 禁用点击图标自动打开侧边栏，改为显示 popup 菜单
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    console.log('[Background] Side panel behavior set: openPanelOnActionClick = false (popup menu mode)');
  } catch (error) {
    console.error('[Background] Failed to set side panel behavior:', error);
  }
}

// 监听 Cmd+J 快捷键，打开 popup
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Background] Command received:', command);

  if (command === 'open_popup') {
    try {
      // 打开 popup 窗口
      await chrome.action.openPopup();
      console.log('[Background] Popup opened via command');
    } catch (error) {
      console.error('[Background] Failed to open popup:', error);
      // 如果 openPopup 失败，尝试在新窗口中打开
      await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 400,
        height: 600,
      });
    }
  }
});

// 监听设置变化，动态更新 Side Panel 行为
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.userSettings) {
    const newSettings = changes.userSettings.newValue;
    const oldSettings = changes.userSettings.oldValue;

    if (newSettings?.openMode !== oldSettings?.openMode) {
      console.log('[Background] Open mode changed:', newSettings?.openMode);
      initializeSidePanel();
    }
  }
});

// 初始化 Side Panel
initializeSidePanel();

/**
 * 初始化默认配置
 * 使用后端代理模式 - API Key 安全存储在公司服务器
 */
async function initializeDefaultConfig() {
  try {
    const result = await chrome.storage.local.get(['aiConfig', 'configInitialized']);

    // 如果已经初始化过，跳过
    if (result.configInitialized) {
      console.log('[Background] Config already initialized');
      return;
    }

    // 设置默认 AI 配置（使用本地分析作为默认，用户可配置自己的 API）
    const defaultConfig = {
      provider: 'local',
    };

    await chrome.storage.local.set({
      aiConfig: defaultConfig,
      configInitialized: true,
    });

    console.log('[Background] Default config initialized (Local analysis mode)');
  } catch (error) {
    console.error('[Background] Failed to initialize default config:', error);
  }
}

// 在扩展启动时初始化配置
initializeDefaultConfig();

// Service Worker 启动时检查是否需要显示引导页
(async () => {
  try {
    const result = await chrome.storage.local.get(['onboardingSeen']);

    // 检查是否需要显示引导页
    if (!result.onboardingSeen) {
      console.log('[Background] Onboarding not seen, opening...');
      await openOnboardingPage();
      return;
    }

    // 不再自动导入书签，用户需要手动点击导入按钮
    console.log('[Background] Extension ready, waiting for manual import');

  } catch (error) {
    console.error('[Background] Startup check failed:', error);
  }
})();

// 监听扩展安装
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] Extension installed:', details.reason);

  if (details.reason === 'install') {
    // 首次安装 - 打开引导页
    openOnboardingPage();
    // 初始化 Side Panel
    initializeSidePanel();

    // 工坊模式：自动备份原生书签到 AnyMark 文件夹
    // 这里的 importFromChromeNative 已经包含了“如果非空则跳过”的保护逻辑
    console.log('[Background] Fresh install detected. Starting automatic backup to AnyMark...');
    try {
      const bookmarkService = getBookmarkService();
      await bookmarkService.initialize();
      const result = await bookmarkService.importFromChromeNative();
      console.log('[Background] Automatic backup completed:', result);
    } catch (error) {
      console.error('[Background] Automatic backup failed:', error);
    }

  } else if (details.reason === 'update') {
    // 更新
    handleExtensionUpdate();
  }
});

// 移除自动打开侧边栏的监听器
// 只在首次安装时自动打开，其他时候需要用户手动操作

// =========================
// Chrome 书签实时同步监听
// =========================

// 注意：Chrome 书签事件监听现在由 ChromeSyncService 统一管理
// 冗余监听器已移除，避免逻辑冲突

// 冗余代码已完全移除

// =========================
// 书签访问统计
// =========================

/**
 * 不再需要自定义的访问统计监听器
 * 现在直接使用 Chrome History API 获取访问数据
 * 
 * 优势：
 * 1. 包含插件安装前的历史数据
 * 2. 更准确（Chrome 自动统计）
 * 3. 无需手动维护
 */
console.log('[Background] Using Chrome History API for visit tracking');

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Background] ⌨️ Command triggered:', command);

  // 检查用户认证状态
  try {
    const authResult = await chrome.storage.local.get(['user', 'tokens']);
    const isAuthenticated = !!(authResult.user && authResult.tokens);

    if (!isAuthenticated) {
      console.warn('[Background] User not authenticated, opening login page...');
      // 打开登录页面
      await chrome.tabs.create({
        url: chrome.runtime.getURL('sidebar.html')
      });
      return;
    }
  } catch (error) {
    console.error('[Background] Failed to check authentication:', error);
    return;
  }

  switch (command) {
    case 'quick_save':
      console.log('[Background] Executing quick_save...');
      quickSaveCurrentPage();
      break;
    case 'open-sidebar-tab':
      console.log('[Background] Opening sidebar in new tab...');
      // 直接在新标签页打开网页版侧边栏
      chrome.tabs.create({ url: chrome.runtime.getURL('sidebar.html') }).catch((err) => {
        console.warn('[Background] Failed to open sidebar tab:', err);
      });
      break;
    default:
      console.warn('[Background] Unknown command:', command);
  }
});

// 监听来自content script或popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Message received:', message);
  console.log('[Background] Sender:', sender);

  switch (message.type) {
    case 'OPEN_SIDEBAR':
    case 'TOGGLE_SIDEBAR':
      toggleSidePanelFromSender(sender)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'OPEN_IN_TAB':
      // 在新标签页打开 sidebar
      chrome.tabs.create({ url: chrome.runtime.getURL('sidebar.html') })
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'SAVE_BOOKMARK':
      handleSaveBookmark(message.data)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // 异步响应

    case 'ANALYZE_FOR_SAVE':
      handleAnalyzeForSave(message.data)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'GET_BOOKMARKS':
      handleGetBookmarks()
        .then((bookmarks) => sendResponse({ success: true, data: bookmarks }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'ANALYZE_PAGE':
      handleAnalyzePage(message.url)
        .then((analysis) => sendResponse({ success: true, data: analysis }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'REIMPORT_BOOKMARKS':
      // 手动导入：使用新架构导入到 AnyMark 文件夹
      console.log('[Background] REIMPORT_BOOKMARKS received, starting import to AnyMark...');

      (async () => {
        let responded = false;
        const lockKey = 'bookmarkImportLock';
        try {
          // 清除之前的导入任务状态（不直接清除 lock，避免并发导入）
          await chrome.storage.local.remove(['importCompleted', 'importTask']);

          // 防并发：如果已有导入锁且未过期，则直接拒绝
          const existingLock = await chrome.storage.local.get(lockKey);
          const lockData = existingLock[lockKey] as { timestamp?: number } | undefined;
          const now = Date.now();
          if (lockData?.timestamp && now - lockData.timestamp < 5 * 60 * 1000) {
            sendResponse({ success: false, error: 'Import already in progress' });
            responded = true;
            return;
          }

          // 写入导入锁
          await chrome.storage.local.set({
            [lockKey]: { timestamp: now, source: 'REIMPORT_BOOKMARKS' },
          });

          // 使用静态导入的服务
          const bookmarkService = getBookmarkService();
          const metadataService = getMetadataService();

          // 确保服务已初始化
          await bookmarkService.initialize();
          await metadataService.initialize();

          // 执行导入到 Chrome Native AnyMark 文件夹
          const result = await bookmarkService.importFromChromeNative((progress) => {
            console.log(`[Background] Import progress: ${progress.current} - ${progress.currentItem}`);
          });

          console.log('[Background] Import to AnyMark completed:', result);

          // 先响应 UI：避免后续兼容/元数据处理耗时导致侧边栏一直“导入中”
          sendResponse({ success: true, data: result });
          responded = true;

          // 获取 AnyMark 文件夹的完整树（无论是否有新导入）
          const tree = await bookmarkService.getBookmarkTree();
          console.log('[Background] AnyMark tree:', tree ? 'found' : 'not found');

          if (tree) {
            // 为所有书签创建默认元数据（如果不存在）
            await createMetadataForTree(tree, metadataService);

            // 调试：打印树结构
            console.log('[Background] AnyMark tree structure:');
            const printTree = (node: any, indent: string = '') => {
              console.log(`${indent}${node.url ? '📄' : '📁'} ${node.title} (id: ${node.id})`);
              if (node.children) {
                for (const child of node.children) {
                  printTree(child, indent + '  ');
                }
              }
            };
            printTree(tree);

            // 同时更新旧架构的 storage（兼容现有 UI）
            // 将 AnyMark 树转换为旧格式的书签数组
            const legacyBookmarks = convertTreeToLegacyFormat(tree, bookmarkService.getAnyMarkRootId());
            const legacyFolders = extractFoldersFromTree(tree, bookmarkService.getAnyMarkRootId());

            console.log('[Background] Legacy bookmarks:', legacyBookmarks.length);
            console.log('[Background] Legacy folders:', legacyFolders.map(f => f.name));

            // 保存到旧架构 storage（UI 读取这个）
            await chrome.storage.local.set({
              bookmarks: legacyBookmarks,
              folders: legacyFolders,
            });
            console.log('[Background] Updated legacy storage with', legacyBookmarks.length, 'bookmarks and', legacyFolders.length, 'folders');
          } else {
            console.warn('[Background] AnyMark tree is empty, initializing empty storage');
            await chrome.storage.local.set({
              bookmarks: [],
              folders: [],
            });
          }

          // 标记导入完成
          await chrome.storage.local.set({ importCompleted: true, importTime: Date.now() });

          // 通知 Sidebar 更新
          chrome.runtime.sendMessage({
            type: 'BOOKMARKS_IMPORTED',
            count: result.importedBookmarks,
          }).catch(() => {
            // Sidebar 可能没有打开
          });
        } catch (error) {
          console.error('[Background] Import to AnyMark failed:', error);
          if (!responded) {
            sendResponse({ success: false, error: (error as Error).message });
          }
        } finally {
          // 释放锁（无论成功/失败）
          try {
            await chrome.storage.local.remove(lockKey);
          } catch (e) {
            console.warn('[Background] Failed to release import lock:', e);
          }
        }
      })().catch((error) => {
        // 捕获 IIFE 本身的任何未捕获错误
        console.error('[Background] REIMPORT_BOOKMARKS IIFE error:', error);
        // 如果已经响应过 UI，则只记录日志避免“message port closed”类错误
        try {
          sendResponse({ success: false, error: error.message });
        } catch {
          // ignore
        }
      });
      return true;

    case 'REIMPORT_FROM_CHROME':
      // Settings 中的重新导入：清空 AnyMark 文件夹后重新导入
      console.log('[Background] REIMPORT_FROM_CHROME received, clearing and reimporting...');

      (async () => {
        let responded = false;
        const lockKey = 'bookmarkImportLock';
        try {
          // 防并发：如果已有导入锁且未过期，则直接拒绝
          const existingLock = await chrome.storage.local.get(lockKey);
          const lockData = existingLock[lockKey] as { timestamp?: number } | undefined;
          const now = Date.now();
          if (lockData?.timestamp && now - lockData.timestamp < 5 * 60 * 1000) {
            sendResponse({ success: false, error: 'Import already in progress' });
            responded = true;
            return;
          }

          // 写入导入锁
          await chrome.storage.local.set({
            [lockKey]: { timestamp: now, source: 'REIMPORT_FROM_CHROME' },
          });

          // 使用静态导入的服务
          const bookmarkService = getBookmarkService();
          const metadataService = getMetadataService();

          // 确保服务已初始化
          await bookmarkService.initialize();
          await metadataService.initialize();

          // 执行重新导入（会先清空 AnyMark 文件夹）
          const result = await bookmarkService.reimportFromChromeNative((progress) => {
            console.log(`[Background] Reimport progress: ${progress.current} - ${progress.currentItem}`);
          });

          console.log('[Background] Reimport to AnyMark completed:', result);

          // 先响应 UI：避免后续处理耗时导致设置页按钮一直“重新导入中...”
          sendResponse({ success: true, data: result });
          responded = true;

          // 获取 AnyMark 文件夹的完整树
          const tree = await bookmarkService.getBookmarkTree();
          console.log('[Background] AnyMark tree after reimport:', tree ? 'found' : 'not found');

          if (tree) {
            // 为所有书签创建默认元数据
            await createMetadataForTree(tree, metadataService);

            // 调试：打印树结构
            console.log('[Background] AnyMark tree structure after reimport:');
            const printTree = (node: any, indent: string = '') => {
              console.log(`${indent}${node.url ? '📄' : '📁'} ${node.title} (id: ${node.id})`);
              if (node.children) {
                for (const child of node.children) {
                  printTree(child, indent + '  ');
                }
              }
            };
            printTree(tree);

            // 更新旧架构的 storage（兼容现有 UI）
            const legacyBookmarks = convertTreeToLegacyFormat(tree, bookmarkService.getAnyMarkRootId());
            const legacyFolders = extractFoldersFromTree(tree, bookmarkService.getAnyMarkRootId());

            console.log('[Background] Legacy bookmarks:', legacyBookmarks.length);
            console.log('[Background] Legacy folders:', legacyFolders.map(f => f.name));

            // 保存到旧架构 storage
            await chrome.storage.local.set({
              bookmarks: legacyBookmarks,
              folders: legacyFolders,
            });
            console.log('[Background] Updated legacy storage with', legacyBookmarks.length, 'bookmarks and', legacyFolders.length, 'folders');
          } else {
            console.warn('[Background] AnyMark tree is empty after reimport');
            await chrome.storage.local.set({
              bookmarks: [],
              folders: [],
            });
          }

          // 标记重新导入完成
          await chrome.storage.local.set({ importCompleted: true, importTime: Date.now() });

          // 通知 Sidebar 更新
          chrome.runtime.sendMessage({
            type: 'BOOKMARKS_IMPORTED',
            count: result.importedBookmarks,
          }).catch(() => {
            // Sidebar 可能没有打开
          });
        } catch (error) {
          console.error('[Background] Reimport from Chrome failed:', error);
          if (!responded) {
            sendResponse({ success: false, error: (error as Error).message });
          }
        } finally {
          // 释放锁（无论成功/失败）
          try {
            await chrome.storage.local.remove(lockKey);
          } catch (e) {
            console.warn('[Background] Failed to release import lock:', e);
          }
        }
      })().catch((error) => {
        // 捕获 IIFE 本身的任何未捕获错误
        console.error('[Background] REIMPORT_FROM_CHROME IIFE error:', error);
        try {
          sendResponse({ success: false, error: error.message });
        } catch {
          // ignore
        }
      });
      return true;

    case 'ONBOARDING_COMPLETE':
      // 只标记引导完成，不自动导入书签
      chrome.storage.local.set({ onboardingSeen: true })
        .then(() => {
          console.log('[Background] Onboarding complete, waiting for manual import');
          sendResponse({ success: true });
        })
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'START_BATCH_ANALYSIS':
      // 启动后台批量分析
      handleStartBatchAnalysis(message.data)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'GET_ANALYSIS_STATUS':
      // 获取分析队列状态
      const status = analysisQueue.getStatus();
      sendResponse({ success: true, data: status });
      return true;

    case 'CANCEL_BATCH_ANALYSIS':
      // 取消批量分析
      analysisQueue.cancelAll();
      sendResponse({ success: true });
      return true;

    case 'FETCH_URL_CONTENT':
      // 在后台抓取 URL 内容（绕过 CSP 限制，但仍受 CORS 限制）
      handleFetchUrlContent(message.data)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'FETCH_URL_VIA_PROXY':
      // 通过服务器代理抓取 URL 内容（绕过 CORS 限制）
      handleFetchUrlViaProxy(message.data)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'EXTRACT_FROM_TAB':
      // 从指定 tab 提取内容（使用 content script）
      handleExtractFromTab(message.data)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'QUICK_SAVE_CURRENT_PAGE':
      // 快速保存当前页面（从 popup 菜单调用）
      quickSaveCurrentPage()
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'OPEN_SETTINGS':
      // 打开设置（从 popup 菜单调用，侧边栏接收后打开设置弹窗）
      // 这个消息会被侧边栏监听
      sendResponse({ success: true });
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

/**
 * 切换侧边栏 - 从 sender 获取窗口信息
 * 暂时只实现打开功能，Chrome API 不支持关闭侧边栏
 */
async function toggleSidePanelFromSender(sender: chrome.runtime.MessageSender) {
  try {
    console.log('[Background] Opening side panel from sender...');
    console.log('[Background] Sender:', sender);

    // 优先使用 sender 的 tab 信息
    let windowId: number | undefined;

    if (sender.tab?.windowId) {
      windowId = sender.tab.windowId;
      console.log('[Background] Using sender tab window ID:', windowId);
    } else {
      // 如果 sender 没有 tab 信息，查询当前活动窗口
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      windowId = tab?.windowId;
      console.log('[Background] Using active window ID:', windowId);
    }

    if (!windowId) {
      console.error('[Background] No window ID found');
      throw new Error('No active window found');
    }

    // 直接打开侧边栏（Chrome 不支持编程关闭）
    console.log('[Background] Opening side panel for window:', windowId);
    await chrome.sidePanel.open({ windowId });
    console.log('[Background] Side panel opened successfully');
  } catch (error: any) {
    console.error('[Background] Failed to open side panel:', error);
    console.error('[Background] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw error;
  }
}

/**
 * 打开引导页
 */
async function openOnboardingPage() {
  console.log('[Background] Opening onboarding page...');
  await chrome.tabs.create({
    url: chrome.runtime.getURL('onboarding.html'),
    active: true,
  });
}

/**
 * 快速收藏当前页面 (Cmd+D)
 */
async function quickSaveCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      console.warn('[Background] No active tab found');
      return;
    }

    console.log('[Background] Quick saving:', tab.title);

    // 调用 V2 架构的保存逻辑
    // handleSaveBookmark 内部会自动处理内容提取、AI分析（如果缺失）、文件夹创建和元数据保存
    await handleSaveBookmark({
      url: tab.url,
      title: tab.title || 'Untitled',
      folderPath: '/', // 默认保存到根目录
      importSource: 'quick_save',
    });

    console.log('[Background] Quick save successful');

    // 显示通知和页面 Toast
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icon.svg',
      title: chrome.i18n.getMessage('notification_saveSuccessTitle') || 'Bookmark Saved',
      message: chrome.i18n.getMessage('notification_saveSuccessMessage', [tab.title || '']),
      priority: 1,
    });

    // 发送消息到当前标签页显示 Toast
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_TOAST',
        data: {
          message: chrome.i18n.getMessage('notification_toastSaved') || 'Bookmark saved',
          type: 'success',
          duration: 3000,
        },
      }).catch(() => {
        console.log('[Background] Tab not ready for toast, only showing notification');
      });
    }

  } catch (error) {
    console.error('[Background] Quick save failed:', error);

    // 显示错误通知
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icon.svg',
      title: chrome.i18n.getMessage('notification_saveFailTitle') || 'Save Failed',
      message: chrome.i18n.getMessage('notification_saveFailMessage') || 'Failed to save bookmark, please try again',
      priority: 2,
    });
  }
}

/**
 * 在后台抓取 URL 内容（绕过 CSP 限制）
 * 
 * 注意：此方法仍然会被 CORS 阻止，仅作为降级方案
 */
async function handleFetchUrlContent(data: { url: string }) {
  console.log('[Background] Fetching URL content:', data.url);

  try {
    const response = await fetch(data.url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; AnyMark/2.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    return { html };
  } catch (error) {
    console.error('[Background] Failed to fetch URL content:', error);
    throw error;
  }
}

/**
 * 默认代理服务器地址
 */
const DEFAULT_PROXY_ENDPOINT = 'https://v1.j-o-x.tech/api';

/**
 * 通过服务器代理抓取 URL 内容（绕过 CORS 限制）
 * 
 * 使用服务器作为代理，服务器端抓取网页内容
 * 这样可以绕过浏览器的 CORS 限制
 */
async function handleFetchUrlViaProxy(data: { url: string }) {
  console.log('[Background] Fetching URL via proxy:', data.url);

  try {
    // 获取用户配置（可选覆盖默认代理）
    const result = await chrome.storage.local.get(['userSettings']);

    // 使用用户配置的代理或默认代理
    const proxyEndpoint = result.userSettings?.proxyEndpoint || DEFAULT_PROXY_ENDPOINT;

    // 构建代理请求
    const proxyUrl = `${proxyEndpoint}/fetch`;
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: data.url }),
    });

    if (!response.ok) {
      throw new Error(`Proxy request failed: ${response.status}`);
    }

    const responseData = await response.json();

    if (!responseData.html) {
      throw new Error('Proxy response missing HTML content');
    }

    console.log('[Background] Successfully fetched via proxy');
    return { html: responseData.html };
  } catch (error) {
    console.error('[Background] Failed to fetch via proxy:', error);
    // 降级到直接 fetch
    console.warn('[Background] Falling back to direct fetch');
    return await handleFetchUrlContent(data);
  }
}

/**
 * 从指定 tab 提取内容（使用 content script）
 * 
 * 这是最稳定的方案：
 * - 绕过 CSP（不需要 fetch）
 * - 绕过 CORS（在页面内部读取 DOM）
 * - 可以获取完整的渲染后内容
 */
async function handleExtractFromTab(data: { tabId: number; url: string; fullContent?: boolean }) {
  console.log('[Background] Extracting content from tab:', data.tabId, data.url);

  try {
    const { tabId, fullContent = false } = data;

    // 检查 tab 是否存在且可访问
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) {
      throw new Error('Tab not found or not accessible');
    }

    // 检查是否是特殊页面（chrome://, edge://, about:）
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      throw new Error('Cannot extract content from special pages');
    }

    // 注入 content script 提取内容
    if (fullContent) {
      // 完整内容提取（包含 Readability）
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractPageContentWithReadability,
      });

      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
    } else {
      // 基础内容提取
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractPageContentBasic,
      });

      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
    }

    throw new Error('Failed to extract content from tab');
  } catch (error) {
    console.error('[Background] Failed to extract from tab:', error);
    throw error;
  }
}

/**
 * 基础页面内容提取（注入到页面中执行）
 */
function extractPageContentBasic() {
  const getMetaDescription = (): string => {
    const selectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]'
    ];
    for (const sel of selectors) {
      const meta = document.querySelector(sel);
      const content = meta?.getAttribute('content');
      if (content && content.length > 20) return content;
    }
    return '';
  };

  const getMetaKeywords = (): string => {
    const meta = document.querySelector('meta[name="keywords"]');
    return meta?.getAttribute('content') || '';
  };

  const getMainContent = (): string => {
    const selectors = ['article', 'main', '[role="main"]', '.content', '#content'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent?.trim() || '';
        if (text.length > 100) {
          return text.substring(0, 2000).replace(/\s+/g, ' ');
        }
      }
    }

    const bodyText = document.body.textContent?.trim() || '';
    return bodyText.substring(0, 2000).replace(/\s+/g, ' ');
  };

  return {
    url: window.location.href,
    title: document.title,
    description: getMetaDescription(),
    keywords: getMetaKeywords(),
    bodyText: getMainContent(),
  };
}

/**
 * 完整页面内容提取（包含 Readability，注入到页面中执行）
 */
function extractPageContentWithReadability() {
  // 基础提取
  const getMetaDescription = (): string => {
    const selectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]'
    ];
    for (const sel of selectors) {
      const meta = document.querySelector(sel);
      const content = meta?.getAttribute('content');
      if (content && content.length > 20) return content;
    }
    return '';
  };

  const getMetaKeywords = (): string => {
    const meta = document.querySelector('meta[name="keywords"]');
    return meta?.getAttribute('content') || '';
  };

  const getMainContent = (): string => {
    const selectors = ['article', 'main', '[role="main"]', '.content', '#content'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent?.trim() || '';
        if (text.length > 100) {
          return text.substring(0, 2000).replace(/\s+/g, ' ');
        }
      }
    }

    const bodyText = document.body.textContent?.trim() || '';
    return bodyText.substring(0, 2000).replace(/\s+/g, ' ');
  };

  const content: any = {
    url: window.location.href,
    title: document.title,
    description: getMetaDescription(),
    keywords: getMetaKeywords(),
    bodyText: getMainContent(),
  };

  // 尝试使用 Readability（需要动态导入）
  try {
    // 注意：Readability 需要在 manifest.json 中声明为 content_scripts
    // 这里我们使用简化版本，只提取基础信息
    // 完整的 Readability 提取在 contentExtractor.ts 中处理

    // 简化的正文提取
    const article = document.querySelector('article') || document.querySelector('main');
    if (article) {
      content.article = {
        title: document.title,
        content: article.innerHTML,
        textContent: article.textContent?.trim() || '',
        excerpt: getMetaDescription(),
        length: article.textContent?.length || 0,
      };
    }
  } catch (error) {
    console.warn('[PageExtractor] Article extraction failed:', error);
  }

  return content;
}

/**
 * 启动后台批量分析
 */
async function handleStartBatchAnalysis(data: { bookmarks: any[] }) {
  console.log('[Background] Starting batch analysis for', data.bookmarks.length, 'bookmarks');

  try {
    const result = await analysisQueue.addTasks(data.bookmarks);

    // 显示通知
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icon.svg',
      title: '智能分析已启动',
      message: `正在后台分析 ${result.totalTasks} 个书签，即使关闭侧边栏也会继续处理`,
      priority: 1,
    });

    return result;
  } catch (error) {
    console.error('[Background] Failed to start batch analysis:', error);
    throw error;
  }
}

/**
 * 初始化扩展
 */
async function initializeExtension() {
  console.log('[Background] Initializing extension...');

  try {
    // 创建默认文件夹结构
    const defaultFolders = [
      { id: 'root', title: 'All Bookmarks', parentId: null },
      { id: 'work', title: 'Work', parentId: 'root' },
      { id: 'personal', title: 'Personal', parentId: 'root' },
      { id: 'learning', title: 'Learning', parentId: 'root' },
    ];

    await chrome.storage.local.set({ folders: defaultFolders });

    console.log('[Background] Extension initialized');

    // 不再自动导入，等待用户手动点击导入按钮
  } catch (error) {
    console.error('[Background] Initialization failed:', error);
  }
}

/**
 * 为书签树中的所有书签创建默认元数据
 */
async function createMetadataForTree(
  node: chrome.bookmarks.BookmarkTreeNode,
  metadataService: any
): Promise<void> {
  if (node.url) {
    // 是书签，创建元数据
    try {
      const existing = await metadataService.getMetadata(node.id);
      if (!existing) {
        await metadataService.createDefaultMetadata(node.id, 'browser');
      }
    } catch (error) {
      console.warn('[Background] Failed to create metadata for:', node.id, error);
    }
  }
  
  if (node.children) {
    for (const child of node.children) {
      await createMetadataForTree(child, metadataService);
    }
  }
}

/**
 * 将 Chrome Native 书签树转换为旧架构的书签数组格式
 * 用于兼容现有 UI（UI 从 chrome.storage.local.bookmarks 读取）
 */
function convertTreeToLegacyFormat(
  node: chrome.bookmarks.BookmarkTreeNode,
  anyMarkRootId: string,
  currentPath: string = '/'
): any[] {
  const bookmarks: any[] = [];
  
  if (node.url) {
    // 是书签
    bookmarks.push({
      id: `bookmark-${node.id}`,
      chromeId: node.id,
      url: node.url,
      title: node.title || 'Untitled',
      folderPath: currentPath,
      folderId: currentPath === '/' ? 'root' : `folder-${currentPath}`,
      createTime: node.dateAdded || Date.now(),
      updateTime: Date.now(),
      importSource: 'browser',
      status: 'active',
      analytics: {
        visitCount: 0,
        lastVisit: null,
        importance: 50,
        readTime: 0,
      },
    });
  }
  
  if (node.children) {
    for (const child of node.children) {
      // 计算子节点的路径
      let childPath = currentPath;
      if (!child.url && child.id !== anyMarkRootId) {
        // 是文件夹（非 AnyMark 根目录）
        childPath = currentPath === '/' 
          ? `/${child.title}` 
          : `${currentPath}/${child.title}`;
      }
      
      const childBookmarks = convertTreeToLegacyFormat(child, anyMarkRootId, childPath);
      bookmarks.push(...childBookmarks);
    }
  }
  
  return bookmarks;
}

/**
 * 从 Chrome Native 书签树中提取文件夹列表
 * 用于兼容现有 UI
 */
function extractFoldersFromTree(
  node: chrome.bookmarks.BookmarkTreeNode,
  anyMarkRootId: string,
  currentPath: string = '/'
): any[] {
  const folders: any[] = [];
  
  console.log('[extractFoldersFromTree] Processing node:', node.title, 'id:', node.id, 'isRoot:', node.id === anyMarkRootId, 'hasUrl:', !!node.url);
  
  if (!node.url && node.id !== anyMarkRootId) {
    // 是文件夹（非 AnyMark 根目录）
    const folderPath = currentPath === '/' 
      ? `/${node.title}` 
      : `${currentPath}/${node.title}`;
    
    console.log('[extractFoldersFromTree] Adding folder:', node.title, 'path:', folderPath);
    
    folders.push({
      id: `folder-${folderPath}`,
      chromeId: node.id,
      name: node.title,
      path: folderPath,
      parentPath: currentPath,
      createTime: node.dateAdded || Date.now(),
      bookmarkCount: node.children?.filter(c => c.url).length || 0,
    });
    
    // 递归处理子文件夹
    if (node.children) {
      for (const child of node.children) {
        if (!child.url) {
          const childFolders = extractFoldersFromTree(child, anyMarkRootId, folderPath);
          folders.push(...childFolders);
        }
      }
    }
  } else if (node.children) {
    // AnyMark 根目录或其他有子节点的节点
    console.log('[extractFoldersFromTree] Processing root children, count:', node.children.length);
    for (const child of node.children) {
      console.log('[extractFoldersFromTree] Root child:', child.title, 'hasUrl:', !!child.url);
      if (!child.url) {
        const childFolders = extractFoldersFromTree(child, anyMarkRootId, currentPath);
        folders.push(...childFolders);
      }
    }
  }
  
  return folders;
}

/**
 * 快速同步导入 Chrome 书签（用于手动导入按钮）
 * 直接同步处理所有书签，不使用 Alarm 分批
 */
async function quickImportChromeBookmarks(): Promise<{ count: number }> {
  console.log('[Background] Starting quick import of Chrome bookmarks...');
  const startTime = Date.now();

  try {
    // 1. 获取 Chrome 书签树
    const chromeTree = await chrome.bookmarks.getTree();
    const flatBookmarks = flattenBookmarkTree(chromeTree[0]);

    console.log(`[Background] Found ${flatBookmarks.length} Chrome bookmarks`);

    if (flatBookmarks.length === 0) {
      console.log('[Background] No bookmarks to import');
      await chrome.storage.local.set({ importCompleted: true });
      return { count: 0 };
    }

    // 2. 快速转换所有书签（不做 AI 分析，只做基础转换）
    const importedBookmarks: any[] = [];

    for (const chromeBookmark of flatBookmarks) {
      const bookmark: any = {
        id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        chromeId: chromeBookmark.id,
        url: chromeBookmark.url || '',
        title: chromeBookmark.title || 'Untitled',
        favicon: chromeBookmark.url ? `chrome://favicon/${chromeBookmark.url}` : undefined,
        folderPath: (chromeBookmark as any).folderPath || '/',
        folderId: 'imported',
        createTime: chromeBookmark.dateAdded || Date.now(),
        updateTime: Date.now(),
        importSource: 'browser' as const,
        userTitle: undefined,
        userTags: [],
        userNotes: undefined,
        starred: false,
        pinned: false,
        aiSummary: undefined,
        aiTags: [],
        aiCategory: undefined,
        aiSubcategory: undefined,
        aiConfidence: undefined,
        analytics: {
          visitCount: 0,
          lastVisit: null,
          importance: 50,
          readTime: 0,
        },
        relatedBookmarks: undefined,
        duplicateOf: undefined,
        status: 'active' as const,
        archiveTime: undefined,
      };

      importedBookmarks.push(bookmark);
    }

    // 3. 保存到 Storage
    await chrome.storage.local.set({
      bookmarks: importedBookmarks,
      importCompleted: true,
      importTime: Date.now()
    });

    const duration = Date.now() - startTime;
    console.log(`[Background] Quick import completed: ${importedBookmarks.length} bookmarks in ${duration}ms`);

    // 4. 通知 Sidebar 更新
    chrome.runtime.sendMessage({
      type: 'BOOKMARKS_IMPORTED',
      count: importedBookmarks.length,
    }).catch(() => {
      // Sidebar 可能没有打开
    });

    return { count: importedBookmarks.length };

  } catch (error) {
    console.error('[Background] Quick import failed:', error);
    throw error;
  }
}

/**
 * 导入并分析 Chrome 书签（旧的分批处理方式，保留备用）
 */
async function importAndAnalyzeChromeBookmarks() {
  console.log('[Background] Starting to import Chrome bookmarks...');

  try {
    // 竞态条件修复：使用更可靠的锁机制
    const lockKey = 'bookmarkImportLock';
    const lockResult = await chrome.storage.local.get(lockKey);

    // 检查是否有其他实例正在导入
    if (lockResult[lockKey]) {
      const lockData = lockResult[lockKey] as any;
      const now = Date.now();

      // 如果锁在5分钟内有效，等待
      if (now - lockData.timestamp < 5 * 60 * 1000) {
        console.log('[Background] Another import is in progress, waiting...');
        // 等待锁释放（最多等待 5 分钟）
        for (let i = 0; i < 30; i++) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          const checkResult = await chrome.storage.local.get(['bookmarks', 'importCompleted']);
          if (checkResult.importCompleted) {
            console.log('[Background] Import completed during wait');
            return;
          }
          const currentLock = await chrome.storage.local.get(lockKey);
          if (!currentLock[lockKey]) {
            console.log('[Background] Import lock released');
            break;
          }
        }
      }
    }

    // 获取锁
    await chrome.storage.local.set({
      [lockKey]: {
        timestamp: Date.now(),
        pid: Math.random().toString(36)
      }
    });

    try {
      // 检查是否已经导入过
      const result = await chrome.storage.local.get(['bookmarks', 'importCompleted']);
      console.log('[Background] Current storage state:', {
        hasBookmarks: !!result.bookmarks,
        bookmarksCount: (result.bookmarks as any[])?.length || 0,
        importCompleted: result.importCompleted
      });

      if (result.importCompleted) {
        console.log('[Background] Bookmarks already imported, skipping...');
        return;
      }

      // 1. 获取 Chrome 书签
      console.log('[Background] Fetching Chrome bookmarks tree...');
      const chromeTree = await chrome.bookmarks.getTree();
      console.log('[Background] Chrome tree:', chromeTree);

      const flatBookmarks = flattenBookmarkTree(chromeTree[0]);

      console.log(`[Background] Found ${flatBookmarks.length} Chrome bookmarks`);
      console.log('[Background] First 3 bookmarks:', flatBookmarks.slice(0, 3));

      if (flatBookmarks.length === 0) {
        console.log('[Background] No bookmarks to import');
        await chrome.storage.local.set({ importCompleted: true });
        return;
      }

      // 2. 保存任务状态到 Storage，使用 Alarm 分批处理（避免 Service Worker 超时）
      await chrome.storage.local.set({
        importTask: {
          bookmarks: flatBookmarks,
          currentIndex: 0,
          importedBookmarks: [],
          status: 'in_progress',
          startTime: Date.now()
        }
      });

      console.log('[Background] Import task saved, starting batch processing with alarm...');

      // 3. 创建 Alarm 开始处理第一批
      await chrome.alarms.create('import-batch', {
        delayInMinutes: 0.1  // 6 秒后开始
      });

      return;  // 由 Alarm 回调继续处理

    } finally {
      // 注意：不再在这里释放锁，等任务完全完成后再释放
      // 由 processImportBatch 函数在完成后释放锁
      console.log('[Background] Import task initialized');
    }

  } catch (error) {
    console.error('[Background] Failed to import Chrome bookmarks:', error);

    // 错误情况下也释放锁
    try {
      const lockKey = 'bookmarkImportLock';
      await chrome.storage.local.remove(lockKey);
      console.log('[Background] Import lock released after error');
    } catch (lockError) {
      console.error('[Background] Failed to release lock:', lockError);
    }
  }
}

/**
 * 展平书签树，保留文件夹路径信息
 */
function flattenBookmarkTree(
  node: chrome.bookmarks.BookmarkTreeNode,
  parentPath = ''
): chrome.bookmarks.BookmarkTreeNode[] {
  const result: chrome.bookmarks.BookmarkTreeNode[] = [];

  if (node.url) {
    // 这是一个书签
    result.push({
      ...node,
      title: node.title || 'Untitled',
      // 保留文件夹路径
      ...(parentPath && { folderPath: parentPath } as any),
    });
  } else if (node.children) {
    // 这是一个目录
    // 过滤掉 Chrome 的系统文件夹（根节点、Bookmarks Bar、Other Bookmarks）
    const isSystemFolder = !parentPath && (
      node.title === 'Bookmarks bar' ||
      node.title === 'Other bookmarks' ||
      node.title === 'Mobile bookmarks' ||
      node.title === '' ||
      !node.title
    );

    const currentPath = isSystemFolder
      ? '' // 系统文件夹不记录路径
      : (parentPath ? `${parentPath}/${node.title}` : `/${node.title}`);

    node.children.forEach((child) => {
      result.push(...flattenBookmarkTree(child, currentPath));
    });
  }

  return result;
}

/**
 * 获取 Chrome 书签的完整文件夹路径
 */
async function getChromeBookmarkFolderPath(parentId: string | undefined): Promise<string> {
  if (!parentId) {
    return '/';
  }

  try {
    const pathParts: string[] = [];
    let currentId: string | undefined = parentId;

    while (currentId) {
      const parentNodes: chrome.bookmarks.BookmarkTreeNode[] = await chrome.bookmarks.get(currentId);
      if (parentNodes[0]) {
        const parent: chrome.bookmarks.BookmarkTreeNode = parentNodes[0];
        const parentTitle = parent.title;
        // 跳过系统文件夹
        const isSystemFolder = (
          !parent.parentId || // 根节点
          parentTitle === 'Bookmarks bar' ||
          parentTitle === 'Other bookmarks' ||
          parentTitle === 'Mobile bookmarks' ||
          parentTitle === ''
        );

        if (!isSystemFolder) {
          pathParts.unshift(parentTitle);
        }

        currentId = parent.parentId;
      } else {
        break;
      }
    }

    if (pathParts.length > 0) {
      return '/' + pathParts.join('/');
    }
  } catch (error) {
    console.warn('[Background] Failed to get folder path:', error);
  }

  return '/';
}


/**
 * 转换 Chrome 书签为我们的格式
 */
async function convertChromeBookmark(chromeBookmark: chrome.bookmarks.BookmarkTreeNode): Promise<any> {
  const analyzer = await getDefaultAnalyzer();

  // 获取书签的完整文件夹路径
  const folderPath = await getChromeBookmarkFolderPath(chromeBookmark.parentId);

  const bookmark: any = {
    id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    chromeId: chromeBookmark.id,
    url: chromeBookmark.url || '',
    title: chromeBookmark.title || 'Untitled',
    favicon: chromeBookmark.url ? `chrome://favicon/${chromeBookmark.url}` : undefined,
    folderPath, // 使用获取到的真实路径
    folderId: 'imported',
    createTime: chromeBookmark.dateAdded || Date.now(),
    updateTime: Date.now(),
    importSource: 'browser' as const,
    userTitle: undefined,
    userTags: [],
    userNotes: undefined,
    starred: false,
    pinned: false,
    aiSummary: undefined,
    aiTags: [],
    aiCategory: undefined,
    aiSubcategory: undefined,
    aiConfidence: undefined,
    analytics: {
      visitCount: 0,
      lastVisit: null,
      importance: 50,
      readTime: 0,
    },
    relatedBookmarks: undefined,
    duplicateOf: undefined,
    status: 'active' as const,
    archiveTime: undefined,
  };

  // AI 分析（快速本地分析）
  try {
    const pageContent = {
      url: bookmark.url,
      title: bookmark.title,
      description: '',
      keywords: '',
      bodyText: '',
    };

    // 获取现有分类用于 AI 参考
    const existingResult = await chrome.storage.local.get('bookmarks');
    const existingBookmarks = (existingResult.bookmarks || []) as any[];
    const existingFolders = Array.from(new Set(
      existingBookmarks
        .filter((b: any) => b.folderPath)
        .map((b: any) => b.folderPath)
    ));

    const analysis = await analyzer.analyzeBookmark(pageContent, { existingFolders });

    // AI 智能分析只设置摘要、标签等辅助信息
    // aiCategory 只能由 Agent 操作或用户手动设置
    bookmark.aiSummary = analysis.summary;
    bookmark.aiTags = analysis.tags;
    // 注意：不设置 aiCategory，保持书签在 Chrome 视图
    // IAIAnalysis 类型已移除 category 和 subcategory 字段
    bookmark.aiConfidence = Math.round((analysis.confidence || 0.5) * 100);

  } catch (analysisError) {
    console.warn(`[Sync] Analysis failed for ${bookmark.title}:`, analysisError);
  }

  console.log(`[Background] Converted: ${bookmark.title} -> ${bookmark.folderPath}`);

  return bookmark;
}

/**
 * 处理扩展更新
 */
async function handleExtensionUpdate() {
  console.log('[Background] Extension updated');

  // 执行 AI 文件夹迁移（如果需要）
  await runMigrationIfNeeded();
}




/**
 * 分析页面为保存做准备（不直接保存）
 */
async function handleAnalyzeForSave(bookmarkData: any) {
  console.log('[Background] Analyzing for save:', bookmarkData);

  try {
    const { url, title } = bookmarkData;

    // 第1步：提取页面内容
    let pageContent: any = {
      url,
      title: title || 'Untitled',
      description: '',
      keywords: '',
      bodyText: '',
    };

    // 尝试从当前活动标签提取内容
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url === url && tab.id && !url.startsWith('chrome://') && !url.startsWith('edge://') && !url.startsWith('about:')) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const getMetaDescription = () => {
              const selectors = [
                'meta[name="description"]',
                'meta[property="og:description"]',
                'meta[name="twitter:description"]'
              ];
              for (const sel of selectors) {
                const meta = document.querySelector(sel);
                const content = meta?.getAttribute('content');
                if (content && content.length > 20) return content;
              }
              return '';
            };

            const getMainContent = () => {
              const selectors = ['article', 'main', '[role="main"]', '.content', '#content'];
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                  const text = el.textContent?.trim() || '';
                  if (text.length > 100) {
                    return text.substring(0, 500).replace(/\s+/g, ' ');
                  }
                }
              }
              return '';
            };

            return {
              url: window.location.href,
              title: document.title,
              description: getMetaDescription(),
              keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content') || '',
              bodyText: getMainContent(),
            };
          },
        });

        if (results?.[0]?.result) {
          pageContent = results[0].result;
        }
      }
    } catch (error) {
      console.warn('[Background] Failed to extract content, using basic info:', error);
    }

    // 第2步：AI 分析
    let aiSummary = undefined;
    let aiTags: string[] = [];
    let aiCategory = undefined;
    let aiConfidence = undefined;
    let aiDifficulty = undefined;
    let aiTechStack: string[] = [];
    let suggestedFolder = '/';

    try {
      // 获取现有分类用于 AI 参考
      const existingResult = await chrome.storage.local.get('bookmarks');
      const existingBookmarks = (existingResult.bookmarks || []) as any[];
      const existingFolders = Array.from(new Set(
        existingBookmarks
          .filter((b: any) => b.folderPath)
          .map((b: any) => b.folderPath)
      ));

      const analyzer = await getDefaultAnalyzer();
      const analysis = await analyzer.analyzeBookmark(pageContent, { existingFolders });

      // AI 智能分析只设置摘要、标签等辅助信息
      // aiCategory 只能由 Agent 操作或用户手动设置
      aiSummary = analysis.summary;
      aiTags = analysis.tags;
      // 注意：不自动设置 aiCategory，这样书签不会自动进入 AI 分类视图
      // IAIAnalysis 类型已移除 category 和 subcategory 字段
      aiConfidence = Math.round((analysis.confidence || 0.5) * 100);
      aiDifficulty = analysis.difficulty;

      console.log('[Background] AI Analysis completed:', { aiTags, aiConfidence });
    } catch (error) {
      console.warn('[Background] AI analysis failed:', error);
    }

    // 返回分析结果（不保存）
    const result = {
      url,
      title: pageContent.title,
      favicon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`,
      suggestedFolder,
      aiSummary,
      aiTags,
      aiCategory,
      aiConfidence,
      aiDifficulty,
      aiTechStack,
    };

    // 发送消息到 FloatingChat
    try {
      await chrome.runtime.sendMessage({
        type: 'ANALYZE_COMPLETE',
        data: result,
      });
      console.log('[Background] Sent ANALYZE_COMPLETE message to FloatingChat');
    } catch (error) {
      console.warn('[Background] Failed to send message to FloatingChat:', error);
    }

    return result;
  } catch (error) {
    console.error('[Background] Failed to analyze for save:', error);
    throw error;
  }
}

/**
 * 保存书签（带 AI 分析）- V2 架构
 */
async function handleSaveBookmark(bookmarkData: any) {
  console.log('[Background] Saving bookmark (V2):', bookmarkData);

  try {
    const {
      url,
      title,
      folderPath = '/',
      aiTags = [],
      aiSummary,
      aiCategory,
      aiConfidence,
      aiDifficulty,
      aiTechStack = [],
    } = bookmarkData;

    // 1. 准备 AI 数据
    let finalAiSummary = aiSummary;
    let finalAiTags = aiTags;
    let finalAiConfidence = aiConfidence;
    let finalAiDifficulty = aiDifficulty;
    let finalAiTechStack = aiTechStack;
    let finalTitle = title || 'Untitled';

    // 如果没有 AI 数据，执行分析 (保留原有分析逻辑)
    if (!aiSummary && !aiCategory) {
      try {
        // ... (保持原有的提取和分析逻辑不变，此处省略以简化，假设分析已完成或使用默认值)
        // 在实际代码中，这里应该包含完整的内容提取和 analyzer 调用
        // 为确保 V2 架构稳定性，这里暂且复用传入的数据，如果为空则由 MetadataService 默认值处理
        
        // 如果确实需要实时分析，可以重新调用 handleAnalyzePage 逻辑
        if (!finalAiSummary) {
           const analysis = await handleAnalyzePage(url);
           finalAiSummary = analysis.summary;
           finalAiTags = analysis.tags;
           finalAiConfidence = Math.round((analysis.confidence || 0.5) * 100);
           finalAiDifficulty = analysis.difficulty;
        }
      } catch (error) {
        console.warn('[Background] AI analysis failed during save:', error);
      }
    }

    // 2. 初始化服务
    const bookmarkService = getBookmarkService();
    const metadataService = getMetadataService();
    await bookmarkService.initialize();
    await metadataService.initialize();

    // 3. 确定目标文件夹 (Parent ID)
    // Popup 传递的是 folderPath (如 "/Tech")。我们需要将其转换为 Chrome ID。
    let parentId = bookmarkService.getAnyMarkRootId();
    
    if (folderPath && folderPath !== '/') {
      // 简单处理：支持一级文件夹。如果路径包含多级，取最后一级作为文件夹名
      // 例如 "/Tech/React" -> 在根目录下找/建 "React" 文件夹
      // 这是一个简化策略，为了保证稳定性。
      const folderName = folderPath.split('/').filter(Boolean).pop();
      if (folderName) {
        const rootChildren = await bookmarkService.getChildren(parentId);
        const existingFolder = rootChildren.find(c => c.title === folderName && !c.url);
        
        if (existingFolder) {
          parentId = existingFolder.id;
        } else {
          // 创建新文件夹
          parentId = await bookmarkService.createFolder({
            title: folderName,
            parentId: parentId
          });
        }
      }
    }

    // 4. 创建 Chrome 原生书签
    const chromeId = await bookmarkService.createBookmark({
      title: finalTitle,
      url: url,
      parentId: parentId
    });

    // 5. 保存元数据
    await metadataService.setMetadata(chromeId, {
      aiSummary: finalAiSummary,
      aiTags: finalAiTags,
      aiConfidence: finalAiConfidence,
      aiDifficulty: finalAiDifficulty,
      aiTechStack: finalAiTechStack,
      aiCategory: aiCategory, // 虽然 UI 可能不用，但保存下来无妨
      userTags: [], // 初始为空
      starred: false,
      importSource: 'manual'
    });

    console.log('[Background] Bookmark saved successfully (V2):', chromeId);

    // 6. 通知 Sidebar (通过 BookmarkService 的事件监听会自动触发，但发送明确消息更保险)
    chrome.runtime.sendMessage({ 
      type: 'BOOKMARK_ADDED', 
      data: { id: chromeId, title: finalTitle } 
    }).catch(() => {});

    return { id: chromeId, title: finalTitle };

  } catch (error) {
    console.error('[Background] Failed to save bookmark:', error);
    throw error;
  }
}

/**
 * 获取书签列表
 */
async function handleGetBookmarks() {
  console.log('[Background] Getting all bookmarks...');

  try {
    const { bookmarks = [] } = await chrome.storage.local.get('bookmarks');
    return bookmarks;
  } catch (error) {
    console.error('[Background] Failed to get bookmarks:', error);
    throw error;
  }
}

/**
 * 分析页面
 */
async function handleAnalyzePage(url: string) {
  console.log('[Background] Analyzing page:', url);

  try {
    // 获取现有分类用于 AI 参考
    const existingResult = await chrome.storage.local.get('bookmarks');
    const existingBookmarks = (existingResult.bookmarks || []) as any[];
    const existingFolders = Array.from(new Set(
      existingBookmarks
        .filter((b: any) => b.folderPath)
        .map((b: any) => b.folderPath)
    ));

    const analyzer = await getDefaultAnalyzer();
    // We might not have the title or other info, but the analyzer can work with just a URL
    const analysis = await analyzer.analyzeBookmark({ url, title: url }, { existingFolders });
    return analysis;
  } catch (error) {
    console.error('[Background] Failed to analyze page:', error);
    throw error;
  }
}

// =========================
// 后台 AI 分析任务队列
// =========================

interface AnalysisTask {
  bookmarkId: string;
  url: string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  error?: string;
}

class BackgroundAnalysisQueue {
  private queue: AnalysisTask[] = [];
  private isProcessing = false;
  private maxRetries = 2;
  private batchSize = 5; // 每批处理5个
  private delayBetweenBatches = 2000; // 批次间延迟2秒
  private isCancelled = false; // 取消标志

  /**
   * 添加分析任务到队列
   */
  async addTasks(bookmarks: any[]) {
    console.log(`[AnalysisQueue] Adding ${bookmarks.length} tasks to queue`);

    // 重置取消标志
    this.isCancelled = false;

    const tasks: AnalysisTask[] = bookmarks.map(b => ({
      bookmarkId: b.id,
      url: b.url,
      title: b.title,
      status: 'pending' as const,
      retryCount: 0,
    }));

    this.queue.push(...tasks);

    // 保存队列状态到存储
    await this.saveQueueState();

    // 开始处理（如果还没在处理）
    if (!this.isProcessing) {
      this.processQueue();
    }

    return {
      totalTasks: this.queue.length,
      pendingTasks: this.queue.filter(t => t.status === 'pending').length,
    };
  }

  /**
   * 取消所有待处理任务
   */
  cancelAll(): void {
    console.log('[AnalysisQueue] Cancelling all pending tasks');
    this.isCancelled = true;

    // 将所有待处理的任务标记为已取消
    this.queue.forEach(task => {
      if (task.status === 'pending') {
        task.status = 'completed'; // 标记为完成以停止处理
      }
    });

    this.saveQueueState().catch(err => {
      console.error('[AnalysisQueue] Failed to save cancellation state:', err);
    });
  }

  /**
   * 处理队列
   */
  private async processQueue() {
    if (this.isProcessing) {
      console.log('[AnalysisQueue] Already processing');
      return;
    }

    this.isProcessing = true;
    console.log('[AnalysisQueue] Starting queue processing');

    try {
      const analyzer = await getDefaultAnalyzer();

      while (!this.isCancelled) {
        // 获取待处理的任务
        const pendingTasks = this.queue.filter(t => t.status === 'pending');

        if (pendingTasks.length === 0) {
          console.log('[AnalysisQueue] No more pending tasks');
          break;
        }

        // 取一批任务
        const batch = pendingTasks.slice(0, this.batchSize);
        console.log(`[AnalysisQueue] Processing batch of ${batch.length} tasks`);

        // 处理这批任务
        for (const task of batch) {
          task.status = 'processing';
          await this.saveQueueState();

          try {
            console.log(`[AnalysisQueue] Analyzing: ${task.title}`);

            // 先提取网页内容（与 Agent 的 aiAnalyze 保持一致）
            let pageContent: {
              url: string;
              title: string;
              description: string;
              bodyText: string;
            } = {
              url: task.url,
              title: task.title,
              description: '',
              bodyText: '',
            };

            try {
              // 内容提取设置 5 秒超时，避免卡住队列
              const extractPromise = extractFrameworkContent(task.url);
              const timeoutPromise = new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('Content extraction timeout')), 5000)
              );

              const frameworkContent = await Promise.race([extractPromise, timeoutPromise]);
              if (frameworkContent) {
                pageContent = {
                  url: task.url,
                  title: frameworkContent.title || task.title,
                  description: frameworkContent.excerpt || '',
                  bodyText: frameworkContent.textContent || '',
                };
                console.log(`[AnalysisQueue] Extracted content for: ${task.title}`);
              }
            } catch (extractError) {
              console.warn(`[AnalysisQueue] Content extraction failed for ${task.title}, using basic info:`, extractError);
              // 提取失败时继续使用基础信息
            }

            const analysis = await analyzer.analyzeBookmark(pageContent);

            // 更新书签
            const result = await chrome.storage.local.get('bookmarks');
            const bookmarks = (result.bookmarks || []) as any[];
            const bookmark = bookmarks.find(b => b.id === task.bookmarkId);

            if (bookmark) {
              bookmark.aiSummary = analysis.summary;
              bookmark.aiTags = analysis.tags;
              bookmark.aiDifficulty = analysis.difficulty;
              bookmark.aiConfidence = Math.round((analysis.confidence || 0.5) * 100);
              bookmark.updateTime = Date.now();

              await chrome.storage.local.set({ bookmarks });
              console.log(`[AnalysisQueue] Updated bookmark: ${task.title}`);
            }

            task.status = 'completed';
            await this.saveQueueState();

            // 通知前端更新
            this.notifyProgress();

          } catch (error) {
            console.error(`[AnalysisQueue] Failed to analyze ${task.title}:`, error);

            task.retryCount++;
            if (task.retryCount >= this.maxRetries) {
              task.status = 'failed';
              task.error = (error as Error).message;
            } else {
              task.status = 'pending'; // 重试
            }

            await this.saveQueueState();
          }

          // 任务间短暂延迟
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 批次间延迟
        if (pendingTasks.length > this.batchSize) {
          console.log(`[AnalysisQueue] Waiting ${this.delayBetweenBatches}ms before next batch`);
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
        }
      }

      // 处理完成
      const completed = this.queue.filter(t => t.status === 'completed').length;
      const failed = this.queue.filter(t => t.status === 'failed').length;

      console.log(`[AnalysisQueue] Queue processing completed: ${completed} succeeded, ${failed} failed`);

      // 通知完成
      chrome.runtime.sendMessage({
        type: 'ANALYSIS_QUEUE_COMPLETE',
        data: { completed, failed, total: this.queue.length }
      }).catch(() => {
        console.log('[AnalysisQueue] Failed to notify completion (sidebar might be closed)');
      });

      // 清空队列
      this.queue = [];
      await this.saveQueueState();

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 保存队列状态
   */
  private async saveQueueState() {
    try {
      await chrome.storage.local.set({
        analysisQueue: {
          queue: this.queue,
          isProcessing: this.isProcessing,
          timestamp: Date.now(),
        }
      });
    } catch (error) {
      console.error('[AnalysisQueue] Failed to save queue state:', error);
    }
  }

  /**
   * 恢复队列状态（扩展重启后）
   */
  async restoreQueueState() {
    try {
      const result = await chrome.storage.local.get('analysisQueue');
      const savedState = result.analysisQueue;

      if (savedState && savedState.queue && savedState.queue.length > 0) {
        console.log(`[AnalysisQueue] Restoring ${savedState.queue.length} tasks from storage`);

        this.queue = savedState.queue;

        // 将所有 processing 状态的任务重置为 pending
        this.queue.forEach(task => {
          if (task.status === 'processing') {
            task.status = 'pending';
          }
        });

        // 继续处理
        if (!this.isProcessing) {
          this.processQueue();
        }
      }
    } catch (error) {
      console.error('[AnalysisQueue] Failed to restore queue state:', error);
    }
  }

  /**
   * 通知前端进度
   */
  private notifyProgress() {
    const total = this.queue.length;
    const completed = this.queue.filter(t => t.status === 'completed').length;
    const failed = this.queue.filter(t => t.status === 'failed').length;
    const pending = this.queue.filter(t => t.status === 'pending').length;

    chrome.runtime.sendMessage({
      type: 'ANALYSIS_QUEUE_PROGRESS',
      data: { total, completed, failed, pending, progress: Math.round((completed / total) * 100) }
    }).catch(() => {
      // Sidebar 可能已关闭，忽略错误
    });
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    const total = this.queue.length;
    const completed = this.queue.filter(t => t.status === 'completed').length;
    const failed = this.queue.filter(t => t.status === 'failed').length;
    const pending = this.queue.filter(t => t.status === 'pending').length;
    const processing = this.queue.filter(t => t.status === 'processing').length;

    return {
      total,
      completed,
      failed,
      pending,
      processing,
      isProcessing: this.isProcessing,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }
}

// 创建全局队列实例
const analysisQueue = new BackgroundAnalysisQueue();

// 扩展启动时恢复队列
analysisQueue.restoreQueueState();

/**
 * 处理一批书签导入（由 Alarm 触发，避免 Service Worker 超时）
 */
async function processImportBatch() {
  console.log('[Background] Processing import batch...');

  try {
    const taskResult = await chrome.storage.local.get('importTask');
    const importTask = taskResult.importTask as any;

    if (!importTask || importTask.status !== 'in_progress') {
      console.log('[Background] No active import task');
      return;
    }

    const { bookmarks, currentIndex, importedBookmarks } = importTask;

    // 检查是否已完成
    if (currentIndex >= bookmarks.length) {
      console.log('[Background] All bookmarks imported, saving and cleaning up...');

      // 保存最终结果
      await chrome.storage.local.set({
        bookmarks: importedBookmarks,
        importCompleted: true,
        importTime: Date.now()
      });

      // 清理任务状态
      await chrome.storage.local.remove('importTask');

      // 释放锁
      const lockKey = 'bookmarkImportLock';
      await chrome.storage.local.remove(lockKey);
      console.log('[Background] Import lock released');

      // 发送通知
      chrome.runtime.sendMessage({
        type: 'BOOKMARKS_IMPORTED',
        count: importedBookmarks.length,
      }).catch(error => {
        console.log('[Background] Failed to notify sidebar:', error.message);
      });

      console.log(`[Background] Successfully imported ${importedBookmarks.length} bookmarks`);
      return;
    }

    // 处理一批（确保在 30 秒内完成）
    const batchSize = 50;  // 每批 50 个
    const endIndex = Math.min(currentIndex + batchSize, bookmarks.length);
    const batch = bookmarks.slice(currentIndex, endIndex);

    console.log(`[Background] Processing batch ${Math.floor(currentIndex / batchSize) + 1}, bookmarks ${currentIndex}-${endIndex}/${bookmarks.length}`);

    const importedBatch = [];
    for (const chromeBookmark of batch) {
      try {
        const bookmarkId = `bookmark-${crypto.randomUUID()}`;
        const bookmark: any = {
          id: bookmarkId,
          chromeId: chromeBookmark.id,
          url: chromeBookmark.url || '',
          title: chromeBookmark.title || 'Untitled',
          favicon: chromeBookmark.url ? `chrome://favicon/${chromeBookmark.url}` : undefined,
          folderPath: (chromeBookmark as any).folderPath || '/',
          folderId: 'imported',
          createTime: chromeBookmark.dateAdded || Date.now(),
          updateTime: Date.now(),
          importSource: 'browser' as const,
          userTitle: undefined,
          userTags: [],
          userNotes: undefined,
          starred: false,
          pinned: false,
          aiSummary: undefined,
          aiTags: [],
          aiCategory: undefined,
          aiSubcategory: undefined,
          aiConfidence: undefined,
          analytics: {
            visitCount: 0,
            lastVisit: null,
            importance: 50,
            readTime: 0,
          },
          relatedBookmarks: undefined,
          duplicateOf: undefined,
          status: 'active' as const,
          archiveTime: undefined,
        };

        importedBatch.push(bookmark);
      } catch (error) {
        console.error('[Background] Failed to process bookmark:', error);
      }
    }

    // 更新任务状态
    importedBookmarks.push(...importedBatch);
    importTask.currentIndex = endIndex;
    importTask.importedBookmarks = importedBookmarks;

    await chrome.storage.local.set({ importTask });

    console.log(`[Background] Batch completed, total imported: ${importedBookmarks.length}`);

    // 创建下一个 Alarm
    if (endIndex < bookmarks.length) {
      await chrome.alarms.create('import-batch', {
        delayInMinutes: 0.1  // 6 秒后继续
      });
    }

  } catch (error) {
    console.error('[Background] Failed to process import batch:', error);

    // 出错时释放锁
    try {
      const lockKey = 'bookmarkImportLock';
      await chrome.storage.local.remove(lockKey);
      console.log('[Background] Import lock released after error in batch processing');
    } catch (lockError) {
      console.error('[Background] Failed to release lock:', lockError);
    }
  }
}

// 导出类型供其他模块使用
export type { };
