/**
 * BookmarkService - Chrome Native 书签操作服务
 * 
 * 设计原则：
 * 1. 所有书签操作直接调用 Chrome Native API
 * 2. 只管理 AnyMark_Root 文件夹内的书签
 * 3. 不维护本地副本，Chrome Native 是唯一数据源
 */

import {
  ANYMARK_ROOT_FOLDER_NAME,
  CHROME_SPECIAL_FOLDER_IDS,
  type ChromeBookmarkTreeNode,
  type CreateBookmarkParams,
  type UpdateBookmarkParams,
  type CreateFolderParams,
  type MergedBookmark,
  type MergedFolder,
  type BookmarkEvent,
  type BookmarkEventType,
} from '../types/chromeBookmark';

// ============ 错误类型 ============

export class BookmarkServiceError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly chromeId?: string
  ) {
    super(message);
    this.name = 'BookmarkServiceError';
  }
}

export class BookmarkNotFoundError extends BookmarkServiceError {
  constructor(chromeId: string, operation: string) {
    super(`Bookmark not found: ${chromeId}`, operation, chromeId);
    this.name = 'BookmarkNotFoundError';
  }
}

export class InvalidOperationError extends BookmarkServiceError {
  constructor(operation: string, reason: string) {
    super(`Invalid operation: ${reason}`, operation);
    this.name = 'InvalidOperationError';
  }
}

// ============ 事件回调类型 ============

type BookmarkCreatedCallback = (bookmark: ChromeBookmarkTreeNode) => void;
type BookmarkRemovedCallback = (chromeId: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo) => void;
type BookmarkChangedCallback = (chromeId: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo) => void;
type BookmarkMovedCallback = (chromeId: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo) => void;

// ============ BookmarkService 类 ============

/**
 * Chrome Native 书签操作服务
 * 单例模式
 */
export class BookmarkService {
  private static instance: BookmarkService;
  
  private anyMarkRootId: string | null = null;
  private initialized = false;
  private listenersSetup = false;
  
  // 批量导入状态标志 - 导入期间禁用事件通知
  private isImporting = false;
  
  // 事件回调
  private onCreatedCallbacks: BookmarkCreatedCallback[] = [];
  private onRemovedCallbacks: BookmarkRemovedCallback[] = [];
  private onChangedCallbacks: BookmarkChangedCallback[] = [];
  private onMovedCallbacks: BookmarkMovedCallback[] = [];
  
  // 缓存 AnyMark 文件夹下所有节点的 ID，用于快速判断
  private anyMarkNodeIds: Set<string> = new Set();
  
  private constructor() {}
  
  /**
   * 获取单例实例
   */
  static getInstance(): BookmarkService {
    if (!BookmarkService.instance) {
      BookmarkService.instance = new BookmarkService();
    }
    return BookmarkService.instance;
  }
  
  // ============ 初始化 ============
  
  /**
   * 初始化服务
   * 确保 AnyMark_Root 文件夹存在
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[BookmarkService] Already initialized');
      return;
    }
    
    console.log('[BookmarkService] Initializing...');
    
    try {
      // 1. 尝试从 Storage 加载已保存的 AnyMark_Root ID
      const stored = await chrome.storage.local.get('anyMarkRootId');
      if (stored.anyMarkRootId) {
        // 验证该 ID 是否仍然有效
        try {
          const nodes = await chrome.bookmarks.get(stored.anyMarkRootId);
          if (nodes[0] && nodes[0].title === ANYMARK_ROOT_FOLDER_NAME) {
            this.anyMarkRootId = stored.anyMarkRootId;
            console.log('[BookmarkService] Loaded AnyMark_Root from storage:', this.anyMarkRootId);
          }
        } catch {
          console.log('[BookmarkService] Stored AnyMark_Root ID is invalid, will recreate');
        }
      }
      
      // 2. 如果没有有效的 AnyMark_Root，查找或创建
      if (!this.anyMarkRootId) {
        this.anyMarkRootId = await this.findOrCreateAnyMarkRoot();
        // 保存到 Storage
        await chrome.storage.local.set({ anyMarkRootId: this.anyMarkRootId });
        console.log('[BookmarkService] Created/Found AnyMark_Root:', this.anyMarkRootId);
      }

      // 2.5 清理幽灵文件夹（重复的 AnyMark 文件夹）
      // 这解决了"747个书签"的自我复制问题
      await this.cleanupGhostFolders();
      
      // 3. 构建 AnyMark 节点 ID 缓存
      await this.rebuildNodeIdCache();
      
      // 4. 设置事件监听器
      this.setupEventListeners();
      
      this.initialized = true;
      console.log('[BookmarkService] Initialized successfully');
    } catch (error) {
      console.error('[BookmarkService] Initialization failed:', error);
      throw new BookmarkServiceError(
        `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        'initialize'
      );
    }
  }
  
  /**
   * 查找或创建 AnyMark_Root 文件夹
   */
  private async findOrCreateAnyMarkRoot(): Promise<string> {
    // 在 Other Bookmarks 下查找 AnyMark 文件夹
    const otherBookmarksId = CHROME_SPECIAL_FOLDER_IDS.OTHER_BOOKMARKS;
    const children = await chrome.bookmarks.getChildren(otherBookmarksId);
    
    const existing = children.find(
      child => !child.url && child.title === ANYMARK_ROOT_FOLDER_NAME
    );
    
    if (existing) {
      return existing.id;
    }
    
    // 创建新的 AnyMark 文件夹
    const newFolder = await chrome.bookmarks.create({
      parentId: otherBookmarksId,
      title: ANYMARK_ROOT_FOLDER_NAME,
    });
    
    console.log('[BookmarkService] Created AnyMark_Root folder:', newFolder.id);
    return newFolder.id;
  }

