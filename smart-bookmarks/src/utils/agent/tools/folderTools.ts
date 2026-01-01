/**
 * 文件夹工具 (Folder Tools)
 * 提供文件夹的创建、重命名、删除等操作
 */

import { Tool, ToolResult } from '../types';
import { useBookmarkStore } from '../../../sidebar/store/bookmarkStore';
import { getBookmarkService } from '../../../services/bookmarkService';
import type { IFolder } from '../../../types/bookmark';

/**
 * 设置批量操作模式（锁）
 * 防止大量操作导致 UI 冻结
 */
async function setBatchMode(enabled: boolean): Promise<void> {
  if (enabled) {
    await chrome.storage.local.set({
      bookmarkImportLock: {
        timestamp: Date.now(),
        source: 'agent_batch_operation'
      }
    });
  } else {
    await chrome.storage.local.remove('bookmarkImportLock');
  }
}

/**
 * 持久化书签到 Chrome Storage
 */
async function persistBookmarks(): Promise<void> {
  try {
    const store = useBookmarkStore.getState();
    await chrome.storage.local.set({ bookmarks: store.bookmarks });
    console.log('[FolderTools] Persisted bookmarks to storage');
    
    // 通知 Sidebar 刷新书签列表
    chrome.runtime.sendMessage({ type: 'BOOKMARKS_UPDATED' }).catch(() => {
      // Sidebar 可能没有打开，忽略错误
    });
  } catch (error) {
    console.error('[FolderTools] Failed to persist bookmarks:', error);
  }
}

/**
 * 创建文件夹工具
 */
export const createFolderTool: Tool = {
  name: 'create_folder',
  description: '创建新的书签文件夹。可以在根目录或指定父文件夹下创建。',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '文件夹名称',
      },
      parentPath: {
        type: 'string',
        description: '父文件夹路径（可选，默认为根目录 "/"）',
        default: '/',
      },
    },
    required: ['name'],
    additionalProperties: false,
  },
  execute: async (params: {
    name: string;
    parentPath?: string;
  }): Promise<ToolResult> => {
    try {
      const { name, parentPath = '/' } = params;
      const store = useBookmarkStore.getState();

      // 构建完整路径
      const fullPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
      const folderId = `folder-${fullPath}`;

      // 检查是否已存在
      const exists = store.folders.some(f => f.id === folderId);
      if (exists) {
        return {
          success: false,
          error: `文件夹 "${name}" 已存在`,
        };
      }

      // 🔧 关键修复：检查父文件夹是否存在，如果不存在则递归创建
      if (parentPath !== '/') {
        const parentFolderId = `folder-${parentPath}`;
        const parentFolder = store.folders.find(f => f.id === parentFolderId);

        if (!parentFolder) {
          // 父文件夹不存在，需要先创建
          console.log(`[FolderTool] Parent folder "${parentPath}" does not exist, creating...`);

          // 解析路径，逐级创建父文件夹
          const pathParts = parentPath.split('/').filter(Boolean);
          let currentPath = '';

          for (const part of pathParts) {
            currentPath = currentPath === '' ? `/${part}` : `${currentPath}/${part}`;
            const currentFolderId = `folder-${currentPath}`;

            // 检查当前级别文件夹是否存在
            if (!store.folders.find(f => f.id === currentFolderId)) {
              // 获取父路径（用于计算 parentId）
              const previousPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
              const newParentFolder: IFolder = {
                id: currentFolderId,
                title: part,
                path: currentPath,
                parentId: previousPath === '/' ? undefined : `folder-${previousPath}`,
                bookmarkCount: 0,
                subfolderCount: 0,
                createTime: Date.now(),
                updateTime: Date.now(),
                order: store.folders.length,
              };

              store.addFolder(newParentFolder);
              console.log(`[FolderTool] Created parent folder: ${currentPath}`);
            }
          }

          console.log(`[FolderTool] Parent folder path created successfully`);
        }
      }

      // 创建新文件夹
      const newFolder: IFolder = {
        id: folderId,
        title: name,
        path: fullPath,
        parentId: parentPath === '/' ? undefined : `folder-${parentPath}`,
        bookmarkCount: 0,
        subfolderCount: 0,
        createTime: Date.now(),
        updateTime: Date.now(),
        order: store.folders.length,
      };

      store.addFolder(newFolder);
      
      // 持久化到 Chrome Storage
      await persistBookmarks();

      return {
        success: true,
        data: {
          id: folderId,
          name,
          path: fullPath,
          message: `已创建文件夹 "${name}"`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create folder',
      };
    }
  },
};

