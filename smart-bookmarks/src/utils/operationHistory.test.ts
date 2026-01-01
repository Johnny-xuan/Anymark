/**
 * 操作历史属性测试
 * 
 * Feature: unified-chrome-bookmarks
 * 
 * Property 5: 批量操作阈值确认
 * Property 6: 操作历史记录完整性
 * Property 7: 操作历史容量限制
 * Property 8: 撤销操作正确性
 * 
 * Validates: Requirements 3.1-3.6, 4.1-4.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  requiresConfirmation,
  generateConfirmationMessage,
  createConfirmationRequest,
  folderDeleteRequiresConfirmation,
  type BatchOperationRequest,
  type BatchOperationThresholds,
  type BatchOperationItem,
  type FolderDeleteConfirmationRequest,
} from './batchConfirmation';

// ============ Mock Chrome API ============

let mockChromeStorage: Record<string, unknown> = {};

const mockStorageLocal = {
  get: vi.fn(async (keys: string | string[]) => {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const result: Record<string, unknown> = {};
    keyArray.forEach(key => {
      if (mockChromeStorage[key] !== undefined) {
        result[key] = mockChromeStorage[key];
      }
    });
    return result;
  }),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(mockChromeStorage, items);
  }),
};

const mockRuntime = {
  sendMessage: vi.fn(async () => {}),
};

const mockChrome = {
  storage: { local: mockStorageLocal },
  runtime: mockRuntime,
};

function resetMocks() {
  mockChromeStorage = {};
  vi.clearAllMocks();
}

// ============ Test Arbitraries ============

/**
 * 生成有效的书签标题
 */
const validTitleArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

/**
 * 生成有效的文件夹路径
 */
const validFolderPathArb = fc.array(
  fc.stringMatching(/^[a-zA-Z0-9\u4e00-\u9fa5]+$/u, { minLength: 1, maxLength: 20 }),
  { minLength: 0, maxLength: 3 }
).map(parts => parts.length > 0 ? '/' + parts.join('/') : '/');

/**
 * 生成批量操作项
 */
const batchOperationItemArb: fc.Arbitrary<BatchOperationItem> = fc.record({
  id: fc.uuid().map(id => `bookmark-${id}`),
  title: validTitleArb,
  currentPath: fc.option(validFolderPathArb, { nil: undefined }),
  targetPath: fc.option(validFolderPathArb, { nil: undefined }),
});

/**
 * 生成批量操作请求
 */
const batchOperationRequestArb = (
  type: 'move' | 'delete',
  minCount: number,
  maxCount: number
): fc.Arbitrary<BatchOperationRequest> => 
  fc.array(batchOperationItemArb, { minLength: minCount, maxLength: maxCount })
    .map(items => ({
      type,
      items,
      totalCount: items.length,
    }));

// ============ Property 5: 批量操作阈值确认 ============