  /**
   * 清理幽灵文件夹（重复的 AnyMark 文件夹）
   * 修复因多次导入导致的自我复制问题
   */
  private async cleanupGhostFolders(): Promise<void> {
    if (!this.anyMarkRootId) return;

    try {
      console.log('[BookmarkService] Starting cleanupGhostFolders...');
      
      // 1. 清理外部幽灵（Other Bookmarks 下的其他 AnyMark）
      const otherBookmarksId = CHROME_SPECIAL_FOLDER_IDS.OTHER_BOOKMARKS;
      const children = await chrome.bookmarks.getChildren(otherBookmarksId);
      
      const ghosts = children.filter(
        child => !child.url && 
                 child.title === ANYMARK_ROOT_FOLDER_NAME && 
                 child.id !== this.anyMarkRootId
      );

      if (ghosts.length > 0) {
        console.log(`[BookmarkService] Found ${ghosts.length} sibling ghost folders. Removing...`);
        for (const ghost of ghosts) {
          await chrome.bookmarks.removeTree(ghost.id);
        }
      }

      // 2. 清理内部嵌套（Inception）：检查当前 AnyMark 内部是否误导入了 AnyMark
      // 这种情况会导致书签结构加倍
      const rootTree = await chrome.bookmarks.getSubTree(this.anyMarkRootId);
      if (rootTree[0]) {
        const nestedGhosts: string[] = [];
        
        // 递归查找名为 AnyMark 的子文件夹
        const findNestedGhosts = (node: ChromeBookmarkTreeNode) => {
          if (node.id !== this.anyMarkRootId && node.title === ANYMARK_ROOT_FOLDER_NAME && !node.url) {
            nestedGhosts.push(node.id);
            return; // 找到顶层嵌套即可，无需继续深入该分支
          }
          if (node.children) {
            for (const child of node.children) {
              findNestedGhosts(child);
            }
          }
        };

        findNestedGhosts(rootTree[0]);

        if (nestedGhosts.length > 0) {
          console.log(`[BookmarkService] Found ${nestedGhosts.length} NESTED AnyMark folders. This fixes the 'double import' issue.`);
          for (const ghostId of nestedGhosts) {
            console.log(`[BookmarkService] Removing nested ghost: ${ghostId}`);
            await chrome.bookmarks.removeTree(ghostId);
          }
        }
      }
      
      console.log('[BookmarkService] Cleanup complete.');
    } catch (error) {
      console.error('[BookmarkService] Failed to cleanup ghost folders:', error);
    }
  }
  
  /**
   * 重建 AnyMark 节点 ID 缓存
   */
  private async rebuildNodeIdCache(): Promise<void> {
    if (!this.anyMarkRootId) return;
    
    this.anyMarkNodeIds.clear();
    this.anyMarkNodeIds.add(this.anyMarkRootId);
    
    const subtree = await chrome.bookmarks.getSubTree(this.anyMarkRootId);
    if (subtree[0]) {
      this.collectNodeIds(subtree[0]);
    }
    
    console.log('[BookmarkService] Node ID cache rebuilt, count:', this.anyMarkNodeIds.size);
  }
  
  /**
   * 递归收集节点 ID
   */
  private collectNodeIds(node: ChromeBookmarkTreeNode): void {
    this.anyMarkNodeIds.add(node.id);
    if (node.children) {
      for (const child of node.children) {
        this.collectNodeIds(child);
      }
    }
  }
  
  /**
   * 获取 AnyMark_Root 文件夹 ID
   */
  getAnyMarkRootId(): string {
    if (!this.anyMarkRootId) {
      throw new BookmarkServiceError('Service not initialized', 'getAnyMarkRootId');
    }
    return this.anyMarkRootId;
  }
  
  /**
   * 检查节点是否在 AnyMark_Root 内
   */
  isWithinAnyMarkRoot(chromeId: string): boolean {
    return this.anyMarkNodeIds.has(chromeId);
  }
  
  /**
   * 检查节点是否在 AnyMark_Root 内（通过遍历父节点）
   * 用于处理新创建的节点（还没在缓存中）
   */
  private async checkIsWithinAnyMarkRoot(chromeId: string): Promise<boolean> {
    if (!this.anyMarkRootId) return false;
    if (chromeId === this.anyMarkRootId) return true;
    
    try {
      let currentId = chromeId;
      while (currentId) {
        if (currentId === this.anyMarkRootId) return true;
        
        const nodes = await chrome.bookmarks.get(currentId);
        if (!nodes[0] || !nodes[0].parentId) break;
        currentId = nodes[0].parentId;
      }
    } catch {
      // 节点可能已被删除
    }
    
    return false;
  }
  
  // ============ 书签 CRUD 操作 ============
  
  /**
   * 创建书签
   */
  async createBookmark(params: CreateBookmarkParams): Promise<string> {
    const { url, title, parentId, index } = params;
    const targetParentId = parentId || this.getAnyMarkRootId();
    
    // 验证父文件夹在 AnyMark_Root 内
    if (!this.isWithinAnyMarkRoot(targetParentId) && targetParentId !== this.anyMarkRootId) {
      throw new InvalidOperationError('createBookmark', 'Parent folder is not within AnyMark');
    }
    
    console.log('[BookmarkService] Creating bookmark:', title, 'in', targetParentId);
    
    const bookmark = await chrome.bookmarks.create({
      parentId: targetParentId,
      title,
      url,
      index,
    });
    
    // 更新缓存
    this.anyMarkNodeIds.add(bookmark.id);
    
    console.log('[BookmarkService] Created bookmark:', bookmark.id);
    return bookmark.id;
  }
  
  /**
   * 更新书签
   */
  async updateBookmark(chromeId: string, changes: UpdateBookmarkParams): Promise<void> {
    // 验证书签在 AnyMark_Root 内
    if (!this.isWithinAnyMarkRoot(chromeId)) {
      throw new InvalidOperationError('updateBookmark', 'Bookmark is not within AnyMark');
    }
    
    console.log('[BookmarkService] Updating bookmark:', chromeId, changes);
    
    await chrome.bookmarks.update(chromeId, changes);
    
    console.log('[BookmarkService] Updated bookmark:', chromeId);
  }
  
