/**
 * Chrome 导出服务
 * 将 AI 分类结构导出到 Chrome 书签栏或 HTML 文件
 */

import { useBookmarkStore } from '../sidebar/store/bookmarkStore';
import type { IBookmark, IFolder } from '../types/bookmark';

/**
 * 导出状态
 */
export interface SyncState {
  lastExportTimestamp?: number;   // 上次导出时间
  exportHistory?: Array<{         // 导出历史
    timestamp: number;
    foldersCreated: number;
    bookmarksExported: number;
  }>;
}

/**
 * 导出结果
 */
export interface ExportResult {
  success: boolean;
  foldersCreated: number;
  bookmarksExported: number;
  errors: string[];
}

/**
 * Chrome 书签节点
 */
interface ChromeBookmarkNode {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  children?: ChromeBookmarkNode[];
}

/**
 * Chrome 导出服务类
 */
export class ChromeExportService {
  private static instance: ChromeExportService;
  private syncState: SyncState = {};

  private constructor() {
    this.loadSyncState();
  }

  static getInstance(): ChromeExportService {
    if (!ChromeExportService.instance) {
      ChromeExportService.instance = new ChromeExportService();
    }
    return ChromeExportService.instance;
  }

  /**
   * 加载同步状态
   */
  private async loadSyncState(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get('chromeSyncState');
        if (result.chromeSyncState) {
          this.syncState = result.chromeSyncState;
        }
      }
    } catch (error) {
      console.warn('[ChromeExportService] Failed to load sync state:', error);
    }
  }

  /**
   * 保存同步状态
   */
  private async saveSyncState(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ chromeSyncState: this.syncState });
      }
    } catch (error) {
      console.warn('[ChromeExportService] Failed to save sync state:', error);
    }
  }

  /**
   * 获取上次导出时间
   */
  async getLastExportTime(): Promise<number | undefined> {
    await this.loadSyncState();
    return this.syncState.lastExportTimestamp;
  }

  /**
   * 获取同步状态
   */
  async getSyncState(): Promise<SyncState> {
    await this.loadSyncState();
    return { ...this.syncState };
  }

  /**
   * 导出书签为 JSON
   */
  async exportBookmarks(): Promise<string> {
    const store = useBookmarkStore.getState();
    const exportData = {
      exportTime: new Date().toISOString(),
      bookmarks: store.bookmarks,
      folders: store.folders,
    };
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导出书签为 HTML（Chrome 书签格式）- 使用 AI 分类结构
   */
  async exportBookmarksAsHtml(): Promise<string> {
    const store = useBookmarkStore.getState();
    const bookmarks = store.bookmarks.filter(b => b.status !== 'deleted');

    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

    // 按 AI 分类文件夹分组（优先使用 aiFolderPath）
    const byFolder: { [path: string]: IBookmark[] } = {};
    bookmarks.forEach(b => {
      const path = b.aiFolderPath || b.folderPath || '/';
      if (!byFolder[path]) byFolder[path] = [];
      byFolder[path].push(b);
    });

    // 生成 HTML
    const generateFolder = (path: string, indent: string): string => {
      let result = '';
      const folderName = path === '/' ? 'AnyMark AI 分类' : path.split('/').filter(Boolean).pop() || 'Unknown';

      if (path !== '/') {
        result += `${indent}<DT><H3>${escapeHtml(folderName)}</H3>\n`;
        result += `${indent}<DL><p>\n`;
      }

      // 添加书签
      const folderBookmarks = byFolder[path] || [];
      folderBookmarks.forEach(b => {
        const addDate = Math.floor((b.createTime || Date.now()) / 1000);
        result += `${indent}    <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${addDate}">${escapeHtml(b.title)}</A>\n`;
      });

      // 添加子文件夹
      Object.keys(byFolder)
        .filter(p => p !== path && p.startsWith(path) && p.split('/').filter(Boolean).length === path.split('/').filter(Boolean).length + 1)
        .forEach(subPath => {
          result += generateFolder(subPath, indent + '    ');
        });

      if (path !== '/') {
        result += `${indent}</DL><p>\n`;
      }

      return result;
    };

    html += generateFolder('/', '    ');
    html += `</DL><p>`;

    return html;
  }

  /**
   * 导出 AI 分类到 Chrome 书签栏
   * 可重复执行，每次创建带时间戳的新文件夹
   */
  async exportToChrome(): Promise<ExportResult> {
    const result: ExportResult = {
      success: false,
      foldersCreated: 0,
      bookmarksExported: 0,
      errors: [],
    };

    try {
      // 检查 Chrome API 是否可用
      if (typeof chrome === 'undefined' || !chrome.bookmarks) {
        result.errors.push('Chrome Bookmarks API 不可用');
        return result;
      }

      const store = useBookmarkStore.getState();
      const bookmarks = store.bookmarks.filter(b => b.status !== 'deleted');

      if (bookmarks.length === 0) {
        result.errors.push('没有可导出的书签');
        return result;
      }

      // 获取 Chrome 书签栏根节点
      const tree = await chrome.bookmarks.getTree();
      const bookmarkBar = tree[0]?.children?.find(n => n.id === '1'); // 书签栏
      const otherBookmarks = tree[0]?.children?.find(n => n.id === '2'); // 其他书签

      if (!bookmarkBar && !otherBookmarks) {
        result.errors.push('无法找到 Chrome 书签栏');
        return result;
      }

      const targetRoot = bookmarkBar || otherBookmarks!;

      // 创建带时间戳的 AnyMark 根文件夹
      const timestamp = new Date().toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(/\//g, '-');

      const anymarkFolder = await chrome.bookmarks.create({
        parentId: targetRoot.id,
        title: `AnyMark AI 分类 (${timestamp})`,
      });

      // 收集所有需要创建的文件夹路径（使用 aiFolderPath）
      const folderPaths = new Set<string>();
      bookmarks.forEach(b => {
        const path = b.aiFolderPath || b.folderPath;
        if (path && path !== '/') {
          // 添加所有父路径
          const parts = path.split('/').filter(Boolean);
          let currentPath = '';
          parts.forEach(part => {
            currentPath += '/' + part;
            folderPaths.add(currentPath);
          });
        }
      });

      // 创建文件夹映射 (AI 分类路径 -> Chrome 文件夹 ID)
      const folderMap: { [path: string]: string } = {
        '/': anymarkFolder.id,
      };

      // 按路径深度排序，确保父文件夹先创建
      const sortedPaths = Array.from(folderPaths).sort((a, b) =>
        a.split('/').length - b.split('/').length
      );

      // 创建文件夹
      for (const path of sortedPaths) {
        try {
          const parts = path.split('/').filter(Boolean);
          const folderName = parts[parts.length - 1];
          const parentPath = '/' + parts.slice(0, -1).join('/');
          const parentId = folderMap[parentPath] || anymarkFolder.id;

          const newFolder = await chrome.bookmarks.create({
            parentId,
            title: folderName,
          });

          folderMap[path] = newFolder.id;
          result.foldersCreated++;
        } catch (error) {
          result.errors.push(`创建文件夹失败: ${path} - ${error}`);
        }
      }

      // 导出书签（使用 aiFolderPath）
      for (const bookmark of bookmarks) {
        try {
          const folderPath = bookmark.aiFolderPath || bookmark.folderPath || '/';
          const targetFolderId = folderMap[folderPath] || anymarkFolder.id;

          await chrome.bookmarks.create({
            parentId: targetFolderId,
            title: bookmark.title,
            url: bookmark.url,
          });

          result.bookmarksExported++;
        } catch (error) {
          result.errors.push(`导出书签失败: ${bookmark.title} - ${error}`);
        }
      }

      // 记录导出历史
      const exportRecord = {
        timestamp: Date.now(),
        foldersCreated: result.foldersCreated,
        bookmarksExported: result.bookmarksExported,
      };

      this.syncState = {
        lastExportTimestamp: Date.now(),
        exportHistory: [...(this.syncState.exportHistory || []), exportRecord].slice(-10), // 保留最近10次
      };
      await this.saveSyncState();

      result.success = result.errors.length === 0;
      return result;

    } catch (error) {
      result.errors.push(`导出失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 导出单例获取函数
export function getChromeExportService(): ChromeExportService {
  return ChromeExportService.getInstance();
}