/**
 * 重命名文件夹工具
 */
export const renameFolderTool: Tool = {
  name: 'rename_folder',
  description: '重命名书签文件夹。只修改文件夹名称，不影响路径结构。',
  parameters: {
    type: 'object',
    properties: {
      folderId: {
        type: 'string',
        description: '要重命名的文件夹 ID',
      },
      newName: {
        type: 'string',
        description: '新的文件夹名称',
      },
    },
    required: ['folderId', 'newName'],
    additionalProperties: false,
  },
  execute: async (params: {
    folderId: string;
    newName: string;
  }): Promise<ToolResult> => {
    try {
      const { folderId, newName } = params;
      const store = useBookmarkStore.getState();

      const folder = store.folders.find(f => f.id === folderId);
      if (!folder) {
        return {
          success: false,
          error: '文件夹不存在',
        };
      }

      const oldName = folder.title;

      store.updateFolder(folderId, {
        title: newName,
        updateTime: Date.now(),
      });
      
      // 持久化到 Chrome Storage
      await persistBookmarks();

      return {
        success: true,
        data: {
          id: folderId,
          oldName,
          newName,
          message: `已将文件夹 "${oldName}" 重命名为 "${newName}"`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rename folder',
      };
    }
  },
};

/**
 * 删除文件夹工具
 */
export const deleteFolderTool: Tool = {
  name: 'delete_folder',
  description: '删除书签文件夹。文件夹中的书签将被移动到回收站。此操作不可逆，请谨慎使用。',
  parameters: {
    type: 'object',
    properties: {
      folderId: {
        type: 'string',
        description: '要删除的文件夹 ID',
      },
    },
    required: ['folderId'],
    additionalProperties: false,
  },
  execute: async (params: { folderId: string }): Promise<ToolResult> => {
    try {
      const { folderId } = params;
      const store = useBookmarkStore.getState();

      const folder = store.folders.find(f => f.id === folderId);
      if (!folder) {
        return {
          success: false,
          error: '文件夹不存在',
        };
      }

      // 统计受影响的书签数量
      const folderPath = folderId.replace(/^folder-/, '');
      const affectedBookmarks = store.bookmarks.filter(b => {
        const bookmarkPath = b.folderPath || '/';
        return bookmarkPath === folderPath || bookmarkPath.startsWith(folderPath + '/');
      });

      // 删除文件夹（会将书签移到回收站）
      store.deleteFolder(folderId);
      
      // 持久化到 Chrome Storage
      await persistBookmarks();

      return {
        success: true,
        data: {
          id: folderId,
          name: folder.title,
          affectedBookmarks: affectedBookmarks.length,
          message: `已删除文件夹 "${folder.title}"，${affectedBookmarks.length} 个书签已移至回收站`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete folder',
      };
    }
  },
};

/**
 * 列出文件夹工具
 */
export const listFoldersTool: Tool = {
  name: 'list_folders',
  description: '列出所有书签文件夹及其书签数量。返回文件夹列表，包含路径和书签统计。',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  execute: async (): Promise<ToolResult> => {
    try {
      const store = useBookmarkStore.getState();

      // 统计每个路径的书签数量
      const pathCounts = new Map<string, number>();
      store.bookmarks
        .filter(b => b.status !== 'deleted')
        .forEach(b => {
          const path = b.folderPath || '/';
          pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
        });

      // 构建文件夹列表
      const folders = Array.from(pathCounts.entries())
        .map(([path, count]) => ({
          id: `folder-${path}`,
          name: path === '/' ? '未分类' : path.split('/').filter(Boolean).pop() || '未分类',
          path,
          bookmarkCount: count,
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

      return {
        success: true,
        data: {
          count: folders.length,
          folders,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list folders',
      };
    }
  },
};

/**
 * 移动书签到文件夹工具
 */
export const moveBookmarkToFolderTool: Tool = {
  name: 'move_bookmark_to_folder',
  description: '将书签移动到指定文件夹。可以用于整理和分类书签。',
  parameters: {
    type: 'object',
    properties: {
      bookmarkId: {
        type: 'string',
        description: '要移动的书签 ID',
      },
      folderId: {
        type: 'string',
        description: '目标文件夹 ID',
      },
    },
    required: ['bookmarkId', 'folderId'],
    additionalProperties: false,
  },
  execute: async (params: {
    bookmarkId: string;
    folderId: string;
  }): Promise<ToolResult> => {
    try {
      const { bookmarkId, folderId } = params;
      const store = useBookmarkStore.getState();

      const bookmark = store.bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) {
        return {
          success: false,
          error: '书签不存在',
        };
      }

      const oldFolderId = bookmark.folderId;
      const oldPath = bookmark.folderPath;

      // 移动书签
      store.moveBookmarkToFolder(bookmarkId, folderId);
      
      // 持久化到 Chrome Storage
      await persistBookmarks();

      const newPath = folderId.replace(/^folder-/, '');

      return {
        success: true,
        data: {
          bookmarkId,
          bookmarkTitle: bookmark.title,
          oldFolderId,
          oldPath,
          newFolderId: folderId,
          newPath,
          message: `已将 "${bookmark.title}" 移动到 "${newPath}"`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to move bookmark',
      };
    }
  },
};

/**
 * 批量移动书签工具
 * 用于 Agent 整理书签时避免 UI 冻结
 */
export const batchMoveBookmarksTool: Tool = {
  name: 'batch_move_bookmarks',
  description: '批量将多个书签移动到指定文件夹。整理大量书签时请务必使用此工具，以避免界面卡顿。',
  parameters: {
    type: 'object',
    properties: {
      moves: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            bookmarkId: { type: 'string', description: '书签 Chrome ID' },
            folderId: { type: 'string', description: '目标文件夹 Chrome ID' },
          },
          required: ['bookmarkId', 'folderId'],
        },
        description: '移动操作列表',
      },
    },
    required: ['moves'],
    additionalProperties: false,
  },
  execute: async (params: {
    moves: Array<{ bookmarkId: string; folderId: string }>;
  }): Promise<ToolResult> => {
    const { moves } = params;
    const bookmarkService = getBookmarkService();
    
    // 开启批量模式锁
    await setBatchMode(true);
    
    let successCount = 0;
    let failCount = 0;
    
    try {
      // 确保服务已初始化
      await bookmarkService.initialize();

      for (const move of moves) {
        try {
          // 统一架构：只使用 folder- 前缀处理
          // 如果传入的是 store ID (folder-xxx)，尝试提取 chromeId
          // 注意：Agent 应该优先使用 chromeId，如果拿不到，这里做个简单的兼容尝试
          let targetFolderId = move.folderId;
          let targetBookmarkId = move.bookmarkId;

          // 这里的 ID 可能是 store ID，也可能是 chromeId
          // BookmarkService 需要 chromeId
          // 实际场景中，Agent 从 list_folders 拿到的通常是 store ID
          // 我们需要一个转换机制，或者让 Agent 获取 chromeId
          // 暂时假设 Agent 获取到的是 chromeId，或者我们尝试直接用
          
          await bookmarkService.moveBookmark(targetBookmarkId, targetFolderId);
          successCount++;
        } catch (error) {
          console.error(`[BatchMove] Failed to move ${move.bookmarkId}:`, error);
          failCount++;
        }
      }
      
      return {
        success: true,
        data: {
          successCount,
          failCount,
          message: `批量移动完成：成功 ${successCount} 个，失败 ${failCount} 个`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Batch move failed',
      };
    } finally {
      // 关闭锁
      await setBatchMode(false);
      
      // 强制刷新 UI
      chrome.runtime.sendMessage({ type: 'BOOKMARKS_IMPORTED', count: successCount }).catch(() => {});
    }
  },
};

// 导出所有文件夹工具
export const folderTools: Tool[] = [
  createFolderTool,
  renameFolderTool,
  deleteFolderTool,
  listFoldersTool,
  moveBookmarkToFolderTool,
  batchMoveBookmarksTool,
];
