/**
 * MockBookmarkStore - 模拟书签存储
 * 
 * 实现 IBookmarkStore 接口，提供内存数据存储
 * 用于在非 Chrome 环境下测试 BashExecutor
 */

import type { MergedBookmark, MergedFolder, BookmarkAnalytics } from '../../types/chromeBookmark';
import type {
  IBookmarkStore,
  ErrorMode,
  StoreEventType,
  StoreEvent,
  StoreEventListener,
  MockFixture,
  MockBookmarkData,
  MockFolderData,
  StoreSnapshot,
} from './types';
import { generateId, deepClone, createMockStoreError } from './types';
import { DEFAULT_FIXTURE } from './MockFixtures';

// Chrome 顶级文件夹 ID
const TOP_LEVEL_IDS = ['1', '2', '3'];

// 顶级文件夹定义
const TOP_LEVEL_FOLDERS: MergedFolder[] = [
  {
    chromeId: '1',
    title: '书签栏',
    parentId: '0',
    index: 0,
    dateAdded: Date.now(),
    bookmarkCount: 0,
    subfolderCount: 0,
    path: '/书签栏',
  },
  {
    chromeId: '2',
    title: '其他书签',
    parentId: '0',
    index: 1,
    dateAdded: Date.now(),
    bookmarkCount: 0,
    subfolderCount: 0,
    path: '/其他书签',
  },
  {
    chromeId: '3',
    title: '移动设备书签',
    parentId: '0',
    index: 2,
    dateAdded: Date.now(),
    bookmarkCount: 0,
    subfolderCount: 0,
    path: '/移动设备书签',
  },
];

/**
 * MockBookmarkStore 类
 */
export class MockBookmarkStore implements IBookmarkStore {
  private _bookmarks: MergedBookmark[] = [];
  private _folders: MergedFolder[] = [];
  private _idCounter: number = 1000;
  private _eventListeners: Map<StoreEventType, StoreEventListener[]> = new Map();
  private _errorMode: ErrorMode | null = null;
  private _initialFixture: MockFixture | null = null;

  constructor(fixture?: MockFixture) {
    // 初始化顶级文件夹
    this._folders = deepClone(TOP_LEVEL_FOLDERS);
    
    // 加载 fixture
    if (fixture) {
      this._initialFixture = fixture;
      this._loadFixtureData(fixture);
    } else {
      this._initialFixture = DEFAULT_FIXTURE;
      this._loadFixtureData(DEFAULT_FIXTURE);
    }
    
    // 更新文件夹计数
    this._updateFolderCounts();
  }

  // ============ 数据访问 ============

  get bookmarks(): MergedBookmark[] {
    return this._bookmarks;
  }

  get folders(): MergedFolder[] {
    return this._folders;
  }

  // ============ 书签操作 ============

  async addBookmark(url: string, title: string, folderId?: string): Promise<string | null> {
    if (this._errorMode) {
      throw createMockStoreError(this._errorMode, `Error mode: ${this._errorMode}`);
    }

    const parentId = folderId || '1'; // 默认书签栏
    const chromeId = this._generateId('bm');
    
    const bookmark: MergedBookmark = {
      chromeId,
      url,
      title,
      parentId,
      index: this._bookmarks.filter(b => b.parentId === parentId).length,
      dateAdded: Date.now(),
      aiTags: [],
      aiTechStack: [],
      userTags: [],
      starred: false,
      pinned: false,
      analytics: { visitCount: 0, importance: 50 },
      favicon: this._getFaviconUrl(url),
      status: 'active',
    };

    this._bookmarks.push(bookmark);
    this._updateFolderCounts();
    this._emit('bookmark:added', { bookmark });

    return chromeId;
  }

  async updateBookmark(chromeId: string, changes: { title?: string; url?: string }): Promise<void> {
    if (this._errorMode) {
      throw createMockStoreError(this._errorMode, `Error mode: ${this._errorMode}`);
    }

    const index = this._bookmarks.findIndex(b => b.chromeId === chromeId);
    if (index === -1) {
      throw createMockStoreError('NOT_FOUND', `Bookmark not found: ${chromeId}`);
    }

    const oldBookmark = this._bookmarks[index];
    this._bookmarks[index] = { ...oldBookmark, ...changes };
    this._emit('bookmark:updated', { chromeId, changes, oldBookmark });
  }

