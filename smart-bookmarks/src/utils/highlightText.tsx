/**
 * 文本高亮工具
 * 用于搜索结果高亮显示
 */

import React from 'react';

/**
 * 转义正则表达式特殊字符
 * @param str 需要转义的字符串
 * @returns 转义后的字符串
 */
function escapeRegExp(str: string): string {
  // 使用 split 和 join 来避免正则替换中的特殊字符问题
  const specialChars = ['\\', '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']'];
  let result = str;
  for (const char of specialChars) {
    result = result.split(char).join('\\' + char);
  }
  return result;
}

/**
 * 高亮匹配的文本
 * @param text 原始文本
 * @param query 搜索关键词
 * @returns 包含高亮标记的 React 元素
 */
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) {
    return text;
  }

  // 转义特殊正则字符
  const escapedQuery = escapeRegExp(query);
  
  // 创建正则表达式（不区分大小写）
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  
  // 分割文本
  const parts = text.split(regex);
  
  return parts.map((part, index) => {
    // 如果匹配到关键词，用 mark 标签包裹
    if (part.toLowerCase() === query.toLowerCase()) {
      return (
        <mark key={index} className="search-highlight">
          {part}
        </mark>
      );
    }
    return part;
  });
}

/**
 * 检查文本是否包含关键词
 */
export function matchesQuery(text: string, query: string): boolean {
  if (!query || !text) {
    return false;
  }
  return text.toLowerCase().includes(query.toLowerCase());
}