  /**
   * 删除书签
   */
  async deleteBookmark(chromeId: string): Promise<void> {
    // 验证书签在 AnyMark_Root 内
    if (!this.isWithinAnyMarkRoot(chromeId)) {
      throw new InvalidOperationError('deleteBookmark', 'Bookmark is not within AnyMark');
    }
    
    console.log('[BookmarkService] Deleting bookmark:', chromeId);
    
    await chrome.bookmarks.remove(chromeId);
    
    // 更新缓存
    this.anyMarkNodeIds.delete(chromeId);
    
    console.log('[BookmarkService] Deleted bookmark:', chromeId);
  }
  
  /**
   * 移动书签
   */
  async moveBookmark(chromeId: string, newParentId: string, index?: number): Promise<void> {
    // 验证书签在 AnyMark_Root 内
    if (!this.isWithinAnyMarkRoot(chromeId)) {
      throw new InvalidOperationError('moveBookmark', 'Bookmark is not within AnyMark');
    }
    
    // 验证目标文件夹在 AnyMark_Root 内
    if (!this.isWithinAnyMarkRoot(newParentId) && newParentId !== this.anyMarkRootId) {
      throw new InvalidOperationError('moveBookmark', 'Target folder is not within AnyMark');
    }
    
    console.log('[BookmarkService] Moving bookmark:', chromeId, 'to', newParentId);
    
    await chrome.bookmarks.move(chromeId, { parentId: newParentId, index });
    
    console.log('[BookmarkService] Moved bookmark:', chromeId);
  }
  
  // ============ 文件夹操作 ============
  
  /**
   * 创建文件夹
   */
  async createFolder(params: CreateFolderParams): Promise<string> {
    const { title, parentId, index } = params;
    const targetParentId = parentId || this.getAnyMarkRootId();
    
    // 验证父文件夹在 AnyMark_Root 内
    if (!this.isWithinAnyMarkRoot(targetParentId) && targetParentId !== this.anyMarkRootId) {
      throw new InvalidOperationError('createFolder', 'Parent folder is not within AnyMark');
    }
    
    console.log('[BookmarkService] Creating folder:', title, 'in', targetParentId);
    
    const folder = await chrome.bookmarks.create({
      parentId: targetParentId,
      title,
      index,
    });
    
    // 更新缓存
    this.anyMarkNodeIds.add(folder.id);
    
    console.log('[BookmarkService] Created folder:', folder.id);
    return folder.id;
  }
  
  /**
   * 重命名文件夹
   */
  async renameFolder(chromeId: string, newTitle: string): Promise<void> {
    // 验证文件夹在 AnyMark_Root 内
    if (!this.isWithinAnyMarkRoot(chromeId)) {
      throw new InvalidOperationError('renameFolder', 'Folder is not within AnyMark');
    }
    
    // 不允许重命名 AnyMark_Root 本身
    if (chromeId === this.anyMarkRootId) {
      throw new InvalidOperationError('renameFolder', 'Cannot rename AnyMark root folder');
    }
    
    console.log('[BookmarkService] Renaming folder:', chromeId, 'to', newTitle);
    
    await chrome.bookmarks.update(chromeId, { title: newTitle });
    
    console.log('[BookmarkService] Renamed folder:', chromeId);
  }
  
  /**
   * 删除文件夹（及其所有内容）
   */
  async deleteFolder(chromeId: string): Promise<void> {
    // 验证文件夹在 AnyMark_Root 内
    if (!this.isWithinAnyMarkRoot(chromeId)) {
      throw new InvalidOperationError('deleteFolder', 'Folder is not within AnyMark');
    }
    
    // 不允许删除 AnyMark_Root 本身
    if (chromeId === this.anyMarkRootId) {
      throw new InvalidOperationError('deleteFolder', 'Cannot delete AnyMark root folder');
    }
    
    console.log('[BookmarkService] Deleting folder:', chromeId);
    
    // 收集要删除的所有节点 ID（用于更新缓存）
    const idsToRemove = await this.collectDescendantIds(chromeId);
    
    await chrome.bookmarks.removeTree(chromeId);
    
    // 更新缓存
    for (const id of idsToRemove) {
      this.anyMarkNodeIds.delete(id);
    }
    
    console.log('[BookmarkService] Deleted folder:', chromeId, 'and', idsToRemove.length - 1, 'descendants');
  }
  
  /**
   * 移动文件夹
   */
  async moveFolder(chromeId: string, newParentId: string, index?: number): Promise<void> {
    // 验证文件夹在 AnyMark_Root 内
    if (!this.isWithinAnyMarkRoot(chromeId)) {
      throw new InvalidOperationError('moveFolder', 'Folder is not within AnyMark');
    }
    
    // 不允许移动 AnyMark_Root 本身
    if (chromeId === this.anyMarkRootId) {
      throw new InvalidOperationError('moveFolder', 'Cannot move AnyMark root folder');
    }
    
    // 验证目标文件夹在 AnyMark_Root 内
    if (!this.isWithinAnyMarkRoot(newParentId) && newParentId !== this.anyMarkRootId) {
      throw new InvalidOperationError('moveFolder', 'Target folder is not within AnyMark');
    }
    
    // 不允许移动到自己的子文件夹
    const descendantIds = await this.collectDescendantIds(chromeId);
    if (descendantIds.includes(newParentId)) {
      throw new InvalidOperationError('moveFolder', 'Cannot move folder into its own descendant');
    }
    
    console.log('[BookmarkService] Moving folder:', chromeId, 'to', newParentId);
    
    await chrome.bookmarks.move(chromeId, { parentId: newParentId, index });
    
    console.log('[BookmarkService] Moved folder:', chromeId);
  }
  
  /**
   * 收集文件夹及其所有后代的 ID
   */
  private async collectDescendantIds(chromeId: string): Promise<string[]> {
    const ids: string[] = [chromeId];
    
    try {
      const subtree = await chrome.bookmarks.getSubTree(chromeId);
      if (subtree[0]) {
        this.collectIdsRecursive(subtree[0], ids);
      }
    } catch {
      // 节点可能已被删除
    }
    
    return ids;
  }
  
  private collectIdsRecursive(node: ChromeBookmarkTreeNode, ids: string[]): void {
    if (node.children) {
      for (const child of node.children) {
        ids.push(child.id);
        this.collectIdsRecursive(child, ids);
      }
    }
  }
  
  // ============ 查询方法 ============
  