  async deleteBookmark(chromeId: string): Promise<void> {
    if (this._errorMode) {
      throw createMockStoreError(this._errorMode, `Error mode: ${this._errorMode}`);
    }

    const index = this._bookmarks.findIndex(b => b.chromeId === chromeId);
    if (index === -1) {
      throw createMockStoreError('NOT_FOUND', `Bookmark not found: ${chromeId}`);
    }

    const deleted = this._bookmarks.splice(index, 1)[0];
    this._updateFolderCounts();
    this._emit('bookmark:deleted', { bookmark: deleted });
  }

  async moveBookmark(chromeId: string, newFolderId: string): Promise<void> {
    if (this._errorMode) {
      throw createMockStoreError(this._errorMode, `Error mode: ${this._errorMode}`);
    }

    const index = this._bookmarks.findIndex(b => b.chromeId === chromeId);
    if (index === -1) {
      throw createMockStoreError('NOT_FOUND', `Bookmark not found: ${chromeId}`);
    }

    // 验证目标文件夹存在
    const targetFolder = this._folders.find(f => f.chromeId === newFolderId);
    if (!targetFolder) {
      throw createMockStoreError('NOT_FOUND', `Folder not found: ${newFolderId}`);
    }

    const oldParentId = this._bookmarks[index].parentId;
    this._bookmarks[index] = {
      ...this._bookmarks[index],
      parentId: newFolderId,
      index: this._bookmarks.filter(b => b.parentId === newFolderId).length,
    };
    this._updateFolderCounts();
    this._emit('bookmark:moved', { chromeId, oldParentId, newParentId: newFolderId });
  }

  // ============ 文件夹操作 ============

  async createFolder(title: string, parentId?: string): Promise<string | null> {
    if (this._errorMode) {
      throw createMockStoreError(this._errorMode, `Error mode: ${this._errorMode}`);
    }

    const parent = parentId || '1'; // 默认书签栏
    const chromeId = this._generateId('folder');
    
    // 计算路径
    const parentFolder = this._folders.find(f => f.chromeId === parent);
    const path = parentFolder ? `${parentFolder.path}/${title}` : `/${title}`;

    const folder: MergedFolder = {
      chromeId,
      title,
      parentId: parent,
      index: this._folders.filter(f => f.parentId === parent).length,
      dateAdded: Date.now(),
      bookmarkCount: 0,
      subfolderCount: 0,
      path,
    };

    this._folders.push(folder);
    this._updateFolderCounts();
    this._emit('folder:created', { folder });

    return chromeId;
  }

  async renameFolder(chromeId: string, newTitle: string): Promise<void> {
    if (this._errorMode) {
      throw createMockStoreError(this._errorMode, `Error mode: ${this._errorMode}`);
    }

    // 不允许重命名顶级文件夹
    if (TOP_LEVEL_IDS.includes(chromeId)) {
      throw createMockStoreError('INVALID_OPERATION', 'Cannot rename top-level folder');
    }

    const index = this._folders.findIndex(f => f.chromeId === chromeId);
    if (index === -1) {
      throw createMockStoreError('NOT_FOUND', `Folder not found: ${chromeId}`);
    }

    const oldTitle = this._folders[index].title;
    const oldPath = this._folders[index].path;
    const newPath = oldPath.replace(new RegExp(`/${oldTitle}$`), `/${newTitle}`);

    this._folders[index] = {
      ...this._folders[index],
      title: newTitle,
      path: newPath,
    };

    // 更新子文件夹的路径
    this._updateChildPaths(chromeId, oldPath, newPath);
    
    this._emit('folder:renamed', { chromeId, oldTitle, newTitle });
  }

  async deleteFolder(chromeId: string): Promise<void> {
    if (this._errorMode) {
      throw createMockStoreError(this._errorMode, `Error mode: ${this._errorMode}`);
    }

    // 不允许删除顶级文件夹
    if (TOP_LEVEL_IDS.includes(chromeId)) {
      throw createMockStoreError('INVALID_OPERATION', 'Cannot delete top-level folder');
    }

    const index = this._folders.findIndex(f => f.chromeId === chromeId);
    if (index === -1) {
      throw createMockStoreError('NOT_FOUND', `Folder not found: ${chromeId}`);
    }

    // 递归删除子内容
    this._deleteDescendants(chromeId);

    const deleted = this._folders.splice(index, 1)[0];
    this._updateFolderCounts();
    this._emit('folder:deleted', { folder: deleted });
  }

