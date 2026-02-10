/**
 * Mock Bookmark Environment - 模块导出
 * 
 * 提供模拟书签环境的所有功能
 */

// 类型导出
export type {
  IBookmarkStore,
  MockStoreError,
  StoreEventType,
  StoreEvent,
  StoreEventListener,
  MockFixture,
  MockBookmarkData,
  MockFolderData,
  StoreSnapshot,
  TestEnvironmentConfig,
} from './types';

export { ErrorMode, generateId, deepClone, createMockStoreError } from './types';

// MockBookmarkStore
export { MockBookmarkStore } from './MockBookmarkStore';

// Fixtures
export {
  DEFAULT_FIXTURE,
  EMPTY_FIXTURE,
  EDGE_CASE_FIXTURE,
  LARGE_FIXTURE,
  getFixture,
} from './MockFixtures';

// TestEnvironment
export {
  setupMockEnvironment,
  teardownMockEnvironment,
  getGlobalMockStore,
  createTestContext,
  createContextWithCwd,
  waitForAsync,
  createRandomBookmarkData,
  createRandomFolderData,
} from './TestEnvironment';
export type { TestEnvironment } from './TestEnvironment';