  /**
   * 获取 AnyMark_Root 下的所有书签和文件夹
   */
  async getBookmarkTree(): Promise<ChromeBookmarkTreeNode | null> {
    if (!this.anyMarkRootId) return null;
    
    try {
      const subtree = await chrome.bookmarks.getSubTree(this.anyMarkRootId);
      return subtree[0] || null;
    } catch (error) {
      console.error('[BookmarkService] Failed to get bookmark tree:', error);
      return null;
    }
  }
  
  /**
   * 获取单个书签/文件夹
   */
  async getBookmark(chromeId: string): Promise<ChromeBookmarkTreeNode | null> {
    try {
      const nodes = await chrome.bookmarks.get(chromeId);
      return nodes[0] || null;
    } catch {
      return null;
    }
  }
  
  /**
   * 获取文件夹的子节点
   */
  async getChildren(chromeId: string): Promise<ChromeBookmarkTreeNode[]> {
    try {
      return await chrome.bookmarks.getChildren(chromeId);
    } catch {
      return [];
    }
  }
  
  /**
   * 搜索书签
   */
  async searchBookmarks(query: string): Promise<ChromeBookmarkTreeNode[]> {
    const results = await chrome.bookmarks.search(query);
    // 只返回 AnyMark_Root 内的结果
    return results.filter(node => this.isWithinAnyMarkRoot(node.id));
  }
  
  /**
   * 获取书签的完整路径
   */
  async getBookmarkPath(chromeId: string): Promise<string> {
    if (!this.anyMarkRootId) return '';
    
    const pathParts: string[] = [];
    let currentId = chromeId;
    
    while (currentId && currentId !== this.anyMarkRootId) {
      const node = await this.getBookmark(currentId);
      if (!node) break;
      
      if (node.parentId !== this.anyMarkRootId) {
        pathParts.unshift(node.title);
      }
      currentId = node.parentId || '';
    }
    
    return '/' + pathParts.join('/');
  }
  
  // ============ 事件监听 ============
  
  /**
   * 设置 Chrome 书签事件监听器
   */
  private setupEventListeners(): void {
    if (this.listenersSetup) return;
    
    console.log('[BookmarkService] Setting up event listeners...');
    
    chrome.bookmarks.onCreated.addListener(this.handleBookmarkCreated.bind(this));
    chrome.bookmarks.onRemoved.addListener(this.handleBookmarkRemoved.bind(this));
    chrome.bookmarks.onChanged.addListener(this.handleBookmarkChanged.bind(this));
    chrome.bookmarks.onMoved.addListener(this.handleBookmarkMoved.bind(this));
    
    this.listenersSetup = true;
    console.log('[BookmarkService] Event listeners setup complete');
  }
  
  /**
   * 处理书签创建事件
   */
  private async handleBookmarkCreated(
    id: string,
    bookmark: ChromeBookmarkTreeNode
  ): Promise<void> {
    // 检查全局导入锁
    // 注意：这是为了防止后台批量导入时，UI 收到大量事件导致死循环
    try {
      const lock = await chrome.storage.local.get('bookmarkImportLock');
      if (lock.bookmarkImportLock) {
        // 检查锁是否过期（防止锁死）
        const now = Date.now();
        const timestamp = lock.bookmarkImportLock.timestamp;
        if (timestamp && now - timestamp < 5 * 60 * 1000) {
          console.log('[BookmarkService] Skipping created event due to global import lock:', id);
          // 仍然更新本地缓存，保证后续操作正常
          this.anyMarkNodeIds.add(id);
          return;
        }
      }
    } catch (e) {
      console.warn('[BookmarkService] Failed to check import lock:', e);
    }

    // 批量导入期间跳过事件通知，避免 UI 死循环
    if (this.isImporting) {
      console.log('[BookmarkService] Skipping created event during import:', id);
      // 仍然更新缓存
      this.anyMarkNodeIds.add(id);
      return;
    }
    
    // 检查是否在 AnyMark_Root 内
    const isWithin = await this.checkIsWithinAnyMarkRoot(id);
    if (!isWithin) {
      console.log('[BookmarkService] Ignoring created bookmark outside AnyMark:', id);
      return;
    }
    
    // 更新缓存
    this.anyMarkNodeIds.add(id);
    
    console.log('[BookmarkService] Bookmark created in AnyMark:', id, bookmark.title);
    
    // 通知回调
    for (const callback of this.onCreatedCallbacks) {
      try {
        callback(bookmark);
      } catch (error) {
        console.error('[BookmarkService] onCreated callback error:', error);
      }
    }
  }
  
  /**
   * 处理书签删除事件
   */
  private async handleBookmarkRemoved(
    id: string,
    removeInfo: chrome.bookmarks.BookmarkRemoveInfo
  ): Promise<void> {
    // 检查全局导入锁
    try {
      const lock = await chrome.storage.local.get('bookmarkImportLock');
      if (lock.bookmarkImportLock) {
        const now = Date.now();
        const timestamp = lock.bookmarkImportLock.timestamp;
        if (timestamp && now - timestamp < 5 * 60 * 1000) {
          console.log('[BookmarkService] Skipping removed event due to global import lock:', id);
          this.anyMarkNodeIds.delete(id);
          return;
        }
      }
    } catch (e) {
      console.warn('[BookmarkService] Failed to check import lock:', e);
    }

    // 批量导入/清空期间跳过事件通知，避免 UI 频繁刷新导致“导入中”假死
    // 注意：导入结束后会 rebuildNodeIdCache() 重建缓存，因此这里不强求完整一致性
    if (this.isImporting) {
      console.log('[BookmarkService] Skipping removed event during import:', id);
      this.anyMarkNodeIds.delete(id);
      return;
    }

    // 检查是否在 AnyMark_Root 内（使用缓存）
    if (!this.anyMarkNodeIds.has(id)) {
      console.log('[BookmarkService] Ignoring removed bookmark outside AnyMark:', id);
      return;
    }
    
    // 更新缓存
    this.anyMarkNodeIds.delete(id);
    
    console.log('[BookmarkService] Bookmark removed from AnyMark:', id);
    
    // 通知回调
    for (const callback of this.onRemovedCallbacks) {
      try {
        callback(id, removeInfo);
      } catch (error) {
        console.error('[BookmarkService] onRemoved callback error:', error);
      }
    }
  }
  