  async moveFolder(chromeId: string, newParentId: string): Promise<void> {
    if (this._errorMode) {
      throw createMockStoreError(this._errorMode, `Error mode: ${this._errorMode}`);
    }

    // 不允许移动顶级文件夹
    if (TOP_LEVEL_IDS.includes(chromeId)) {
      throw createMockStoreError('INVALID_OPERATION', 'Cannot move top-level folder');
    }

    const index = this._folders.findIndex(f => f.chromeId === chromeId);
    if (index === -1) {
      throw createMockStoreError('NOT_FOUND', `Folder not found: ${chromeId}`);
    }

    // 验证目标文件夹存在
    const targetFolder = this._folders.find(f => f.chromeId === newParentId);
    if (!targetFolder && !TOP_LEVEL_IDS.includes(newParentId)) {
      throw createMockStoreError('NOT_FOUND', `Target folder not found: ${newParentId}`);
    }

    // 不能移动到自己或子文件夹
    if (this._isDescendant(newParentId, chromeId)) {
      throw createMockStoreError('INVALID_OPERATION', 'Cannot move folder into itself or its descendants');
    }

    const folder = this._folders[index];
    const oldParentId = folder.parentId;
    const oldPath = folder.path;
    
    // 计算新路径
    const newParentPath = targetFolder?.path || '';
    const newPath = `${newParentPath}/${folder.title}`;

    this._folders[index] = {
      ...folder,
      parentId: newParentId,
      path: newPath,
      index: this._folders.filter(f => f.parentId === newParentId).length,
    };

    // 更新子文件夹的路径
    this._updateChildPaths(chromeId, oldPath, newPath);
    this._updateFolderCounts();
    
    this._emit('folder:moved', { chromeId, oldParentId, newParentId });
  }

  // ============ 元数据操作 ============

  async toggleStarred(chromeId: string): Promise<void> {
    if (this._errorMode) {
      throw createMockStoreError(this._errorMode, `Error mode: ${this._errorMode}`);
    }

    const index = this._bookmarks.findIndex(b => b.chromeId === chromeId);
    if (index === -1) {
      throw createMockStoreError('NOT_FOUND', `Bookmark not found: ${chromeId}`);
    }

    const oldStarred = this._bookmarks[index].starred;
    this._bookmarks[index] = {
      ...this._bookmarks[index],
      starred: !oldStarred,
    };
    
    this._emit('bookmark:updated', { chromeId, changes: { starred: !oldStarred } });
  }

  // ============ 查询方法 ============

  getBookmarkById(chromeId: string): MergedBookmark | undefined {
    return this._bookmarks.find(b => b.chromeId === chromeId);
  }

  getFolderById(chromeId: string): MergedFolder | undefined {
    return this._folders.find(f => f.chromeId === chromeId);
  }

  // ============ 测试专用方法 ============

  /**
   * 重置到初始状态
   */
  reset(): void {
    this._bookmarks = [];
    this._folders = deepClone(TOP_LEVEL_FOLDERS);
    this._errorMode = null;
    
    if (this._initialFixture) {
      this._loadFixtureData(this._initialFixture);
    }
    
    this._updateFolderCounts();
    this._emit('store:reset', {});
  }

  /**
   * 清空所有数据（只保留顶级文件夹）
   */
  clear(): void {
    this._bookmarks = [];
    this._folders = deepClone(TOP_LEVEL_FOLDERS);
    this._errorMode = null;
    this._emit('store:cleared', {});
  }

  /**
   * 加载指定 fixture
   */
  loadFixture(fixture: MockFixture): void {
    this.clear();
    this._initialFixture = fixture;
    this._loadFixtureData(fixture);
    this._updateFolderCounts();
  }

  /**
   * 设置错误模式
   */
  setErrorMode(mode: ErrorMode | null): void {
    this._errorMode = mode;
  }

  /**
   * 获取当前错误模式
   */
  getErrorMode(): ErrorMode | null {
    return this._errorMode;
  }

  /**
   * 创建快照
   */
  snapshot(): StoreSnapshot {
    return {
      bookmarks: deepClone(this._bookmarks),
      folders: deepClone(this._folders),
      timestamp: Date.now(),
    };
  }

