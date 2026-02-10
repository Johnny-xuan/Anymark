/**
 * Frecency 计算器
 * 基于 Firefox Frecency 算法的简化版本
 * 结合频率（Frequency）和新近度（Recency）计算书签重要性
 * 
 * 参考：https://wiki.mozilla.org/User:Jesse/NewFrecency
 */

import type { IBookmark } from '../types/bookmark';

// ============ 配置常量 ============

/**
 * 衰减半衰期（天）
 * 30天后，访问的价值减半
 */
const HALF_LIFE_DAYS = 30;

/**
 * 衰减率常数 λ = ln(2) / 半衰期
 */
const DECAY_RATE = Math.LN2 / HALF_LIFE_DAYS;

/**
 * 访问基础权重
 */
const VISIT_BASE_WEIGHT = 10;

/**
 * 加成因素
 */
const BONUSES = {
  starred: 25,       // 星标加成（重要！用户明确标记的重要书签）
  hasNotes: 10,      // 有用户备注加成
  hasUserTags: 8,    // 有用户标签加成
  hasAiTags: 3,      // 有 AI 标签加成
  inAiCategory: 5,   // 在 AI 分类中加成
};

/**
 * 新书签保护期（天）
 */
const NEW_BOOKMARK_PROTECTION_DAYS = 7;

/**
 * 新书签最低分数
 */
const NEW_BOOKMARK_MIN_SCORE = 30;

// ============ 核心计算函数 ============

/**
 * 计算时间衰减因子
 * @param timestamp 时间戳（毫秒）
 * @returns 衰减因子 (0-1)
 */
function calculateDecayFactor(timestamp: number): number {
  const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  return Math.exp(-DECAY_RATE * ageInDays);
}

/**
 * 计算单次访问的当前价值（带衰减）
 * @param visitTime 访问时间戳
 * @param weight 访问权重
 * @returns 当前价值
 */
function calculateVisitValue(visitTime: number, weight: number = VISIT_BASE_WEIGHT): number {
  return weight * calculateDecayFactor(visitTime);
}

/**
 * 计算书签的 Frecency 分数
 * @param bookmark 书签对象
 * @returns 重要性分数 (0-100)
 */
export function calculateFrecency(bookmark: IBookmark): number {
  let score = 0;
  
  // 1. 基于访问历史计算
  if (bookmark.analytics.visitCount > 0) {
    const lastVisit = bookmark.analytics.lastVisit || bookmark.createTime;
    
    // 方法：使用访问次数和最后访问时间估算
    // 假设访问在创建时间到最后访问之间均匀分布
    if (bookmark.analytics.visitCount === 1) {
      // 只有一次访问
      score = calculateVisitValue(lastVisit);
    } else {
      // 多次访问：计算平均访问时间的衰减值，乘以访问次数
      const avgVisitTime = (bookmark.createTime + lastVisit) / 2;
      score = bookmark.analytics.visitCount * calculateVisitValue(avgVisitTime);
      
      // 最后一次访问的额外权重（最近访问更重要）
      score += calculateVisitValue(lastVisit) * 0.5;
    }
  }
  
  // 2. 加成因素
  
  // 星标加成（最重要的用户信号）
  if (bookmark.starred) {
    score += BONUSES.starred;
  }
  
  // 用户备注加成
  if (bookmark.userNotes && bookmark.userNotes.trim().length > 0) {
    score += BONUSES.hasNotes;
  }
  
  // 用户标签加成（每个标签加分，上限 20）
  if (bookmark.userTags && bookmark.userTags.length > 0) {
    score += Math.min(bookmark.userTags.length * BONUSES.hasUserTags, 20);
  }
  
  // AI 标签加成（每个标签加分，上限 15）
  if (bookmark.aiTags && bookmark.aiTags.length > 0) {
    score += Math.min(bookmark.aiTags.length * BONUSES.hasAiTags, 15);
  }
  
  // AI 分类加成
  if (bookmark.aiCategory && bookmark.aiCategory.trim().length > 0) {
    score += BONUSES.inAiCategory;
  }
  
  // 3. 新书签保护期
  const ageInDays = (Date.now() - bookmark.createTime) / (1000 * 60 * 60 * 24);
  if (ageInDays < NEW_BOOKMARK_PROTECTION_DAYS) {
    // 新书签至少有最低分数，避免刚添加就被埋没
    score = Math.max(score, NEW_BOOKMARK_MIN_SCORE);
  }
  
  // 4. 归一化到 0-100
  return Math.min(Math.max(Math.round(score), 0), 100);
}

/**
 * 批量计算书签的 Frecency 分数
 * @param bookmarks 书签数组
 * @returns 带有更新后 importance 的书签数组
 */
export function calculateBatchFrecency(bookmarks: IBookmark[]): IBookmark[] {
  return bookmarks.map(bookmark => ({
    ...bookmark,
    analytics: {
      ...bookmark.analytics,
      importance: calculateFrecency(bookmark),
    },
  }));
}

/**
 * 更新单个书签的 importance
 * @param bookmark 书签对象
 * @returns 更新后的 analytics 对象
 */
export function updateImportance(bookmark: IBookmark): IBookmark['analytics'] {
  return {
    ...bookmark.analytics,
    importance: calculateFrecency(bookmark),
  };
}

// ============ 辅助函数 ============

/**
 * 获取书签的衰减状态描述
 * @param bookmark 书签对象
 * @returns 状态描述
 */
export function getDecayStatus(bookmark: IBookmark): 'active' | 'cooling' | 'cold' | 'frozen' {
  const lastActivity = bookmark.analytics.lastVisit || bookmark.createTime;
  const ageInDays = (Date.now() - lastActivity) / (1000 * 60 * 60 * 24);
  
  if (ageInDays < 7) return 'active';      // 一周内活跃
  if (ageInDays < 30) return 'cooling';    // 一个月内冷却中
  if (ageInDays < 90) return 'cold';       // 三个月内冷淡
  return 'frozen';                          // 超过三个月冻结
}

/**
 * 预测书签的 importance 在指定天数后的值
 * @param currentImportance 当前重要性
 * @param daysFromNow 天数
 * @returns 预测的重要性
 */
export function predictFutureImportance(currentImportance: number, daysFromNow: number): number {
  const decayFactor = Math.exp(-DECAY_RATE * daysFromNow);
  return Math.round(currentImportance * decayFactor);
}

/**
 * 计算书签达到指定重要性所需的访问次数
 * @param targetImportance 目标重要性
 * @param currentImportance 当前重要性
 * @returns 所需访问次数
 */
export function visitsNeededForImportance(targetImportance: number, currentImportance: number): number {
  if (targetImportance <= currentImportance) return 0;
  const diff = targetImportance - currentImportance;
  // 每次访问大约增加 VISIT_BASE_WEIGHT 分（假设立即访问）
  return Math.ceil(diff / VISIT_BASE_WEIGHT);
}