  /**
   * 处理书签修改事件
   */
  private async handleBookmarkChanged(
    id: string,
    changeInfo: chrome.bookmarks.BookmarkChangeInfo
  ): Promise<void> {
    // 检查全局导入锁
    try {
      const lock = await chrome.storage.local.get('bookmarkImportLock');
      if (lock.bookmarkImportLock) {
        const now = Date.now();
        const timestamp = lock.bookmarkImportLock.timestamp;
        if (timestamp && now - timestamp < 5 * 60 * 1000) {
          console.log('[BookmarkService] Skipping changed event due to global import lock:', id);
          return;
        }
      }
    } catch (e) {
      console.warn('[BookmarkService] Failed to check import lock:', e);
    }

    // 批量导入期间跳过事件通知，避免 UI 频繁刷新
    if (this.isImporting) {
      console.log('[BookmarkService] Skipping changed event during import:', id);
      return;
    }

    // 检查是否在 AnyMark_Root 内
    if (!this.anyMarkNodeIds.has(id)) {
      console.log('[BookmarkService] Ignoring changed bookmark outside AnyMark:', id);
      return;
    }
    
    console.log('[BookmarkService] Bookmark changed in AnyMark:', id, changeInfo);
    
    // 通知回调
    for (const callback of this.onChangedCallbacks) {
      try {
        callback(id, changeInfo);
      } catch (error) {
        console.error('[BookmarkService] onChanged callback error:', error);
      }
    }
  }
  
  /**
   * 处理书签移动事件
   */
  private async handleBookmarkMoved(
    id: string,
    moveInfo: chrome.bookmarks.BookmarkMoveInfo
  ): Promise<void> {
    // 检查全局导入锁
    try {
      const lock = await chrome.storage.local.get('bookmarkImportLock');
      if (lock.bookmarkImportLock) {
        const now = Date.now();
        const timestamp = lock.bookmarkImportLock.timestamp;
        if (timestamp && now - timestamp < 5 * 60 * 1000) {
          console.log('[BookmarkService] Skipping moved event due to global import lock:', id);
          return;
        }
      }
    } catch (e) {
      console.warn('[BookmarkService] Failed to check import lock:', e);
    }

    // 批量导入/清空期间跳过事件通知，避免 UI 频繁刷新导致死循环
    // 缓存最终会在导入结束后重建
    if (this.isImporting) {
      console.log('[BookmarkService] Skipping moved event during import:', id);
      return;
    }

    const wasInAnyMark = this.anyMarkNodeIds.has(id);
    const isNowInAnyMark = await this.checkIsWithinAnyMarkRoot(id);
    
    // 更新缓存
    if (isNowInAnyMark && !wasInAnyMark) {
      // 移入 AnyMark
      this.anyMarkNodeIds.add(id);
      console.log('[BookmarkService] Bookmark moved into AnyMark:', id);
    } else if (!isNowInAnyMark && wasInAnyMark) {
      // 移出 AnyMark
      this.anyMarkNodeIds.delete(id);
      console.log('[BookmarkService] Bookmark moved out of AnyMark:', id);
    } else if (isNowInAnyMark) {
      // 在 AnyMark 内移动
      console.log('[BookmarkService] Bookmark moved within AnyMark:', id, moveInfo);
    } else {
      // 不在 AnyMark 内，忽略
      console.log('[BookmarkService] Ignoring moved bookmark outside AnyMark:', id);
      return;
    }
    
    // 通知回调
    for (const callback of this.onMovedCallbacks) {
      try {
        callback(id, moveInfo);
      } catch (error) {
        console.error('[BookmarkService] onMoved callback error:', error);
      }
    }
  }
  
  // ============ 导入功能 ============
  
