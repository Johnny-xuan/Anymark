/**
 * 批量操作确认服务
 * 
 * 在执行大量书签操作前，要求用户确认
 * 
 * 阈值：
 * - 移动操作：超过 5 个书签需要确认
 * - 删除操作：超过 3 个书签需要确认
 * - 文件夹删除：如果包含书签需要确认
 */

// ============ 类型定义 ============

/**
 * 批量操作类型
 */
export type BatchOperationType = 'move' | 'delete';

/**
 * 批量操作项
 */
export interface BatchOperationItem {
  id: string;
  title: string;
  currentPath?: string;
  targetPath?: string;
}

/**
 * 批量操作请求
 */
export interface BatchOperationRequest {
  type: BatchOperationType;
  items: BatchOperationItem[];
  totalCount: number;
}

/**
 * 批量操作阈值配置
 */
export interface BatchOperationThresholds {
  moveThreshold: number;    // 移动操作阈值，默认 5
  deleteThreshold: number;  // 删除操作阈值，默认 3
}

/**
 * 确认请求结果
 */
export interface ConfirmationRequest {
  required: boolean;
  type: BatchOperationType;
  count: number;
  threshold: number;
  message: string;
  preview: BatchOperationItem[];
  confirmationId: string;
}

// ============ 默认配置 ============

const DEFAULT_THRESHOLDS: BatchOperationThresholds = {
  moveThreshold: 5,
  deleteThreshold: 3,
};

// ============ 确认状态存储 ============

// 存储待确认的操作
const pendingConfirmations = new Map<string, BatchOperationRequest>();

// ============ 工具函数 ============

/**
 * 生成确认 ID
 */
