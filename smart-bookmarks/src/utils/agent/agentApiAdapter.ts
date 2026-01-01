/**
 * Agent API 适配器
 * 
 * 提供统一的 API 接口，内部调用新架构的服务
 * 让 Agent 工具能够正确操作书签数据
 */

import { getBookmarkService } from '../../services/bookmarkService';
import { getMetadataService } from '../../services/metadataService';
import type { BookmarkMetadata } from '../../types/chromeBookmark';

/**
 * 添加书签（调用 Chrome API）
 */
export async function addBookmark(params: {
  url: string;
  title?: string;
  parentId?: string;
  tags?: string[];
  notes?: string;
}): Promise<{ chromeId: string; title: string }> {
  const { url, title, parentId, tags, notes } = params;
  
  try {
    const bookmarkService = getBookmarkService();
    const metadataService = getMetadataService();
    
    // 1. 在 Chrome Native 中创建书签
    const chromeId = await bookmarkService.createBookmark({
      url,
      title: title || url,
      parentId: parentId || bookmarkService.getAnyMarkRootId(),
    });
    
    // 2. 保存元数据
    const metadata: Partial<BookmarkMetadata> = {
      userTags: tags || [],
      userNotes: notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await metadataService.setMetadata(chromeId, metadata);
    
    console.log(`[AgentAPI] Created bookmark: ${chromeId}`);
    return { chromeId, title: title || url };
  } catch (error) {
    console.error('[AgentAPI] Failed to add bookmark:', error);
    throw error;
  }
}

/**
 * 更新书签元数据
 */
export async function updateBookmarkMetadata(
  chromeId: string,
  updates: Partial<BookmarkMetadata>
): Promise<void> {
  try {
    const metadataService = getMetadataService();
    await metadataService.setMetadata(chromeId, {
      ...updates,
      updatedAt: Date.now(),
    });
    
    console.log(`[AgentAPI] Updated bookmark metadata: ${chromeId}`);
  } catch (error) {
    console.error('[AgentAPI] Failed to update metadata:', error);
    throw error;
  }
}

/**
 * 更新书签标题（调用 Chrome API）
 */
export async function updateBookmarkTitle(
  chromeId: string,
  title: string
): Promise<void> {
  try {
    await chrome.bookmarks.update(chromeId, { title });
    console.log(`[AgentAPI] Updated bookmark title: ${chromeId}`);
  } catch (error) {
    console.error('[AgentAPI] Failed to update title:', error);
    throw error;
  }
}

/**
 * 删除书签（移到回收站）
 */
export async function deleteBookmark(chromeId: string): Promise<void> {
  try {
    const metadataService = getMetadataService();
    
    // 获取书签信息用于快照
    const [bookmark] = await chrome.bookmarks.get(chromeId);
    
    // 保存快照到 metadata
    await metadataService.setMetadata(chromeId, {
      status: 'deleted',
      snapshot: {
        url: bookmark.url!,
        title: bookmark.title,
        parentId: bookmark.parentId!,
        path: '/', // 简化版本
        dateAdded: bookmark.dateAdded!,
      },
    });
    
    // 从 Chrome Native 删除
    await chrome.bookmarks.remove(chromeId);
    
    console.log(`[AgentAPI] Deleted bookmark: ${chromeId}`);
  } catch (error) {
    console.error('[AgentAPI] Failed to delete bookmark:', error);
    throw error;
  }
}

/**
 * 恢复书签（从回收站）
 */
export async function restoreBookmark(chromeId: string): Promise<void> {
  try {
    const metadataService = getMetadataService();
    const metadata = await metadataService.getMetadata(chromeId);
    
    if (!metadata?.snapshot) {
      throw new Error('No snapshot found for bookmark');
    }
    
    // 在 Chrome Native 中重新创建
    const result = await chrome.bookmarks.create({
      url: metadata.snapshot.url,
      title: metadata.snapshot.title,
      parentId: metadata.snapshot.parentId,
    });
    
    // 复制元数据到新 ID
    await metadataService.setMetadata(result.id, {
      ...metadata,
      status: 'active',
      snapshot: undefined,
    });
    
    // 删除旧的元数据
    await metadataService.deleteMetadata(chromeId);
    
    console.log(`[AgentAPI] Restored bookmark: ${chromeId} -> ${result.id}`);
  } catch (error) {
    console.error('[AgentAPI] Failed to restore bookmark:', error);
    throw error;
  }
}

/**
 * 永久删除书签
 */
export async function permanentlyDeleteBookmark(chromeId: string): Promise<void> {
  try {
    const metadataService = getMetadataService();
    
    // 删除元数据
    await metadataService.deleteMetadata(chromeId);
    
    // 如果书签还在 Chrome 中，也删除
    try {
      await chrome.bookmarks.remove(chromeId);
    } catch {
      // 可能已经删除了，忽略错误
    }
    
    console.log(`[AgentAPI] Permanently deleted bookmark: ${chromeId}`);
  } catch (error) {
    console.error('[AgentAPI] Failed to permanently delete:', error);
    throw error;
  }
}

/**
 * 移动书签到指定文件夹
 */
export async function moveBookmark(
  chromeId: string,
  targetParentId: string
): Promise<void> {
  try {
    await chrome.bookmarks.move(chromeId, { parentId: targetParentId });
    console.log(`[AgentAPI] Moved bookmark: ${chromeId} to ${targetParentId}`);
  } catch (error) {
    console.error('[AgentAPI] Failed to move bookmark:', error);
    throw error;
  }
}

/**
 * 创建文件夹（调用 Chrome API）
 */
export async function createFolder(params: {
  title: string;
  parentId?: string;
}): Promise<{ chromeId: string; title: string }> {
  const { title, parentId } = params;
  
  try {
    const bookmarkService = getBookmarkService();
    
    const result = await chrome.bookmarks.create({
      title,
      parentId: parentId || bookmarkService.getAnyMarkRootId(),
    });
    
    console.log(`[AgentAPI] Created folder: ${result.id}`);
    return { chromeId: result.id, title: result.title };
  } catch (error) {
    console.error('[AgentAPI] Failed to create folder:', error);
    throw error;
  }
}

/**
 * 删除文件夹（调用 Chrome API）
 */
export async function deleteFolder(chromeId: string): Promise<void> {
  try {
    await chrome.bookmarks.removeTree(chromeId);
    console.log(`[AgentAPI] Deleted folder: ${chromeId}`);
  } catch (error) {
    console.error('[AgentAPI] Failed to delete folder:', error);
    throw error;
  }
}

/**
 * 重命名文件夹（调用 Chrome API）
 */
export async function renameFolder(
  chromeId: string,
  newTitle: string
): Promise<void> {
  try {
    await chrome.bookmarks.update(chromeId, { title: newTitle });
    console.log(`[AgentAPI] Renamed folder: ${chromeId}`);
  } catch (error) {
    console.error('[AgentAPI] Failed to rename folder:', error);
    throw error;
  }
}