  /**
   * 恢复快照
   */
  restore(snapshot: StoreSnapshot): void {
    this._bookmarks = deepClone(snapshot.bookmarks);
    this._folders = deepClone(snapshot.folders);
    this._emit('store:reset', { fromSnapshot: true });
  }

  /**
   * 注册事件监听器
   */
  on(event: StoreEventType, callback: StoreEventListener): void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, []);
    }
    this._eventListeners.get(event)!.push(callback);
  }

  /**
   * 移除事件监听器
   */
  off(event: StoreEventType, callback: StoreEventListener): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // ============ 私有方法 ============

  private _generateId(prefix: string): string {
    return `${prefix}-${++this._idCounter}`;
  }

  private _getFaviconUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch {
      return '';
    }
  }

  private _emit(type: StoreEventType, payload: unknown): void {
    const event: StoreEvent = { type, payload, timestamp: Date.now() };
    const listeners = this._eventListeners.get(type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
  }

  private _loadFixtureData(fixture: MockFixture): void {
    // 加载文件夹
    for (const folderData of fixture.folders) {
      const folder = this._createFolderFromData(folderData);
      // 检查是否已存在（顶级文件夹）
      const existingIndex = this._folders.findIndex(f => f.chromeId === folder.chromeId);
      if (existingIndex === -1) {
        this._folders.push(folder);
      }
    }

    // 加载书签
    for (const bookmarkData of fixture.bookmarks) {
      const bookmark = this._createBookmarkFromData(bookmarkData);
      this._bookmarks.push(bookmark);
    }
  }

  private _createBookmarkFromData(data: MockBookmarkData): MergedBookmark {
    return {
      chromeId: data.chromeId,
      url: data.url,
      title: data.title,
      parentId: data.parentId,
      index: data.index ?? 0,
      dateAdded: data.dateAdded ?? Date.now(),
      aiTags: data.aiTags ?? [],
      aiSummary: data.aiSummary,
      aiCategory: data.aiCategory,
      aiSubcategory: data.aiSubcategory,
      aiConfidence: data.aiConfidence,
      aiTechStack: data.aiTechStack ?? [],
      userTags: data.userTags ?? [],
      starred: data.starred ?? false,
      pinned: data.pinned ?? false,
      analytics: {
        visitCount: data.analytics?.visitCount ?? 0,
        lastVisit: data.analytics?.lastVisit,
        importance: data.analytics?.importance ?? 50,
      },
      favicon: this._getFaviconUrl(data.url),
      status: data.status ?? 'active',
    };
  }

  private _createFolderFromData(data: MockFolderData): MergedFolder {
    // 计算路径
    const parentFolder = this._folders.find(f => f.chromeId === data.parentId);
    const path = parentFolder ? `${parentFolder.path}/${data.title}` : `/${data.title}`;

    return {
      chromeId: data.chromeId,
      title: data.title,
      parentId: data.parentId,
      index: data.index ?? 0,
      dateAdded: data.dateAdded ?? Date.now(),
      dateGroupModified: data.dateGroupModified,
      bookmarkCount: 0,
      subfolderCount: 0,
      path,
    };
  }

  private _updateFolderCounts(): void {
    for (const folder of this._folders) {
      folder.bookmarkCount = this._bookmarks.filter(b => b.parentId === folder.chromeId).length;
      folder.subfolderCount = this._folders.filter(f => f.parentId === folder.chromeId).length;
    }
  }

  private _updateChildPaths(parentId: string, oldParentPath: string, newParentPath: string): void {
    for (const folder of this._folders) {
      if (folder.path.startsWith(oldParentPath + '/')) {
        folder.path = folder.path.replace(oldParentPath, newParentPath);
      }
    }
  }

  private _deleteDescendants(folderId: string): void {
    // 删除直接子书签
    this._bookmarks = this._bookmarks.filter(b => b.parentId !== folderId);

    // 递归删除子文件夹
    const childFolders = this._folders.filter(f => f.parentId === folderId);
    for (const child of childFolders) {
      this._deleteDescendants(child.chromeId);
    }
    this._folders = this._folders.filter(f => f.parentId !== folderId);
  }

  private _isDescendant(potentialDescendant: string, ancestorId: string): boolean {
    if (potentialDescendant === ancestorId) return true;
    
    const folder = this._folders.find(f => f.chromeId === potentialDescendant);
    if (!folder || !folder.parentId || folder.parentId === '0') return false;
    
    return this._isDescendant(folder.parentId, ancestorId);
  }
}
