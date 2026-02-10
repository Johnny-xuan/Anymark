/**
 * PatternMatcher 属性测试
 * 
 * Feature: wildcard-pattern-matching
 * 使用 fast-check 进行基于属性的测试
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PatternMatcher } from '../PatternMatcher';

describe('PatternMatcher - Property-Based Tests', () => {
  describe('Property 1: Glob 模式转换正确性', () => {
    it('Feature: wildcard-pattern-matching, Property 1: * 应匹配零个或多个任意字符', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 20 }).filter(s => !s.includes('\\') && !s.includes('[') && !s.includes(']')),
          fc.string({ minLength: 0, maxLength: 20 }).filter(s => !s.includes('\\') && !s.includes('[') && !s.includes(']')),
          (prefix, suffix) => {
            const pattern = `${prefix}*${suffix}`;
            const regex = PatternMatcher.globToRegex(pattern);
            
            // 测试应该匹配的字符串
            const testStr1 = `${prefix}${suffix}`;
            const testStr2 = `${prefix}abc${suffix}`;
            const testStr3 = `${prefix}123xyz${suffix}`;
            
            expect(regex.test(testStr1)).toBe(true);
            expect(regex.test(testStr2)).toBe(true);
            expect(regex.test(testStr3)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 1: ? 应匹配恰好一个任意字符', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 10 }).filter(s => !s.includes('\\') && !s.includes('*') && !s.includes('?') && !s.includes('[')),
          fc.string({ minLength: 0, maxLength: 10 }).filter(s => !s.includes('\\') && !s.includes('*') && !s.includes('?') && !s.includes('[')),
          fc.string({ minLength: 1, maxLength: 1 }),
          (prefix, suffix, char) => {
            const pattern = `${prefix}?${suffix}`;
            const regex = PatternMatcher.globToRegex(pattern);
            
            // 应该匹配：恰好一个字符
            const shouldMatch = `${prefix}${char}${suffix}`;
            expect(regex.test(shouldMatch)).toBe(true);
            
            // 不应该匹配：零个字符
            const shouldNotMatch1 = `${prefix}${suffix}`;
            expect(regex.test(shouldNotMatch1)).toBe(false);
            
            // 不应该匹配：两个字符
            const shouldNotMatch2 = `${prefix}ab${suffix}`;
            expect(regex.test(shouldNotMatch2)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 1: [abc] 应匹配括号内任意一个字符', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('a', 'b', 'c'),
          (char) => {
            const pattern = '[abc]';
            const regex = PatternMatcher.globToRegex(pattern);
            
            expect(regex.test(char)).toBe(true);
            expect(regex.test('d')).toBe(false);
            expect(regex.test('x')).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 1: [a-z] 应匹配范围内任意字符', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 97, max: 122 }), // a-z ASCII codes
          (charCode) => {
            const pattern = '[a-z]';
            const regex = PatternMatcher.globToRegex(pattern);
            const char = String.fromCharCode(charCode);
            
            expect(regex.test(char)).toBe(true);
            expect(regex.test('A')).toBe(true); // 大小写不敏感
            expect(regex.test('1')).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 1: [!abc] 应匹配除括号内字符外的任意字符', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1 }).filter(c => !['a', 'b', 'c', 'A', 'B', 'C'].includes(c)),
          (char) => {
            const pattern = '[!abc]';
            const regex = PatternMatcher.globToRegex(pattern);
            
            expect(regex.test(char)).toBe(true);
            expect(regex.test('a')).toBe(false);
            expect(regex.test('b')).toBe(false);
            expect(regex.test('c')).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: 大小写不敏感匹配', () => {
    it('Feature: wildcard-pattern-matching, Property 2: 匹配应不区分大小写', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
            s.length > 0 && 
            !s.includes('\\') && 
            !s.includes('[') && 
            !s.includes(']') &&
            !s.includes('*') &&
            !s.includes('?')
          ),
          (str) => {
            const pattern = `${str}*`;
            const regex = PatternMatcher.globToRegex(pattern);
            
            const lower = str.toLowerCase();
            const upper = str.toUpperCase();
            const mixed = str.split('').map((c, i) => 
              i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
            ).join('');
            
            expect(regex.test(lower + 'test')).toBe(true);
            expect(regex.test(upper + 'test')).toBe(true);
            expect(regex.test(mixed + 'test')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 2: [A-Z] 应同时匹配大小写字母', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('a', 'z', 'A', 'Z', 'm', 'M'),
          (char) => {
            const pattern = '[A-Z]';
            const regex = PatternMatcher.globToRegex(pattern);
            
            // 大小写不敏感，所以 a-z 和 A-Z 都应该匹配
            if (/[a-zA-Z]/.test(char)) {
              expect(regex.test(char)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: 转义字符处理', () => {
    it('Feature: wildcard-pattern-matching, Property 3: \\* 应匹配字面 * 字符', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 10 }).filter(s => !s.includes('\\')),
          (prefix) => {
            const pattern = `${prefix}\\*`;
            const regex = PatternMatcher.globToRegex(pattern);
            
            // 应该匹配字面 *
            expect(regex.test(`${prefix}*`)).toBe(true);
            
            // 不应该匹配其他字符
            if (prefix.length > 0) {
              expect(regex.test(`${prefix}a`)).toBe(false);
              expect(regex.test(`${prefix}abc`)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 3: \\? 应匹配字面 ? 字符', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 10 }).filter(s => !s.includes('\\')),
          (prefix) => {
            const pattern = `${prefix}\\?`;
            const regex = PatternMatcher.globToRegex(pattern);
            
            // 应该匹配字面 ?
            expect(regex.test(`${prefix}?`)).toBe(true);
            
            // 不应该匹配其他字符
            if (prefix.length > 0) {
              expect(regex.test(`${prefix}a`)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 3: \\[ 应匹配字面 [ 字符', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 10 }).filter(s => !s.includes('\\') && !s.includes('[')),
          (prefix) => {
            const pattern = `${prefix}\\[`;
            const regex = PatternMatcher.globToRegex(pattern);
            
            // 应该匹配字面 [
            expect(regex.test(`${prefix}[`)).toBe(true);
            
            // 不应该匹配其他字符
            if (prefix.length > 0) {
              expect(regex.test(`${prefix}a`)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Feature: wildcard-pattern-matching, Property 3: 正则特殊字符应被正确转义', () => {
      const specialChars = ['.', '+', '(', ')', '{', '}', '|', '^', '$'];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...specialChars),
          (char) => {
            const pattern = `test${char}file`;
            const regex = PatternMatcher.globToRegex(pattern);
            
            // 应该匹配包含特殊字符的字面字符串
            expect(regex.test(`test${char}file`)).toBe(true);
            
            // 不应该被当作正则特殊字符处理
            // 例如 . 不应该匹配任意字符
            if (char === '.') {
              expect(regex.test('testxfile')).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
