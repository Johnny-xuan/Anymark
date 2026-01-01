/**
 * 虚拟滚动优化器
 * 支持动态高度计算、性能监控、搜索优化
 */

export interface VirtualScrollConfig {
  itemHeight: number;
  overscan: number;
  containerHeight: number;
  enableMonitoring: boolean;
}

export interface VirtualScrollState {
  scrollTop: number;
  visibleStartIndex: number;
  visibleEndIndex: number;
  visibleItems: any[];
  totalHeight: number;
  offsetY: number;
}

export interface PerformanceMetrics {
  renderTime: number;
  scrollFPS: number;
  memoryUsage: number;
  itemsRendered: number;
  timestamp: number;
}

export class VirtualScrollOptimizer {
  private config: VirtualScrollConfig;
  private performanceMetrics: PerformanceMetrics[] = [];
  private rafId: number | null = null;
  private lastScrollTime: number = 0;
  private frameCount: number = 0;
  private fpsInterval: number = 1000; // 1秒计算一次FPS

  constructor(config: Partial<VirtualScrollConfig> = {}) {
    this.config = {
      itemHeight: config.itemHeight || 48,
      overscan: config.overscan || 5,
      containerHeight: config.containerHeight || 600,
      enableMonitoring: config.enableMonitoring !== false,
    };
  }

  /**
   * 动态计算容器高度
   */
  calculateContainerHeight(element: HTMLElement | null): number {
    if (!element) return this.config.containerHeight;
    
    const rect = element.getBoundingClientRect();
    const height = rect.height || this.config.containerHeight;
    
    // 更新配置
    this.config.containerHeight = height;
    return height;
  }

  /**
   * 计算虚拟滚动状态
   */
  calculateScrollState(
    items: any[],
    scrollTop: number,
    containerHeight?: number
  ): VirtualScrollState {
    const startTime = performance.now();
    const height = containerHeight || this.config.containerHeight;

    const visibleStartIndex = Math.max(
      0,
      Math.floor(scrollTop / this.config.itemHeight) - this.config.overscan
    );

    const visibleEndIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + height) / this.config.itemHeight) + this.config.overscan
    );

    const visibleItems = items.slice(visibleStartIndex, visibleEndIndex + 1);
    const totalHeight = items.length * this.config.itemHeight;
    const offsetY = visibleStartIndex * this.config.itemHeight;

    const renderTime = performance.now() - startTime;

    // 记录性能指标
    if (this.config.enableMonitoring) {
      this.recordPerformance({
        renderTime,
        scrollFPS: this.calculateFPS(),
        memoryUsage: this.getMemoryUsage(),
        itemsRendered: visibleItems.length,
        timestamp: Date.now(),
      });
    }

    return {
      scrollTop,
      visibleStartIndex,
      visibleEndIndex,
      visibleItems,
      totalHeight,
      offsetY,
    };
  }

  /**
   * 优化搜索场景的虚拟滚动
   * 搜索时可能项目较少，调整策略
   */
  calculateSearchScrollState(
    searchResults: any[],
    scrollTop: number,
    containerHeight?: number
  ): VirtualScrollState {
    // 搜索结果较少时，禁用虚拟滚动
    if (searchResults.length < 50) {
      return {
        scrollTop,
        visibleStartIndex: 0,
        visibleEndIndex: searchResults.length - 1,
        visibleItems: searchResults,
        totalHeight: searchResults.length * this.config.itemHeight,
        offsetY: 0,
      };
    }

    // 搜索结果多时，使用更激进的预渲染
    const searchConfig: VirtualScrollConfig = {
      ...this.config,
      overscan: Math.min(10, Math.floor(searchResults.length * 0.1)), // 10% overscan
    };

    const prevConfig = this.config;
    this.config = searchConfig;
    
    const state = this.calculateScrollState(
      searchResults,
      scrollTop,
      containerHeight
    );

    this.config = prevConfig;
    return state;
  }

  /**
   * 滚动到指定索引
   */
  scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth'): number {
    return index * this.config.itemHeight;
  }

  /**
   * 计算FPS
   */
  private calculateFPS(): number {
    const now = performance.now();
    this.frameCount++;

    if (now - this.lastScrollTime >= this.fpsInterval) {
      const fps = Math.round((this.frameCount * 1000) / (now - this.lastScrollTime));
      this.frameCount = 0;
      this.lastScrollTime = now;
      return fps;
    }

    return 60; // 默认值
  }

  /**
   * 获取内存使用情况
   */
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return Math.round(memory.usedJSHeapSize / 1048576); // MB
    }
    return 0;
  }

  /**
   * 记录性能指标
   */
  private recordPerformance(metrics: PerformanceMetrics): void {
    this.performanceMetrics.push(metrics);

    // 只保留最近100条记录
    if (this.performanceMetrics.length > 100) {
      this.performanceMetrics.shift();
    }
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(): {
    avgRenderTime: number;
    avgFPS: number;
    avgMemoryUsage: number;
    avgItemsRendered: number;
  } {
    if (this.performanceMetrics.length === 0) {
      return {
        avgRenderTime: 0,
        avgFPS: 60,
        avgMemoryUsage: 0,
        avgItemsRendered: 0,
      };
    }

    const sum = this.performanceMetrics.reduce(
      (acc, m) => ({
        renderTime: acc.renderTime + m.renderTime,
        fps: acc.fps + m.scrollFPS,
        memory: acc.memory + m.memoryUsage,
        items: acc.items + m.itemsRendered,
      }),
      { renderTime: 0, fps: 0, memory: 0, items: 0 }
    );

    const count = this.performanceMetrics.length;

    return {
      avgRenderTime: sum.renderTime / count,
      avgFPS: sum.fps / count,
      avgMemoryUsage: sum.memory / count,
      avgItemsRendered: sum.items / count,
    };
  }

  /**
   * 清除性能数据
   */
  clearPerformanceData(): void {
    this.performanceMetrics = [];
    this.frameCount = 0;
    this.lastScrollTime = 0;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<VirtualScrollConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 启用/禁用性能监控
   */
  setMonitoring(enabled: boolean): void {
    this.config.enableMonitoring = enabled;
    if (!enabled) {
      this.clearPerformanceData();
    }
  }
}

// 导出单例
let optimizerInstance: VirtualScrollOptimizer | null = null;

export function getVirtualScrollOptimizer(
  config?: Partial<VirtualScrollConfig>
): VirtualScrollOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new VirtualScrollOptimizer(config);
  }
  return optimizerInstance;
}
