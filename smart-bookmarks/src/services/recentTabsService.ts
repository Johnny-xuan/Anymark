/**
 * Recent Tabs Service
 * 获取和管理最近打开的浏览器标签页
 */

export interface RecentTab {
  id: number;
  url: string;
  title: string;
  favicon?: string;
  windowId: number;
  lastAccessed?: number;
  isActive?: boolean;
}

class RecentTabsService {
  private static instance: RecentTabsService;
  private recentTabs: RecentTab[] = [];
  private maxTabs = 50; // 最多保存50个最近标签页

  private constructor() {
    this.initializeListeners();
  }

  static getInstance(): RecentTabsService {
    if (!RecentTabsService.instance) {
      RecentTabsService.instance = new RecentTabsService();
    }
    return RecentTabsService.instance;
  }

  /**
   * 初始化监听器，追踪标签页活动
   */
  private initializeListeners(): void {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      console.warn('[RecentTabsService] Chrome tabs API not available');
      return;
    }

    // 监听标签页激活
    chrome.tabs.onActivated.addListener((activeInfo) => {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError) {
          console.warn('[RecentTabsService] Failed to get tab:', chrome.runtime.lastError);
          return;
        }
        if (tab && tab.url && !this.isSystemUrl(tab.url)) {
          this.addOrUpdateTab(tab);
        }
      });
    });

    // 监听标签页更新
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && !this.isSystemUrl(tab.url)) {
        this.addOrUpdateTab(tab);
      }
    });

    // 初始加载当前所有标签页
    this.loadCurrentTabs();
  }

  /**
   * 检查是否是系统URL（不应该被追踪）
   */
  private isSystemUrl(url: string): boolean {
    const systemPrefixes = [
      'chrome://',
      'chrome-extension://',
      'about:',
      'edge://',
      'brave://',
    ];
    return systemPrefixes.some(prefix => url.startsWith(prefix));
  }

  /**
   * 添加或更新标签页
   */
  private addOrUpdateTab(tab: chrome.tabs.Tab): void {
    if (!tab.id || !tab.url || !tab.title) return;

    const recentTab: RecentTab = {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl,
      windowId: tab.windowId || 0,
      lastAccessed: Date.now(),
      isActive: tab.active,
    };

    // 移除已存在的相同URL
    this.recentTabs = this.recentTabs.filter(t => t.url !== tab.url);

    // 添加到列表开头
    this.recentTabs.unshift(recentTab);

    // 限制列表长度
    if (this.recentTabs.length > this.maxTabs) {
      this.recentTabs = this.recentTabs.slice(0, this.maxTabs);
    }

    // 持久化到 storage
    this.saveToStorage();
  }

  /**
   * 加载当前所有打开的标签页
   */
  private async loadCurrentTabs(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      const validTabs = tabs
        .filter(tab => tab.url && !this.isSystemUrl(tab.url))
        .sort((a, b) => {
          // 按最后访问时间排序（活跃标签优先）
          if (a.active) return -1;
          if (b.active) return 1;
          return (b.lastAccessed || 0) - (a.lastAccessed || 0);
        });

      for (const tab of validTabs) {
        this.addOrUpdateTab(tab);
      }
    } catch (error) {
      console.error('[RecentTabsService] Failed to load current tabs:', error);
    }
  }

  /**
   * 从 storage 加载历史记录
   */
  async loadFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('recentTabs');
      if (result.recentTabs && Array.isArray(result.recentTabs)) {
        this.recentTabs = result.recentTabs;
      }
    } catch (error) {
      console.error('[RecentTabsService] Failed to load from storage:', error);
    }
  }

  /**
   * 保存到 storage
   */
  private async saveToStorage(): Promise<void> {
    try {
      await chrome.storage.local.set({ recentTabs: this.recentTabs });
    } catch (error) {
      console.error('[RecentTabsService] Failed to save to storage:', error);
    }
  }

  /**
   * 获取最近的标签页列表
   */
  async getRecentTabs(limit?: number): Promise<RecentTab[]> {
    // 先从 storage 加载
    await this.loadFromStorage();

    // 获取当前打开的标签页并更新状态
    try {
      const currentTabs = await chrome.tabs.query({});
      const currentTabUrls = new Set(currentTabs.map(t => t.url));

      // 更新 isActive 状态
      this.recentTabs = this.recentTabs.map(tab => ({
        ...tab,
        isActive: currentTabUrls.has(tab.url),
      }));
    } catch (error) {
      console.error('[RecentTabsService] Failed to update active status:', error);
    }

    const tabs = limit ? this.recentTabs.slice(0, limit) : this.recentTabs;
    return tabs;
  }

  /**
   * 清除所有历史记录
   */
  async clearHistory(): Promise<void> {
    this.recentTabs = [];
    await chrome.storage.local.remove('recentTabs');
  }

  /**
   * 从历史记录中移除特定URL
   */
  async removeTab(url: string): Promise<void> {
    this.recentTabs = this.recentTabs.filter(tab => tab.url !== url);
    await this.saveToStorage();
  }

  /**
   * 打开标签页
   */
  async openTab(url: string, inNewTab = false): Promise<void> {
    try {
      if (inNewTab) {
        await chrome.tabs.create({ url, active: true });
      } else {
        // 检查是否已经打开
        const tabs = await chrome.tabs.query({ url });
        if (tabs.length > 0) {
          // 切换到已存在的标签页
          await chrome.tabs.update(tabs[0].id!, { active: true });
          if (tabs[0].windowId) {
            await chrome.windows.update(tabs[0].windowId, { focused: true });
          }
        } else {
          // 在当前标签页打开
          const currentTab = await chrome.tabs.query({ active: true, currentWindow: true });
          if (currentTab[0]?.id) {
            await chrome.tabs.update(currentTab[0].id, { url });
          } else {
            await chrome.tabs.create({ url, active: true });
          }
        }
      }
    } catch (error) {
      console.error('[RecentTabsService] Failed to open tab:', error);
    }
  }
}

export const recentTabsService = RecentTabsService.getInstance();