function generateConfirmationId(): string {
  return `confirm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 检查是否需要确认
 * @param request 批量操作请求
 * @param thresholds 阈值配置（可选）
 * @returns 是否需要确认
 */
export function requiresConfirmation(
  request: BatchOperationRequest,
  thresholds: BatchOperationThresholds = DEFAULT_THRESHOLDS
): boolean {
  const { type, totalCount } = request;
  
  if (type === 'move') {
    return totalCount > thresholds.moveThreshold;
  } else if (type === 'delete') {
    return totalCount > thresholds.deleteThreshold;
  }
  
  return false;
}

/**
 * 生成确认消息
 * @param request 批量操作请求
 * @returns 确认消息
 */
export function generateConfirmationMessage(request: BatchOperationRequest): string {
  const { type, items, totalCount } = request;
  
  let message = '';
  
  if (type === 'move') {
    message = `⚠️ 即将移动 ${totalCount} 个书签\n\n`;
    message += `📋 受影响的书签（显示前 10 个）：\n`;
  } else if (type === 'delete') {
    message = `⚠️ 即将删除 ${totalCount} 个书签\n\n`;
    message += `📋 受影响的书签（显示前 10 个）：\n`;
  }
  
  // 显示前 10 个受影响的项
  const previewItems = items.slice(0, 10);
  previewItems.forEach((item, index) => {
    message += `${index + 1}. ${item.title}`;
    if (item.currentPath) {
      message += ` (📁 ${item.currentPath})`;
    }
    if (type === 'move' && item.targetPath) {
      message += ` → ${item.targetPath}`;
    }
    message += '\n';
  });
  
  if (totalCount > 10) {
    message += `...还有 ${totalCount - 10} 个\n`;
  }
  
  message += '\n请确认是否继续执行此操作？';
  
  return message;
}

/**
 * 创建确认请求
 * @param request 批量操作请求
 * @param thresholds 阈值配置（可选）
 * @returns 确认请求结果
 */
export function createConfirmationRequest(
  request: BatchOperationRequest,
  thresholds: BatchOperationThresholds = DEFAULT_THRESHOLDS
): ConfirmationRequest {
  const { type, items, totalCount } = request;
  const threshold = type === 'move' ? thresholds.moveThreshold : thresholds.deleteThreshold;
  const required = requiresConfirmation(request, thresholds);
  
  const confirmationId = generateConfirmationId();
  
  // 存储待确认的操作
  if (required) {
    pendingConfirmations.set(confirmationId, request);
  }
  
  return {
    required,
    type,
    count: totalCount,
    threshold,
    message: required ? generateConfirmationMessage(request) : '',
    preview: items.slice(0, 10),
    confirmationId,
  };
}

/**
 * 确认操作
 * @param confirmationId 确认 ID
 * @returns 原始操作请求，如果不存在则返回 null
 */
export function confirmOperation(confirmationId: string): BatchOperationRequest | null {
  const request = pendingConfirmations.get(confirmationId);
  if (request) {
    pendingConfirmations.delete(confirmationId);
    return request;
  }
  return null;
}

/**
 * 取消操作
 * @param confirmationId 确认 ID
 * @returns 是否成功取消
 */
export function cancelOperation(confirmationId: string): boolean {
  return pendingConfirmations.delete(confirmationId);
}

/**
 * 获取待确认的操作
 * @param confirmationId 确认 ID
 * @returns 操作请求，如果不存在则返回 null
 */
export function getPendingOperation(confirmationId: string): BatchOperationRequest | null {
  return pendingConfirmations.get(confirmationId) || null;
}

/**
 * 清理所有待确认的操作
 */
export function clearAllPendingOperations(): void {
  pendingConfirmations.clear();
}

/**
 * 获取待确认操作数量
 */
export function getPendingOperationCount(): number {
  return pendingConfirmations.size;
}

// ============ 文件夹删除确认 ============

/**
 * 文件夹删除确认请求
 */
export interface FolderDeleteConfirmationRequest {
  folderId: string;
  folderName: string;
  affectedBookmarks: BatchOperationItem[];
  totalAffectedCount: number;
}

/**
 * 检查文件夹删除是否需要确认
 * @param request 文件夹删除请求
 * @returns 是否需要确认
 */
export function folderDeleteRequiresConfirmation(
  request: FolderDeleteConfirmationRequest
): boolean {
  return request.totalAffectedCount > 0;
}

/**
 * 生成文件夹删除确认消息
 * @param request 文件夹删除请求
 * @returns 确认消息
 */
export function generateFolderDeleteConfirmationMessage(
  request: FolderDeleteConfirmationRequest
): string {
  const { folderName, affectedBookmarks, totalAffectedCount } = request;
  
  let message = `⚠️ 即将删除文件夹 "${folderName}"\n\n`;
  
  if (totalAffectedCount > 0) {
    message += `📋 此操作将影响 ${totalAffectedCount} 个书签：\n`;
    
    // 显示前 10 个受影响的书签
    const previewItems = affectedBookmarks.slice(0, 10);
    previewItems.forEach((item, index) => {
      message += `${index + 1}. ${item.title}\n`;
    });
    
    if (totalAffectedCount > 10) {
      message += `...还有 ${totalAffectedCount - 10} 个\n`;
    }
    
    message += '\n这些书签将被移至回收站。';
  }
  
  message += '\n\n请确认是否继续删除此文件夹？';
  
  return message;
}

/**
 * 创建文件夹删除确认请求
 * @param request 文件夹删除请求
 * @returns 确认请求结果
 */
export function createFolderDeleteConfirmationRequest(
  request: FolderDeleteConfirmationRequest
): ConfirmationRequest {
  const required = folderDeleteRequiresConfirmation(request);
  const confirmationId = generateConfirmationId();
  
  // 存储待确认的操作
  if (required) {
    const batchRequest: BatchOperationRequest = {
      type: 'delete',
      items: request.affectedBookmarks,
      totalCount: request.totalAffectedCount,
    };
    pendingConfirmations.set(confirmationId, batchRequest);
  }
  
  return {
    required,
    type: 'delete',
    count: request.totalAffectedCount,
    threshold: 0, // 文件夹删除只要有书签就需要确认
    message: required ? generateFolderDeleteConfirmationMessage(request) : '',
    preview: request.affectedBookmarks.slice(0, 10),
    confirmationId,
  };
}