describe('Property 5: 批量操作阈值确认', () => {
  /**
   * Property 5: 批量操作阈值确认
   * Feature: unified-chrome-bookmarks, Property 5: 批量操作阈值确认
   * Validates: Requirements 3.1, 3.2, 3.3
   * 
   * 对于任何批量移动操作（count > 5）或批量删除操作（count > 3），
   * 系统应该返回确认请求而不是执行操作
   */
  
  describe('移动操作阈值', () => {
    it('对于任何移动操作数量 <= 5，不应该需要确认', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (count) => {
            const items = Array.from({ length: count }, (_, i) => ({
              id: `bookmark-${i}`,
              title: `Bookmark ${i}`,
              currentPath: '/',
              targetPath: '/Target',
            }));
            
            const request: BatchOperationRequest = {
              type: 'move',
              items,
              totalCount: count,
            };
            
            return requiresConfirmation(request) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何移动操作数量 > 5，应该需要确认', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 6, max: 100 }),
          (count) => {
            const items = Array.from({ length: count }, (_, i) => ({
              id: `bookmark-${i}`,
              title: `Bookmark ${i}`,
              currentPath: '/',
              targetPath: '/Target',
            }));
            
            const request: BatchOperationRequest = {
              type: 'move',
              items,
              totalCount: count,
            };
            
            return requiresConfirmation(request) === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('删除操作阈值', () => {
    it('对于任何删除操作数量 <= 3，不应该需要确认', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }),
          (count) => {
            const items = Array.from({ length: count }, (_, i) => ({
              id: `bookmark-${i}`,
              title: `Bookmark ${i}`,
              currentPath: '/',
            }));
            
            const request: BatchOperationRequest = {
              type: 'delete',
              items,
              totalCount: count,
            };
            
            return requiresConfirmation(request) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何删除操作数量 > 3，应该需要确认', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 100 }),
          (count) => {
            const items = Array.from({ length: count }, (_, i) => ({
              id: `bookmark-${i}`,
              title: `Bookmark ${i}`,
              currentPath: '/',
            }));
            
            const request: BatchOperationRequest = {
              type: 'delete',
              items,
              totalCount: count,
            };
            
            return requiresConfirmation(request) === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('自定义阈值', () => {
    it('对于任何自定义阈值，应该正确判断是否需要确认', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 1, max: 50 }),
          fc.constantFrom('move', 'delete') as fc.Arbitrary<'move' | 'delete'>,
          (moveThreshold, deleteThreshold, count, type) => {
            const thresholds: BatchOperationThresholds = {
              moveThreshold,
              deleteThreshold,
            };
            
            const items = Array.from({ length: count }, (_, i) => ({
              id: `bookmark-${i}`,
              title: `Bookmark ${i}`,
            }));
            
            const request: BatchOperationRequest = {
              type,
              items,
              totalCount: count,
            };
            
            const threshold = type === 'move' ? moveThreshold : deleteThreshold;
            const expected = count > threshold;
            
            return requiresConfirmation(request, thresholds) === expected;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('确认消息生成', () => {
    it('对于任何需要确认的操作，确认消息应该包含操作数量', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 6, max: 50 }),
          fc.constantFrom('move', 'delete') as fc.Arbitrary<'move' | 'delete'>,
          (count, type) => {
            const items = Array.from({ length: count }, (_, i) => ({
              id: `bookmark-${i}`,
              title: `Bookmark ${i}`,
              currentPath: '/',
              targetPath: type === 'move' ? '/Target' : undefined,
            }));
            
            const request: BatchOperationRequest = {
              type,
              items,
              totalCount: count,
            };
            
            const message = generateConfirmationMessage(request);
            
            // 验证消息包含数量
            return message.includes(count.toString());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('确认消息应该最多显示前 10 个受影响项', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          (count) => {
            const items = Array.from({ length: count }, (_, i) => ({
              id: `bookmark-${i}`,
              title: `UniqueTitle_${i}`,
              currentPath: '/',
            }));
            
            const request: BatchOperationRequest = {
              type: 'delete',
              items,
              totalCount: count,
            };
            
            const message = generateConfirmationMessage(request);
            
            // 计算消息中出现的标题数量
            const displayedCount = Math.min(count, 10);
            let foundCount = 0;
            for (let i = 0; i < displayedCount; i++) {
              if (message.includes(`UniqueTitle_${i}`)) {
                foundCount++;
              }
            }
            
            // 验证显示的项目数量正确
            return foundCount === displayedCount;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('文件夹删除确认', () => {
    it('对于任何包含书签的文件夹删除，应该需要确认', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          validTitleArb,
          (bookmarkCount, folderName) => {
            const affectedBookmarks = Array.from({ length: bookmarkCount }, (_, i) => ({
              id: `bookmark-${i}`,
              title: `Bookmark ${i}`,
            }));
            
            const request: FolderDeleteConfirmationRequest = {
              folderId: 'folder-test',
              folderName,
              affectedBookmarks,
              totalAffectedCount: bookmarkCount,
            };
            
            return folderDeleteRequiresConfirmation(request) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何空文件夹删除，不应该需要确认', () => {
      fc.assert(
        fc.property(
          validTitleArb,
          (folderName) => {
            const request: FolderDeleteConfirmationRequest = {
              folderId: 'folder-test',
              folderName,
              affectedBookmarks: [],
              totalAffectedCount: 0,
            };
            
            return folderDeleteRequiresConfirmation(request) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// ============ Property 6, 7, 8: 操作历史测试 ============

describe('Operation History Properties', () => {
  beforeEach(() => {
    resetMocks();
    vi.stubGlobal('chrome', mockChrome);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /**
   * Property 6: 操作历史记录完整性
   * Feature: unified-chrome-bookmarks, Property 6: 操作历史记录完整性
   * Validates: Requirements 4.1
   * 
   * 对于任何书签操作（create/move/delete/rename），
   * 应该创建一个对应的操作历史记录，并保存操作前的状态用于撤销
   */
  describe('Property 6: 操作历史记录完整性', () => {
    it('对于任何记录的操作，应该生成唯一的操作 ID', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'move', 'delete', 'rename') as fc.Arbitrary<'create' | 'move' | 'delete' | 'rename'>,
          fc.constantFrom('bookmark', 'folder') as fc.Arbitrary<'bookmark' | 'folder'>,
          fc.uuid().map(id => `target-${id}`),
          async (type, targetType, targetId) => {
            resetMocks();
            vi.stubGlobal('chrome', mockChrome);
            
            // 创建新实例
            const service = new (OperationHistoryService as any)();
            await service.initialize();
            
            const operationId = await service.record({
              type,
              targetType,
              targetId,
              previousState: {
                folderPath: '/',
                title: 'Test',
              },
            });
            
            // 验证返回了有效的操作 ID
            return typeof operationId === 'string' && operationId.startsWith('op-');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何记录的操作，历史记录应该包含正确的操作类型和目标', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'move', 'delete', 'rename') as fc.Arbitrary<'create' | 'move' | 'delete' | 'rename'>,
          fc.constantFrom('bookmark', 'folder') as fc.Arbitrary<'bookmark' | 'folder'>,
          fc.uuid().map(id => `target-${id}`),
          async (type, targetType, targetId) => {
            resetMocks();
            vi.stubGlobal('chrome', mockChrome);
            
            const service = new (OperationHistoryService as any)();
            await service.initialize();
            
            await service.record({
              type,
              targetType,
              targetId,
              previousState: {
                folderPath: '/',
                title: 'Test',
              },
            });
            
            const history = service.getHistory();
            const lastOp = history[0];
            
            // 验证记录的操作信息正确
            return (
              lastOp.type === type &&
              lastOp.targetType === targetType &&
              lastOp.targetId === targetId
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于任何记录的操作，应该保存 previousState', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      await fc.assert(
        fc.asyncProperty(
          validFolderPathArb,
          validTitleArb,
          async (folderPath, title) => {
            resetMocks();
            vi.stubGlobal('chrome', mockChrome);
            
            const service = new (OperationHistoryService as any)();
            await service.initialize();
            
            await service.record({
              type: 'move',
              targetType: 'bookmark',
              targetId: 'test-bookmark',
              previousState: {
                folderPath,
                title,
              },
            });
            
            const history = service.getHistory();
            const lastOp = history[0];
            
            // 验证 previousState 被正确保存
            return (
              lastOp.previousState?.folderPath === folderPath &&
              lastOp.previousState?.title === title
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('记录的操作应该有时间戳', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'move', 'delete', 'rename') as fc.Arbitrary<'create' | 'move' | 'delete' | 'rename'>,
          async (type) => {
            resetMocks();
            vi.stubGlobal('chrome', mockChrome);
            
            const beforeTime = Date.now();
            
            const service = new (OperationHistoryService as any)();
            await service.initialize();
            
            await service.record({
              type,
              targetType: 'bookmark',
              targetId: 'test-bookmark',
            });
            
            const afterTime = Date.now();
            const history = service.getHistory();
            const lastOp = history[0];
            
            // 验证时间戳在合理范围内
            return (
              typeof lastOp.timestamp === 'number' &&
              lastOp.timestamp >= beforeTime &&
              lastOp.timestamp <= afterTime
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 7: 操作历史容量限制
   * Feature: unified-chrome-bookmarks, Property 7: 操作历史容量限制
   * Validates: Requirements 4.2
   * 
   * 对于任何状态的操作历史，条目数量不应超过 50
   */
  describe('Property 7: 操作历史容量限制', () => {
    it('对于任何数量的操作记录，历史记录不应超过 50 条', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (operationCount) => {
            resetMocks();
            vi.stubGlobal('chrome', mockChrome);
            
            const service = new (OperationHistoryService as any)();
            await service.initialize();
            
            // 记录多个操作
            for (let i = 0; i < operationCount; i++) {
              await service.record({
                type: 'create',
                targetType: 'bookmark',
                targetId: `bookmark-${i}`,
              });
            }
            
            const history = service.getHistory();
            
            // 验证历史记录不超过 50 条
            return history.length <= 50;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('当超过 50 条时，应该保留最新的 50 条记录', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 51, max: 100 }),
          async (operationCount) => {
            resetMocks();
            vi.stubGlobal('chrome', mockChrome);
            
            const service = new (OperationHistoryService as any)();
            await service.initialize();
            
            // 记录多个操作
            for (let i = 0; i < operationCount; i++) {
              await service.record({
                type: 'create',
                targetType: 'bookmark',
                targetId: `bookmark-${i}`,
              });
            }
            
            const history = service.getHistory();
            
            // 验证最新的记录在前面（最后添加的 targetId 应该是最大的）
            const lastAddedId = `bookmark-${operationCount - 1}`;
            
            return (
              history.length === 50 &&
              history[0].targetId === lastAddedId
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 8: 撤销操作正确性
   * Feature: unified-chrome-bookmarks, Property 8: 撤销操作正确性
   * Validates: Requirements 4.3-4.6
   * 
   * 对于任何记录的操作，调用 undo 应该反转操作：
   * - create → delete
   * - move → move back
   * - delete → recreate at original location
   */
  describe('Property 8: 撤销操作正确性', () => {
    it('撤销操作应该返回成功结果并包含正确的操作信息', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'move', 'delete', 'rename') as fc.Arbitrary<'create' | 'move' | 'delete' | 'rename'>,
          fc.constantFrom('bookmark', 'folder') as fc.Arbitrary<'bookmark' | 'folder'>,
          fc.uuid().map(id => `target-${id}`),
          async (type, targetType, targetId) => {
            resetMocks();
            vi.stubGlobal('chrome', mockChrome);
            
            // 设置初始书签数据
            mockChromeStorage['bookmarks'] = [{
              id: targetId,
              url: 'https://example.com',
              title: 'Test',
              folderPath: '/',
              folderId: 'folder-/',
              userTags: [],
              aiTags: [],
              starred: false,
              pinned: false,
              createTime: Date.now(),
              updateTime: Date.now(),
              status: 'active',
              analytics: { visitCount: 0, importance: 50 },
            }];
            mockChromeStorage['folders'] = [];
            
            const service = new (OperationHistoryService as any)();
            await service.initialize();
            
            // 记录操作
            await service.record({
              type,
              targetType,
              targetId,
              previousState: {
                folderPath: '/Original',
                folderId: 'folder-/Original',
                title: 'Original Title',
              },
            });
            
            // 执行撤销
            const result = await service.undo();
            
            // 验证撤销结果
            return (
              result.success === true &&
              result.type === type &&
              result.targetType === targetType &&
              result.targetId === targetId
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('撤销后，操作应该从历史记录中移除', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (operationCount) => {
            resetMocks();
            vi.stubGlobal('chrome', mockChrome);
            
            // 设置初始数据
            mockChromeStorage['bookmarks'] = [];
            mockChromeStorage['folders'] = [];
            
            const service = new (OperationHistoryService as any)();
            await service.initialize();
            
            // 记录多个操作
            for (let i = 0; i < operationCount; i++) {
              await service.record({
                type: 'create',
                targetType: 'bookmark',
                targetId: `bookmark-${i}`,
              });
            }
            
            const beforeCount = service.getCount();
            
            // 执行撤销
            await service.undo();
            
            const afterCount = service.getCount();
            
            // 验证历史记录数量减少了 1
            return afterCount === beforeCount - 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('当没有可撤销的操作时，undo 应该返回失败', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      resetMocks();
      vi.stubGlobal('chrome', mockChrome);
      
      const service = new (OperationHistoryService as any)();
      await service.initialize();
      
      // 不记录任何操作，直接撤销
      const result = await service.undo();
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('canUndo 应该正确反映是否有可撤销的操作', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 10 }),
          async (operationCount) => {
            resetMocks();
            vi.stubGlobal('chrome', mockChrome);
            
            const service = new (OperationHistoryService as any)();
            await service.initialize();
            
            // 记录操作
            for (let i = 0; i < operationCount; i++) {
              await service.record({
                type: 'create',
                targetType: 'bookmark',
                targetId: `bookmark-${i}`,
              });
            }
            
            // 验证 canUndo 返回正确的值
            return service.canUndo() === (operationCount > 0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('撤销 move 操作应该将书签移回原位置', async () => {
      const { OperationHistoryService } = await import('./operationHistory');
      
      await fc.assert(
        fc.asyncProperty(
          validFolderPathArb,
          validFolderPathArb,
          async (originalPath, newPath) => {
            // 确保路径不同
            if (originalPath === newPath) {
              return true; // 跳过相同路径的情况
            }
            
            resetMocks();
            vi.stubGlobal('chrome', mockChrome);
            
            const targetId = 'test-bookmark';
            
            // 设置书签在新位置
            mockChromeStorage['bookmarks'] = [{
              id: targetId,
              url: 'https://example.com',
              title: 'Test',
              folderPath: newPath,
              folderId: `folder-${newPath}`,
              userTags: [],
              aiTags: [],
              starred: false,
              pinned: false,
              createTime: Date.now(),
              updateTime: Date.now(),
              status: 'active',
              analytics: { visitCount: 0, importance: 50 },
            }];
            mockChromeStorage['folders'] = [];
            
            const service = new (OperationHistoryService as any)();
            await service.initialize();
            
            // 记录 move 操作
            await service.record({
              type: 'move',
              targetType: 'bookmark',
              targetId,
              previousState: {
                folderPath: originalPath,
                folderId: `folder-${originalPath}`,
              },
            });
            
            // 执行撤销
            await service.undo();
            
            // 获取更新后的书签
            const bookmarks = mockChromeStorage['bookmarks'] as any[];
            const bookmark = bookmarks.find(b => b.id === targetId);
            
            // 验证书签被移回原位置
            return bookmark?.folderPath === originalPath;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
