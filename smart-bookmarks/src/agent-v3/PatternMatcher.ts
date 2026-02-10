/**
 * PatternMatcher - 通配符模式匹配器
 * 
 * 将 Unix glob 模式转换为正则表达式并执行匹配
 * 支持 *, ?, [...], [!...] 通配符和转义字符
 */

export interface GlobOptions {
  /** 是否大小写敏感，默认 false */
  caseSensitive?: boolean;
  /** 是否完整匹配，默认 true */
  fullMatch?: boolean;
}

/**
 * 通配符模式匹配器
 */
export class PatternMatcher {
  /**
   * 检测字符串是否包含通配符字符
   * @param pattern - 待检测的模式字符串
   * @returns 是否包含未转义的通配符
   */
  static isWildcardPattern(pattern: string): boolean {
    let i = 0;
    while (i < pattern.length) {
      const char = pattern[i];
      
      // 检查转义字符
      if (char === '\\' && i + 1 < pattern.length) {
        i += 2; // 跳过转义字符和下一个字符
        continue;
      }
      
      // 检查通配符字符
      if (char === '*' || char === '?' || char === '[') {
        return true;
      }
      
      i++;
    }
    
    return false;
  }

  /**
   * 将 glob 模式转换为正则表达式
   * @param pattern - glob 模式字符串
   * @param options - 转换选项
   * @returns 编译后的正则表达式
   */
  static globToRegex(pattern: string, options: GlobOptions = {}): RegExp {
    const { caseSensitive = false, fullMatch = true } = options;
    
    let regexStr = '';
    let i = 0;
    let inCharClass = false;
    
    while (i < pattern.length) {
      const char = pattern[i];
      
      // 处理转义字符
      if (char === '\\' && i + 1 < pattern.length) {
        const nextChar = pattern[i + 1];
        // 转义通配符字符
        if (nextChar === '*' || nextChar === '?' || nextChar === '[' || nextChar === ']' || nextChar === '\\') {
          regexStr += '\\' + nextChar;
          i += 2;
          continue;
        }
        // 其他字符直接添加
        regexStr += '\\' + nextChar;
        i += 2;
        continue;
      }
      
      // 处理字符类
      if (char === '[' && !inCharClass) {
        inCharClass = true;
        regexStr += '[';
        i++;
        
        // 检查是否是否定字符类 [! 或 [^
        if (i < pattern.length && (pattern[i] === '!' || pattern[i] === '^')) {
          regexStr += '^';
          i++;
        }
        continue;
      }
      
      if (char === ']' && inCharClass) {
        inCharClass = false;
        regexStr += ']';
        i++;
        continue;
      }
      
      // 在字符类内部，直接添加字符
      if (inCharClass) {
        regexStr += char;
        i++;
        continue;
      }
      
      // 处理通配符
      if (char === '*') {
        regexStr += '.*';
        i++;
        continue;
      }
      
      if (char === '?') {
        regexStr += '.';
        i++;
        continue;
      }
      
      // 转义正则表达式特殊字符
      if ('.+^${}()|\\'.includes(char)) {
        regexStr += '\\' + char;
        i++;
        continue;
      }
      
      // 普通字符
      regexStr += char;
      i++;
    }
    
    // 如果字符类未闭合，将未闭合的 [ 视为字面字符
    if (inCharClass) {
      // 重新构建正则表达式，将所有未配对的 [ 转义
      let fixedPattern = '';
      let depth = 0;
      for (let j = 0; j < pattern.length; j++) {
        const c = pattern[j];
        if (c === '\\' && j + 1 < pattern.length) {
          fixedPattern += c + pattern[j + 1];
          j++;
          continue;
        }
        if (c === '[') {
          depth++;
          fixedPattern += c;
        } else if (c === ']' && depth > 0) {
          depth--;
          fixedPattern += c;
        } else {
          fixedPattern += c;
        }
      }
      // 如果还有未闭合的 [，将其转义
      if (depth > 0) {
        fixedPattern = fixedPattern.replace(/\[(?![^\[]*\])/g, '\\[');
      }
      return PatternMatcher.globToRegex(fixedPattern, { ...options, fullMatch: false });
    }
    
    // 添加完整匹配锚点
    if (fullMatch) {
      regexStr = '^' + regexStr + '$';
    }
    
    // 编译正则表达式
    const flags = caseSensitive ? '' : 'i';
    return new RegExp(regexStr, flags);
  }

  /**
   * 使用模式匹配字符串数组
   * @param pattern - glob 模式或普通字符串
   * @param items - 待匹配的项目数组
   * @param accessor - 获取匹配字段的函数
   * @returns 匹配的项目数组
   */
  static matchItems<T>(
    pattern: string,
    items: T[],
    accessor: (item: T) => string
  ): T[] {
    // 检查是否包含通配符
    if (!PatternMatcher.isWildcardPattern(pattern)) {
      // 无通配符，返回空数组（由调用方处理回退逻辑）
      return [];
    }
    
    // 转换为正则表达式
    const regex = PatternMatcher.globToRegex(pattern);
    
    // 执行匹配
    return items.filter(item => {
      const value = accessor(item);
      return regex.test(value);
    });
  }
}
