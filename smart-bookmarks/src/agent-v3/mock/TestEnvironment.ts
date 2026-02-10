/**
 * TestEnvironment - 测试环境工具
 * 
 * 提供测试环境设置和清理功能
 */

import type { AgentContext } from '../types';
import type { MockFixture, TestEnvironmentConfig } from './types';
import { MockBookmarkStore } from './MockBookmarkStore';
import { DEFAULT_FIXTURE, getFixture } from './MockFixtures';

/**
 * 测试环境
 */
export interface TestEnvironment {
  mockStore: MockBookmarkStore;
  context: AgentContext;
}

// 全局 mock store 实例（用于替换真实 store）
let globalMockStore: MockBookmarkStore | null = null;

/**
 * 设置 Mock 环境
 */
export function setupMockEnvironment(config?: TestEnvironmentConfig): TestEnvironment {
  // 获取 fixture
  let fixture: MockFixture = DEFAULT_FIXTURE;
  if (config?.fixtureName) {
    const namedFixture = getFixture(config.fixtureName);
    if (namedFixture) {
      fixture = namedFixture;
    }
  }

  // 创建 mock store
  const mockStore = new MockBookmarkStore(fixture);
  
  // 设置错误模式
  if (config?.errorMode) {
    mockStore.setErrorMode(config.errorMode);
  }

  // 保存全局引用
  globalMockStore = mockStore;

  // 创建测试上下文
  const context = createTestContext();

  return { mockStore, context };
}

/**
 * 清理 Mock 环境
 */
export function teardownMockEnvironment(): void {
  if (globalMockStore) {
    globalMockStore.clear();
    globalMockStore = null;
  }
}

/**
 * 获取全局 Mock Store
 */
export function getGlobalMockStore(): MockBookmarkStore | null {
  return globalMockStore;
}

/**
 * 创建测试上下文
 */
export function createTestContext(cwd?: string): AgentContext {
  return {
    cwd: {
      folderId: null,
      path: cwd || '/',
    },
    sessionId: `test-session-${Date.now()}`,
  };
}

/**
 * 创建带有指定工作目录的上下文
 */
export function createContextWithCwd(folderId: string | null, path: string): AgentContext {
  return {
    cwd: { folderId, path },
    sessionId: `test-session-${Date.now()}`,
  };
}

/**
 * 测试辅助函数：等待异步操作完成
 */
export function waitForAsync(ms: number = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 测试辅助函数：创建随机书签数据
 */
export function createRandomBookmarkData() {
  const id = Math.random().toString(36).slice(2, 9);
  return {
    url: `https://example.com/${id}`,
    title: `Test Bookmark ${id}`,
  };
}

/**
 * 测试辅助函数：创建随机文件夹数据
 */
export function createRandomFolderData() {
  const id = Math.random().toString(36).slice(2, 9);
  return {
    title: `Test Folder ${id}`,
  };
}