  /**
   * 从 Chrome Native 导入书签到 AnyMark 文件夹
   * 全量导入：保持原有的完整层级结构
   */
  async importFromChromeNative(
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    console.log('[BookmarkService] Starting FULL import from Chrome Native...');
    
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 设置导入状态，禁用事件通知
    this.isImporting = true;
    console.log('[BookmarkService] Import mode enabled - event notifications disabled');
    
    const result: ImportResult = {
      success: false,
      importedBookmarks: 0,
      importedFolders: 0,
      skippedDuplicates: 0,
      errors: [],
    };
    
    try {
      // 0. 安全检查：如果 AnyMark 文件夹已有内容，禁止执行追加导入
      // 防止用户多次点击导致数据重复（Structure imported twice）
      if (this.anyMarkRootId) {
        const currentContent = await chrome.bookmarks.getChildren(this.anyMarkRootId);
        if (currentContent.length > 0) {
          console.warn('[BookmarkService] AnyMark folder already contains data. Skipping safe import to prevent duplication.');
          result.success = true; // 视为成功，但不做任何事
          result.errors.push('AnyMark folder is not empty. Use "Re-import" to reset.');
          return result;
        }
      }

      // 1. 获取 Chrome 书签树
      const chromeTree = await chrome.bookmarks.getTree();
      const root = chromeTree[0];
      
      if (!root || !root.children) {
        console.log('[BookmarkService] No bookmarks to import');
        result.success = true;
        return result;
      }
      
      // 2. 构建现有 AnyMark 书签的 URL+路径 映射（用于精确去重）
      // 只有 URL 和文件夹路径都相同才算重复
      const existingBookmarks = new Map<string, Set<string>>(); // URL -> Set of folder paths
      const anyMarkTree = await this.getBookmarkTree();
      if (anyMarkTree) {
        this.collectBookmarksWithPaths(anyMarkTree, existingBookmarks, '');
      }
      
      console.log('[BookmarkService] Existing bookmarks in AnyMark:', existingBookmarks.size, 'unique URLs');
      
      // 3. 遍历 Chrome 书签树，全量导入到 AnyMark
      // Chrome 书签树结构：root -> [Bookmarks Bar, Other Bookmarks, Mobile Bookmarks]
      // 全量导入：保持完整的文件夹层级结构
      for (const topFolder of root.children) {
        // 跳过空文件夹
        if (!topFolder.children || topFolder.children.length === 0) {
          console.log('[BookmarkService] Skipping empty folder:', topFolder.title);
          continue;
        }
        
        // 跳过 AnyMark 文件夹本身（避免循环导入）
        if (topFolder.id === this.anyMarkRootId) {
          console.log('[BookmarkService] Skipping AnyMark folder itself');
          continue;
        }
        
        // 为每个顶级文件夹创建对应的文件夹在 AnyMark 下
        // 这样保持完整的层级结构：AnyMark/Bookmarks Bar/..., AnyMark/Other Bookmarks/...
        console.log('[BookmarkService] Importing folder:', topFolder.title);
        
        // 检查是否已存在同名文件夹
        const existingFolder = await this.findChildByTitle(this.anyMarkRootId!, topFolder.title);
        let targetFolderId: string;
        
        if (existingFolder) {
          targetFolderId = existingFolder.id;
          console.log('[BookmarkService] Using existing folder:', topFolder.title, 'id:', targetFolderId);
        } else {
          targetFolderId = await this.createFolder({
            title: topFolder.title,
            parentId: this.anyMarkRootId!,
          });
          result.importedFolders++;
          console.log('[BookmarkService] Created folder:', topFolder.title, 'id:', targetFolderId);
        }
        
        // 递归导入该文件夹的所有内容
        // 路径格式统一使用 /FolderName 格式，与 collectBookmarksWithPaths 保持一致
        await this.importChildrenFull(
          topFolder.children,
          targetFolderId,
          `/${topFolder.title}`, // 当前路径，使用 / 前缀保持一致
          existingBookmarks, // 传递去重映射
          result,
          onProgress
        );
      }
      
      // 4. 重建节点 ID 缓存
      await this.rebuildNodeIdCache();
      
      result.success = true;
      console.log('[BookmarkService] FULL import completed:', result);
      return result;
      
    } catch (error) {
      console.error('[BookmarkService] Import failed:', error);
      result.errors.push(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    } finally {
      // 重置导入状态，恢复事件通知
      this.isImporting = false;
      console.log('[BookmarkService] Import mode disabled - event notifications restored');
    }
  }
  
  /**
   * 递归导入子节点（全量导入版本，保持完整层级）
   */
  private async importChildrenFull(
    children: ChromeBookmarkTreeNode[],
    parentId: string,
    currentPath: string,
    existingBookmarks: Map<string, Set<string>>,
    result: ImportResult,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<void> {
    for (const child of children) {
      try {
        // 跳过 AnyMark 文件夹本身（避免循环导入）
        // 检查 ID 和文件夹名称，防止无限循环
        if (child.id === this.anyMarkRootId) {
          console.log('[BookmarkService] Skipping AnyMark folder by ID in importChildrenFull');
          continue;
        }
        
        // 额外检查：跳过名为 AnyMark 的文件夹（防止导入已存在的 AnyMark 副本）
        if (!child.url && child.title === ANYMARK_ROOT_FOLDER_NAME) {
          console.log('[BookmarkService] Skipping folder named AnyMark to prevent recursion:', child.id);
          continue;
        }
        
        // 关键修复：检查当前节点是否在 AnyMark 文件夹内（通过缓存判断）
        // 这可以防止导入 Other Bookmarks/AnyMark/... 下的内容
        if (this.anyMarkNodeIds.has(child.id)) {
          console.log('[BookmarkService] Skipping node already in AnyMark:', child.id, child.title);
          continue;
        }
        
        if (child.url) {
          // 是书签 - 检查是否在同一路径下已存在
          const existingPaths = existingBookmarks.get(child.url);
          if (existingPaths && existingPaths.has(currentPath)) {
            result.skippedDuplicates++;
            console.log('[BookmarkService] Skipping duplicate (same URL + path):', child.title, 'in', currentPath);
            continue;
          }
          
          await this.createBookmark({
            url: child.url,
            title: child.title,
            parentId,
          });
          
          // 更新已存在的书签映射
          if (!existingBookmarks.has(child.url)) {
            existingBookmarks.set(child.url, new Set());
          }
          existingBookmarks.get(child.url)!.add(currentPath);
          
          result.importedBookmarks++;
          
          onProgress?.({
            phase: 'bookmarks',
            current: result.importedBookmarks,
            currentItem: child.title,
          });
          
        } else if (child.children) {
          // 是文件夹 - 创建并递归导入
          const childPath = `${currentPath}/${child.title}`;
          
          // 检查是否已存在同名文件夹
          const existingFolder = await this.findChildByTitle(parentId, child.title);
          let folderId: string;
          
          if (existingFolder) {
            folderId = existingFolder.id;
            console.log('[BookmarkService] Using existing folder:', child.title);
          } else {
            folderId = await this.createFolder({
              title: child.title,
              parentId,
            });
            result.importedFolders++;
            console.log('[BookmarkService] Created folder:', child.title);
          }
          
          // 递归导入子节点
          await this.importChildrenFull(
            child.children,
            folderId,
            childPath,
            existingBookmarks,
            result,
            onProgress
          );
        }
      } catch (error) {
        console.error('[BookmarkService] Failed to import:', child.title, error);
        result.errors.push(`Failed to import ${child.title}: ${error}`);
      }
    }
  }

  /**
   * 递归导入子节点（带跳过集合版本，用于重新导入）
   * 与 importChildrenFull 类似，但使用传入的跳过集合而不是 anyMarkNodeIds
   */
  private async importChildrenFullWithSkipSet(
    children: ChromeBookmarkTreeNode[],
    parentId: string,
    currentPath: string,
    existingBookmarks: Map<string, Set<string>>,
    skipNodeIds: Set<string>,
    result: ImportResult,
    onProgress?: (progress: ImportProgress) => void,
    urlMetadataMap?: Map<string, any>,
    metadataService?: any
  ): Promise<void> {
    for (const child of children) {
      try {
        // 跳过 AnyMark 文件夹本身
        if (child.id === this.anyMarkRootId) {
          console.log('[BookmarkService] Skipping AnyMark folder by ID');
          continue;
        }
        
        // 跳过名为 AnyMark 的文件夹
        if (!child.url && child.title === ANYMARK_ROOT_FOLDER_NAME) {
          console.log('[BookmarkService] Skipping folder named AnyMark:', child.id);
          continue;
        }
        
        // 关键：使用传入的跳过集合检查
        // 这可以防止导入 Other Bookmarks/AnyMark/... 下的内容
        if (skipNodeIds.has(child.id)) {
          console.log('[BookmarkService] Skipping node in skip set:', child.id, child.title);
          continue;
        }
        
        if (child.url) {
          // 是书签
          const chromeId = await this.createBookmark({
            url: child.url,
            title: child.title,
            parentId,
          });
          
          // 尝试恢复元数据
          if (urlMetadataMap && metadataService && urlMetadataMap.has(child.url)) {
            const preservedMeta = urlMetadataMap.get(child.url);
            if (preservedMeta) {
              await metadataService.setMetadata(chromeId, preservedMeta);
              // console.log('[BookmarkService] Restored metadata for:', child.title);
            }
          }
          
          result.importedBookmarks++;
          
          onProgress?.({
            phase: 'bookmarks',
            current: result.importedBookmarks,
            currentItem: child.title,
          });
          
        } else if (child.children) {
          // 是文件夹 - 创建并递归导入
          const childPath = `${currentPath}/${child.title}`;
          
          const folderId = await this.createFolder({
            title: child.title,
            parentId,
          });
          result.importedFolders++;
          console.log('[BookmarkService] Created folder:', child.title);
          
          // 递归导入子节点
          await this.importChildrenFullWithSkipSet(
            child.children,
            folderId,
            childPath,
            existingBookmarks,
            skipNodeIds,
            result,
            onProgress,
            urlMetadataMap,
            metadataService
          );
        }
      } catch (error) {
        console.error('[BookmarkService] Failed to import:', child.title, error);
        result.errors.push(`Failed to import ${child.title}: ${error}`);
      }
    }
  }
  
  /**
   * 收集节点下所有书签的 URL 和路径（用于精确去重）
   */
  private collectBookmarksWithPaths(
    node: ChromeBookmarkTreeNode, 
    bookmarks: Map<string, Set<string>>,
    currentPath: string
  ): void {
    if (node.url) {
      if (!bookmarks.has(node.url)) {
        bookmarks.set(node.url, new Set());
      }
      bookmarks.get(node.url)!.add(currentPath);
    }
    if (node.children) {
      for (const child of node.children) {
        const childPath = child.url ? currentPath : `${currentPath}/${child.title}`;
        this.collectBookmarksWithPaths(child, bookmarks, child.url ? currentPath : childPath);
      }
    }
  }
  
  /**
   * 在指定文件夹下查找同名子节点
   */
  private async findChildByTitle(
    parentId: string,
    title: string
  ): Promise<ChromeBookmarkTreeNode | null> {
    const children = await this.getChildren(parentId);
    return children.find(c => c.title === title) || null;
  }

  /**
   * 清空 AnyMark 文件夹中的所有内容（保留文件夹本身）
   */
  async clearAnyMarkFolder(): Promise<void> {
    if (!this.anyMarkRootId) {
      throw new BookmarkServiceError('Service not initialized', 'clearAnyMarkFolder');
    }

    console.log('[BookmarkService] Clearing AnyMark folder...');

    // 获取 AnyMark_Root 下的所有子节点
    const children = await this.getChildren(this.anyMarkRootId);

    // 删除所有子节点（从后往前删除，避免索引问题）
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      try {
        if (child.url) {
          // 是书签，直接删除
          await chrome.bookmarks.remove(child.id);
          this.anyMarkNodeIds.delete(child.id);
        } else {
          // 是文件夹，删除整个子树
          await chrome.bookmarks.removeTree(child.id);
          // 删除子树中的所有节点ID
          const idsToRemove = await this.collectDescendantIds(child.id);
          for (const id of idsToRemove) {
            this.anyMarkNodeIds.delete(id);
          }
        }
        console.log(`[BookmarkService] Cleared: ${child.title}`);
      } catch (error) {
        console.error(`[BookmarkService] Failed to clear ${child.title}:`, error);
      }
    }

    console.log('[BookmarkService] AnyMark folder cleared');
  }

  /**
   * 重新导入：先清空 AnyMark 文件夹，然后重新导入 Chrome 书签
   * 修复：在清空前备份 AI 元数据，并在导入时根据 URL 恢复，防止数据丢失
   */
  async reimportFromChromeNative(
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    console.log('[BookmarkService] Starting REIMPORT from Chrome Native (Smart Mode)...');

    if (!this.initialized) {
      await this.initialize();
    }

    // 设置导入状态，禁用事件通知
    this.isImporting = true;
    console.log('[BookmarkService] Import mode enabled - event notifications disabled');

    const result: ImportResult = {
      success: false,
      importedBookmarks: 0,
      importedFolders: 0,
      skippedDuplicates: 0,
      errors: [],
    };

    try {
      const metadataService = (await import('./metadataService')).getMetadataService();
      await metadataService.initialize();

      // 1. 【关键修复】备份现有的元数据 (URL -> Metadata)
      // 这样即使 ID 变了，只要 URL 还在，AI 分析结果就能保留
      const urlMetadataBackup = new Map<string, any>();
      const currentTree = await this.getBookmarkTree();
      
      if (currentTree) {
        const backupMetadataRecursive = async (node: ChromeBookmarkTreeNode) => {
          if (node.url) {
            const meta = await metadataService.getMetadata(node.id);
            if (meta) {
              // 只有包含有价值信息（非默认）的元数据才备份
              // 例如：有 AI 摘要、有标签、或者是 manual 导入的
              if (meta.aiSummary || (meta.aiTags && meta.aiTags.length > 0) || meta.userTags?.length) {
                urlMetadataBackup.set(node.url, meta);
              }
            }
          }
          if (node.children) {
            for (const child of node.children) {
              await backupMetadataRecursive(child);
            }
          }
        };
        await backupMetadataRecursive(currentTree);
      }
      console.log(`[BookmarkService] Backed up metadata for ${urlMetadataBackup.size} URLs`);

      // 2. 在清空前，记录 AnyMark 文件夹内所有节点的 ID（用于导入时跳过）
      const anyMarkNodeIdsBeforeClear = new Set(this.anyMarkNodeIds);
      
      // 3. 清空 AnyMark 文件夹
      await this.clearAnyMarkFolder();

      // 4. 重新导入
      const chromeTree = await chrome.bookmarks.getTree();
      const root = chromeTree[0];

      if (!root || !root.children) {
        console.log('[BookmarkService] No bookmarks to import');
        result.success = true;
        return result;
      }

      // 5. 遍历 Chrome 书签树，全量导入到 AnyMark
      for (const topFolder of root.children) {
        if (!topFolder.children || topFolder.children.length === 0) continue;
        if (topFolder.id === this.anyMarkRootId) continue;

        console.log('[BookmarkService] Reimporting folder:', topFolder.title);

        const targetFolderId = await this.createFolder({
          title: topFolder.title,
          parentId: this.anyMarkRootId!,
        });
        result.importedFolders++;

        // 递归导入，并传入元数据备份
        await this.importChildrenFullWithSkipSet(
          topFolder.children,
          targetFolderId,
          `/${topFolder.title}`,
          new Map(), // 空的去重映射
          anyMarkNodeIdsBeforeClear,
          result,
          onProgress,
          urlMetadataBackup, // 传入备份
          metadataService    // 传入服务
        );
      }

      // 6. 重建节点 ID 缓存
      await this.rebuildNodeIdCache();

      result.success = true;
      console.log('[BookmarkService] REIMPORT completed:', result);
      return result;

    } catch (error) {
      console.error('[BookmarkService] Reimport failed:', error);
      result.errors.push(`Reimport failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    } finally {
      // 重置导入状态，恢复事件通知
      this.isImporting = false;
      console.log('[BookmarkService] Import mode disabled - event notifications restored');
    }
  }

  /**
   * 从 JSON 导入书签 (V2 架构)
   * 支持导入包含元数据的备份文件
   */
  async importFromJSON(
    nodes: any[],
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    console.log('[BookmarkService] Starting JSON import...');
    
    if (!this.initialized) {
      await this.initialize();
    }
    
    this.isImporting = true;
    
    const result: ImportResult = {
      success: false,
      importedBookmarks: 0,
      importedFolders: 0,
      skippedDuplicates: 0,
      errors: [],
    };
    
    try {
      const metadataService = (await import('./metadataService')).getMetadataService();
      await metadataService.initialize();
      
      const rootId = this.getAnyMarkRootId();
      
      // 递归导入函数
      const importNodes = async (items: any[], parentId: string) => {
        for (const item of items) {
          try {
            if (item.type === 'folder' || item.children) {
              // 这是一个文件夹
              const folderId = await this.createFolder({
                title: item.title || 'Untitled Folder',
                parentId: parentId,
              });
              
              result.importedFolders++;
              
              if (item.children && Array.isArray(item.children)) {
                await importNodes(item.children, folderId);
              }
            } else {
              // 这是一个书签
              const url = item.url;
              if (!url) continue;
              
              const chromeId = await this.createBookmark({
                title: item.title || 'Untitled',
                url: url,
                parentId: parentId,
              });
              
              // 恢复元数据
              if (item.metadata) {
                await metadataService.setMetadata(chromeId, item.metadata);
              }
              
              result.importedBookmarks++;
              
              onProgress?.({
                phase: 'bookmarks',
                current: result.importedBookmarks,
                currentItem: item.title,
              });
            }
          } catch (error) {
            console.error('[BookmarkService] JSON import error for item:', item.title, error);
            result.errors.push(`Failed to import ${item.title}: ${error}`);
          }
        }
      };
      
      await importNodes(nodes, rootId);
      
      await this.rebuildNodeIdCache();
      result.success = true;
      console.log('[BookmarkService] JSON import completed:', result);
      
      return result;
      
    } catch (error) {
      console.error('[BookmarkService] JSON import failed:', error);
      result.errors.push(`JSON Import failed: ${error}`);
      return result;
    } finally {
      this.isImporting = false;
    }
  }

  // ============ 事件订阅 ============
  
  /**
   * 订阅书签创建事件
   */
  onBookmarkCreated(callback: BookmarkCreatedCallback): () => void {
    this.onCreatedCallbacks.push(callback);
    return () => {
      const index = this.onCreatedCallbacks.indexOf(callback);
      if (index > -1) this.onCreatedCallbacks.splice(index, 1);
    };
  }
  
  /**
   * 订阅书签删除事件
   */
  onBookmarkRemoved(callback: BookmarkRemovedCallback): () => void {
    this.onRemovedCallbacks.push(callback);
    return () => {
      const index = this.onRemovedCallbacks.indexOf(callback);
      if (index > -1) this.onRemovedCallbacks.splice(index, 1);
    };
  }
  
  /**
   * 订阅书签修改事件
   */
  onBookmarkChanged(callback: BookmarkChangedCallback): () => void {
    this.onChangedCallbacks.push(callback);
    return () => {
      const index = this.onChangedCallbacks.indexOf(callback);
      if (index > -1) this.onChangedCallbacks.splice(index, 1);
    };
  }
  
  /**
   * 订阅书签移动事件
   */
  onBookmarkMoved(callback: BookmarkMovedCallback): () => void {
    this.onMovedCallbacks.push(callback);
    return () => {
      const index = this.onMovedCallbacks.indexOf(callback);
      if (index > -1) this.onMovedCallbacks.splice(index, 1);
    };
  }
}

// ============ 导出 ============

/**
 * 导入进度
 */
export interface ImportProgress {
  phase: 'folders' | 'bookmarks';
  current: number;
  currentItem?: string;
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  importedBookmarks: number;
  importedFolders: number;
  skippedDuplicates: number;
  errors: string[];
}

/**
 * 获取 BookmarkService 单例
 */
export function getBookmarkService(): BookmarkService {
  return BookmarkService.getInstance();
}
