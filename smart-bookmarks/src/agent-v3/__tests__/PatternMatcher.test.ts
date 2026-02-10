/**
 * PatternMatcher 单元测试
 * 
 * 测试边界情况和特殊场景
 */

import { describe, it, expect } from 'vitest';
import { PatternMatcher } from '../PatternMatcher';

describe('PatternMatcher - Unit Tests', () => {
  describe('isWildcardPattern', () => {
    it('应检测 * 通配符', () => {
      expect(PatternMatcher.isWildcardPattern('*.pdf')).toBe(true);
      expect(PatternMatcher.isWildcardPattern('test*')).toBe(true);
      expect(PatternMatcher.isWildcardPattern('*')).toBe(true);
    });

    it('应检测 ? 通配符', () => {
      expect(PatternMatcher.isWildcardPattern('test?')).toBe(true);
      expect(PatternMatcher.isWildcardPattern('?test')).toBe(true);
      expect(PatternMatcher.isWildcardPattern('?')).toBe(true);
    });

    it('应检测 [ 字符类', () => {
      expect(PatternMatcher.isWildcardPattern('[abc]')).toBe(true);
      expect(PatternMatcher.isWildcardPattern('test[0-9]')).toBe(true);
    });

    it('应忽略转义的通配符', () => {
      expect(PatternMatcher.isWildcardPattern('\\*')).toBe(false);
      expect(PatternMatcher.isWildcardPattern('\\?')).toBe(false);
      expect(PatternMatcher.isWildcardPattern('\\[')).toBe(false);
    });

    it('应处理普通字符串', () => {
      expect(PatternMatcher.isWildcardPattern('test')).toBe(false);
      expect(PatternMatcher.isWildcardPattern('hello world')).toBe(false);
      expect(PatternMatcher.isWildcardPattern('')).toBe(false);
    });
  });

  describe('globToRegex - 边界情况', () => {
    it('应处理空模式', () => {
      const regex = PatternMatcher.globToRegex('');
      expect(regex.test('')).toBe(true);
      expect(regex.test('a')).toBe(false);
    });

    it('应处理只有通配符的模式', () => {
      const regex1 = PatternMatcher.globToRegex('*');
      expect(regex1.test('')).toBe(true);
      expect(regex1.test('anything')).toBe(true);

      const regex2 = PatternMatcher.globToRegex('?');
      expect(regex2.test('a')).toBe(true);
      expect(regex2.test('')).toBe(false);
      expect(regex2.test('ab')).toBe(false);
    });

    it('应处理未闭合的字符类', () => {
      // 未闭合的 [ 应被视为字面字符
      const regex = PatternMatcher.globToRegex('[abc');
      expect(regex.test('[abc')).toBe(true);
      expect(regex.test('a')).toBe(false);
    });

    it('应处理空字符类', () => {
      const regex = PatternMatcher.globToRegex('[]');
      // 空字符类会被处理为未闭合的字符类，视为字面字符
      expect(regex.test('[')).toBe(false); // 实际行为可能不同
    });

    it('应处理嵌套的字符类（不支持，视为字面字符）', () => {
      const regex = PatternMatcher.globToRegex('[[a-z]]');
      // 嵌套字符类：第一个 [ 开始字符类，第二个 [ 是字符类的一部分
      // 实际匹配 [, a-z, ] 中的任意一个字符，然后是 ]
      expect(regex.test('a]')).toBe(true);
      expect(regex.test('z]')).toBe(true);
      expect(regex.test('[]')).toBe(true);
    });

    it('应处理多个连续的通配符', () => {
      const regex1 = PatternMatcher.globToRegex('**');
      expect(regex1.test('')).toBe(true);
      expect(regex1.test('anything')).toBe(true);

      const regex2 = PatternMatcher.globToRegex('??');
      expect(regex2.test('ab')).toBe(true);
      expect(regex2.test('a')).toBe(false);
      expect(regex2.test('abc')).toBe(false);
    });
  });

  describe('globToRegex - 特殊字符转义', () => {
    it('应转义正则表达式特殊字符', () => {
      const specialChars = ['.', '+', '(', ')', '{', '}', '|', '^', '$'];
      
      for (const char of specialChars) {
        const pattern = `test${char}file`;
        const regex = PatternMatcher.globToRegex(pattern);
        
        // 应该匹配字面字符
        expect(regex.test(`test${char}file`)).toBe(true);
        
        // 不应该被当作正则特殊字符
        if (char === '.') {
          expect(regex.test('testxfile')).toBe(false);
        }
      }
    });

    it('应处理反斜杠转义', () => {
      const regex1 = PatternMatcher.globToRegex('test\\\\file');
      expect(regex1.test('test\\file')).toBe(true);
      expect(regex1.test('testfile')).toBe(false);
    });
  });

  describe('globToRegex - 复杂模式', () => {
    it('应处理混合通配符', () => {
      const regex = PatternMatcher.globToRegex('*.pdf');
      expect(regex.test('document.pdf')).toBe(true);
      expect(regex.test('.pdf')).toBe(true);
      expect(regex.test('document.txt')).toBe(false);
    });

    it('应处理多个通配符组合', () => {
      const regex = PatternMatcher.globToRegex('test*[0-9]?.txt');
      expect(regex.test('test1a.txt')).toBe(true);
      expect(regex.test('testfile9x.txt')).toBe(true);
      expect(regex.test('test.txt')).toBe(false);
    });

    it('应处理中文字符', () => {
      const regex = PatternMatcher.globToRegex('*教程*');
      expect(regex.test('React教程')).toBe(true);
      expect(regex.test('Vue教程完整版')).toBe(true);
      expect(regex.test('教程')).toBe(true);
      expect(regex.test('React')).toBe(false);
    });
  });

  describe('matchItems', () => {
    const items = [
      { name: 'React官方文档' },
      { name: 'Vue教程' },
      { name: 'Angular指南' },
      { name: 'React入门' },
      { name: 'JavaScript基础' },
    ];

    it('应匹配包含通配符的模式', () => {
      const matches = PatternMatcher.matchItems(
        'React*',
        items,
        item => item.name
      );
      
      expect(matches).toHaveLength(2);
      expect(matches.map(m => m.name)).toEqual(['React官方文档', 'React入门']);
    });

    it('应返回空数组当模式不包含通配符', () => {
      const matches = PatternMatcher.matchItems(
        'React',
        items,
        item => item.name
      );
      
      expect(matches).toHaveLength(0);
    });

    it('应处理未匹配任何项目的模式', () => {
      const matches = PatternMatcher.matchItems(
        'Python*',
        items,
        item => item.name
      );
      
      expect(matches).toHaveLength(0);
    });

    it('应处理匹配所有项目的模式', () => {
      const matches = PatternMatcher.matchItems(
        '*',
        items,
        item => item.name
      );
      
      expect(matches).toHaveLength(5);
    });
  });

  describe('大小写不敏感', () => {
    it('默认应不区分大小写', () => {
      const regex = PatternMatcher.globToRegex('React*');
      expect(regex.test('React官方文档')).toBe(true);
      expect(regex.test('react官方文档')).toBe(true);
      expect(regex.test('REACT官方文档')).toBe(true);
    });

    it('可以启用大小写敏感', () => {
      const regex = PatternMatcher.globToRegex('React*', { caseSensitive: true });
      expect(regex.test('React官方文档')).toBe(true);
      expect(regex.test('react官方文档')).toBe(false);
      expect(regex.test('REACT官方文档')).toBe(false);
    });
  });

  describe('fullMatch 选项', () => {
    it('默认应完整匹配', () => {
      const regex = PatternMatcher.globToRegex('test');
      expect(regex.test('test')).toBe(true);
      expect(regex.test('test123')).toBe(false);
      expect(regex.test('123test')).toBe(false);
    });

    it('可以禁用完整匹配', () => {
      const regex = PatternMatcher.globToRegex('test', { fullMatch: false });
      expect(regex.test('test')).toBe(true);
      expect(regex.test('test123')).toBe(true);
      expect(regex.test('123test')).toBe(true);
    });
  });
});
