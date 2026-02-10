/**
 * ExportService - 书签导出服务
 * 
 * 功能：
 * 1. 导出 AnyMark 书签为标准 Netscape Bookmark File Format (HTML)
 * 2. 支持包含/不包含元数据选项
 * 3. 保留文件夹层级结构
 */

import { getBookmarkService } from './bookmarkService';
import { getMetadataService } from './metadataService';
import {
  type ChromeBookmarkTreeNode,
  type BookmarkMetadata,
  type ExportOptions,
  type ExportResult,
} from '../types/chromeBookmark';

// ============ 常量 ============

const HTML_HEADER = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
`;

// Chrome 书签栏的特殊文件夹 ID
const CHROME_BOOKMARKS_BAR_ID = '1';

// ============ ExportService 类 ============

/**
 * 书签导出服务
 */
export class ExportService {
  private static instance: ExportService;
  
  private constructor() {}
  
  /**
   * 获取单例实例
   */
  static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService();
    }
    return ExportService.instance;
  }
  
  // ============ 导出方法 ============
  
  /**
   * 导出书签为 HTML 格式
   */
  async exportToHTML(options: ExportOptions = { includeMetadata: false, format: 'html' }): Promise<ExportResult> {
    console.log('[ExportService] Starting export with options:', options);

    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();

      // 获取 AnyMark 书签树
      const tree = await bookmarkService.getBookmarkTree();
      if (!tree) {
        return {
          success: false,
          data: '',
          bookmarkCount: 0,
          folderCount: 0,
          error: 'AnyMark folder not found',
        };
      }

      // 获取所有元数据
      const metadata = options.includeMetadata
        ? await metadataService.getAllMetadata()
        : new Map<string, BookmarkMetadata>();

      // 收集所有书签 URL 用于批量获取 favicon
      const faviconMap = await this.collectFavicons(tree);

      // 统计
      let bookmarkCount = 0;
      let folderCount = 0;

      // 生成 HTML
      const htmlContent = this.generateHTML(tree, metadata, options, faviconMap, (isFolder) => {
        if (isFolder) folderCount++;
        else bookmarkCount++;
      });

      console.log('[ExportService] Export completed:', bookmarkCount, 'bookmarks,', folderCount, 'folders');

      return {
        success: true,
        data: htmlContent,
        bookmarkCount,
        folderCount,
      };
    } catch (error) {
      console.error('[ExportService] Export failed:', error);
      return {
        success: false,
        data: '',
        bookmarkCount: 0,
        folderCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 导出书签为 JSON 格式
   */
  async exportToJSON(options: ExportOptions = { includeMetadata: true, format: 'json' }): Promise<ExportResult> {
    console.log('[ExportService] Starting JSON export with options:', options);
    
    try {
      const bookmarkService = getBookmarkService();
      const metadataService = getMetadataService();
      
      // 获取 AnyMark 书签树
      const tree = await bookmarkService.getBookmarkTree();
      if (!tree) {
        return {
          success: false,
          data: '',
          bookmarkCount: 0,
          folderCount: 0,
          error: 'AnyMark folder not found',
        };
      }
      
      // 获取所有元数据
      const metadata = options.includeMetadata 
        ? await metadataService.getAllMetadata()
        : new Map<string, BookmarkMetadata>();
      
      // 统计
      let bookmarkCount = 0;
      let folderCount = 0;
      
      // 转换为 JSON 结构
      const jsonData = this.convertToJSON(tree, metadata, (isFolder) => {
        if (isFolder) folderCount++;
        else bookmarkCount++;
      });
      
      console.log('[ExportService] JSON export completed:', bookmarkCount, 'bookmarks,', folderCount, 'folders');
      
      return {
        success: true,
        data: JSON.stringify(jsonData, null, 2),
        bookmarkCount,
        folderCount,
      };
    } catch (error) {
      console.error('[ExportService] JSON export failed:', error);
      return {
        success: false,
        data: '',
        bookmarkCount: 0,
        folderCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 触发文件下载
   */
  downloadFile(content: string, filename: string, mimeType: string = 'text/html'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    console.log('[ExportService] File download triggered:', filename);
  }
  
  /**
   * 导出并下载 HTML 文件
   */
  async exportAndDownloadHTML(options?: ExportOptions): Promise<ExportResult> {
    const result = await this.exportToHTML(options);
    
    if (result.success) {
      const timestamp = new Date().toISOString().slice(0, 10);
      this.downloadFile(result.data, `anymark-bookmarks-${timestamp}.html`, 'text/html');
    }
    
    return result;
  }
  
  /**
   * 导出并下载 JSON 文件
   */
  async exportAndDownloadJSON(options?: ExportOptions): Promise<ExportResult> {
    const result = await this.exportToJSON(options);
    
    if (result.success) {
      const timestamp = new Date().toISOString().slice(0, 10);
      this.downloadFile(result.data, `anymark-bookmarks-${timestamp}.json`, 'application/json');
    }
    
    return result;
  }
  
  // ============ 私有方法 ============
  
  /**
   * 生成 Netscape Bookmark File Format HTML
   */
  private generateHTML(
    tree: ChromeBookmarkTreeNode,
    metadata: Map<string, BookmarkMetadata>,
    options: ExportOptions,
    faviconMap: Map<string, string>,
    countCallback: (isFolder: boolean) => void
  ): string {
    let html = HTML_HEADER;
    html += '<DL><p>\n';

    // 处理 AnyMark 根文件夹的子节点
    if (tree.children) {
      for (const child of tree.children) {
        html += this.nodeToHTML(child, metadata, options, 1, faviconMap, countCallback);
      }
    }

    html += '</DL><p>\n';
    return html;
  }
  
  /**
   * 将单个节点转换为 HTML
   */
  private nodeToHTML(
    node: ChromeBookmarkTreeNode,
    metadata: Map<string, BookmarkMetadata>,
    options: ExportOptions,
    depth: number,
    faviconMap: Map<string, string>,
    countCallback: (isFolder: boolean) => void
  ): string {
    const indent = '    '.repeat(depth);

    if (node.url) {
      // 书签
      countCallback(false);

      const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : '';
      const meta = metadata.get(node.id);

      let description = '';
      if (options.includeMetadata && meta) {
        const parts: string[] = [];

        if (meta.aiCategory) {
          parts.push(`Category: ${meta.aiCategory}`);
        }
        if (meta.aiTags && meta.aiTags.length > 0) {
          parts.push(`AI Tags: ${meta.aiTags.join(', ')}`);
        }
        if (meta.userTags && meta.userTags.length > 0) {
          parts.push(`Tags: ${meta.userTags.join(', ')}`);
        }
        if (meta.aiSummary) {
          parts.push(`Summary: ${meta.aiSummary}`);
        }

        description = parts.join(' | ');
      }

      const escapedTitle = this.escapeHTML(node.title);
      const escapedUrl = this.escapeHTML(node.url);
      const escapedDesc = this.escapeHTML(description);

      // ICON 属性（favicon base64）
      const faviconData = faviconMap.get(node.url);
      const iconAttr = faviconData ? ` ICON="${faviconData}"` : '';

      let html = `${indent}<DT><A HREF="${escapedUrl}" ADD_DATE="${addDate}"${iconAttr}`;
      if (description) {
        html += ` DESCRIPTION="${escapedDesc}"`;
      }
      html += `>${escapedTitle}</A>\n`;

      return html;
    } else {
      // 文件夹
      countCallback(true);

      const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : '';
      const modDate = node.dateGroupModified ? Math.floor(node.dateGroupModified / 1000) : '';
      const escapedTitle = this.escapeHTML(node.title);

      // Chrome 书签栏需要特殊属性
      const toolbarAttr = node.id === CHROME_BOOKMARKS_BAR_ID ? ' PERSONAL_TOOLBAR_FOLDER="true"' : '';

      let html = `${indent}<DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${modDate}"${toolbarAttr}>${escapedTitle}</H3>\n`;
      html += `${indent}<DL><p>\n`;
      
      if (node.children) {
        for (const child of node.children) {
          html += this.nodeToHTML(child, metadata, options, depth + 1, faviconMap, countCallback);
        }
      }
      
      html += `${indent}</DL><p>\n`;
      return html;
    }
  }
  
  /**
   * 转换为 JSON 结构
   */
  private convertToJSON(
    tree: ChromeBookmarkTreeNode,
    metadata: Map<string, BookmarkMetadata>,
    countCallback: (isFolder: boolean) => void
  ): ExportJSONNode {
    return this.nodeToJSON(tree, metadata, countCallback);
  }
  
  /**
   * 将单个节点转换为 JSON
   */
  private nodeToJSON(
    node: ChromeBookmarkTreeNode,
    metadata: Map<string, BookmarkMetadata>,
    countCallback: (isFolder: boolean) => void
  ): ExportJSONNode {
    const meta = metadata.get(node.id);
    
    if (node.url) {
      // 书签
      countCallback(false);
      
      return {
        type: 'bookmark',
        title: node.title,
        url: node.url,
        dateAdded: node.dateAdded,
        metadata: meta || undefined,
      };
    } else {
      // 文件夹
      countCallback(true);
      
      return {
        type: 'folder',
        title: node.title,
        dateAdded: node.dateAdded,
        dateGroupModified: node.dateGroupModified,
        children: node.children?.map(child => this.nodeToJSON(child, metadata, countCallback)) || [],
      };
    }
  }
  
  /**
   * 收集所有书签的 favicon（base64 data URI）
   * 使用 offscreen canvas 将 Chrome favicon 转为 base64
   */
  private async collectFavicons(tree: ChromeBookmarkTreeNode): Promise<Map<string, string>> {
    const faviconMap = new Map<string, string>();
    const urls = this.collectBookmarkUrls(tree);

    // 批量获取 favicon，限制并发
    const BATCH_SIZE = 10;
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (url) => {
          try {
            const faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=16`;
            const dataUri = await this.imageUrlToBase64(faviconUrl);
            if (dataUri) {
              faviconMap.set(url, dataUri);
            }
          } catch {
            // favicon 获取失败，静默跳过
          }
        })
      );
    }

    console.log(`[ExportService] Collected ${faviconMap.size}/${urls.length} favicons`);
    return faviconMap;
  }

  /**
   * 递归收集所有书签 URL
   */
  private collectBookmarkUrls(node: ChromeBookmarkTreeNode): string[] {
    const urls: string[] = [];
    if (node.url) {
      urls.push(node.url);
    }
    if (node.children) {
      for (const child of node.children) {
        urls.push(...this.collectBookmarkUrls(child));
      }
    }
    return urls;
  }

  /**
   * 将图片 URL 转为 base64 data URI
   */
  private async imageUrlToBase64(imageUrl: string): Promise<string | null> {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) return null;

      const blob = await response.blob();
      if (blob.size === 0) return null;

      return new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // 只保留有效的 data URI
          if (result && result.startsWith('data:image/')) {
            resolve(result);
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  /**
   * HTML 转义
   */
  private escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// ============ 类型定义 ============

/**
 * JSON 导出节点类型
 */
interface ExportJSONNode {
  type: 'bookmark' | 'folder';
  title: string;
  url?: string;
  dateAdded?: number;
  dateGroupModified?: number;
  metadata?: BookmarkMetadata;
  children?: ExportJSONNode[];
}

// ============ 导出 ============

/**
 * 获取 ExportService 单例
 */
export function getExportService(): ExportService {
  return ExportService.getInstance();
}
