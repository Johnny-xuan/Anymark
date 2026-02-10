/**
 * FileScanner Property Tests
 * 
 * Property 9: Configuration and Glob Pattern Handling
 * Validates: Requirements 6.2, 6.3, 6.4
 * 
 * For any configuration with include directories and exclude patterns,
 * the FileScanner SHALL:
 * (a) scan only files matching the include patterns
 * (b) skip files matching exclude patterns
 * (c) correctly interpret glob patterns like `**\/*.tsx` and `**\/test/**`
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { matchGlob, matchesAnyPattern } from '../FileScanner';

describe('FileScanner Property Tests', () => {
  describe('Property 9: Configuration and Glob Pattern Handling', () => {
    /**
     * Property 9a: Files matching include patterns should be included
     * 
     * For any file path with a valid extension, if the path matches
     * the include pattern, it should be considered for inclusion.
     */
    it('should match files with correct extensions', () => {
      fc.assert(
        fc.property(
          // Generate random file names (alphanumeric)
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z0-9_-]+$/i.test(s)),
          // Generate random directory depth
          fc.array(
            fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z]+$/i.test(s)),
            { minLength: 0, maxLength: 3 }
          ),
          // Generate extension
          fc.constantFrom('.tsx', '.ts', '.jsx', '.js'),
          (fileName, dirs, ext) => {
            const filePath = [...dirs, `${fileName}${ext}`].join('/');
            const pattern = `**/*${ext}`;
            
            // File with matching extension should match the pattern
            expect(matchGlob(pattern, filePath)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 9b: Files matching exclude patterns should be excluded
     * 
     * For any file path that matches an exclude pattern,
     * it should be correctly identified as excluded.
     */
    it('should correctly exclude files matching exclude patterns', () => {
      fc.assert(
        fc.property(
          // Generate test file name
          fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z]+$/i.test(s)),
          (fileName) => {
            // Test files should match test exclude pattern
            const testFilePath = `src/components/${fileName}.test.tsx`;
            const excludePatterns = ['**/*.test.tsx', '**/*.spec.tsx'];
            
            expect(matchesAnyPattern(testFilePath, excludePatterns)).toBe(true);
            
            // Non-test files should not match
            const normalFilePath = `src/components/${fileName}.tsx`;
            expect(matchesAnyPattern(normalFilePath, excludePatterns)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 9c: ** glob pattern should match any path depth
     * 
     * The ** pattern should match zero or more directory levels.
     */
    it('should match ** pattern at any depth', () => {
      fc.assert(
        fc.property(
          // Generate random directory depth (0-5 levels)
          fc.array(
            fc.string({ minLength: 1, maxLength: 8 }).filter(s => /^[a-z]+$/i.test(s)),
            { minLength: 0, maxLength: 5 }
          ),
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z]+$/i.test(s)),
          (dirs, fileName) => {
            const filePath = [...dirs, `${fileName}.tsx`].join('/');
            const pattern = '**/*.tsx';
            
            // Should match regardless of directory depth
            expect(matchGlob(pattern, filePath)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 9d: * glob pattern should not match path separators
     * 
     * A single * should match any characters except /
     */
    it('should not match path separators with single *', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z]+$/i.test(s)),
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z]+$/i.test(s)),
          (dir, fileName) => {
            // Pattern with single * should not match paths with subdirectories
            const pattern = 'src/*.tsx';
            const deepPath = `src/${dir}/${fileName}.tsx`;
            const shallowPath = `src/${fileName}.tsx`;
            
            // Deep path should NOT match (has extra directory)
            expect(matchGlob(pattern, deepPath)).toBe(false);
            // Shallow path should match
            expect(matchGlob(pattern, shallowPath)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 9e: __tests__ directory exclusion
     * 
     * Files in __tests__ directories should be correctly excluded.
     */
    it('should exclude files in __tests__ directories', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z]+$/i.test(s)),
          fc.array(
            fc.string({ minLength: 1, maxLength: 8 }).filter(s => /^[a-z]+$/i.test(s)),
            { minLength: 0, maxLength: 2 }
          ),
          (fileName, prefixDirs) => {
            const excludePattern = '**/__tests__/**';
            
            // File in __tests__ directory
            const testPath = [...prefixDirs, '__tests__', `${fileName}.tsx`].join('/');
            expect(matchGlob(excludePattern, testPath)).toBe(true);
            
            // File not in __tests__ directory
            const normalPath = [...prefixDirs, 'components', `${fileName}.tsx`].join('/');
            expect(matchGlob(excludePattern, normalPath)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 9f: Extension filtering is case-sensitive
     * 
     * File extensions should be matched exactly.
     */
    it('should match extensions case-sensitively', () => {
      const testCases = [
        { path: 'file.tsx', pattern: '*.tsx', expected: true },
        { path: 'file.TSX', pattern: '*.tsx', expected: false },
        { path: 'file.Tsx', pattern: '*.tsx', expected: false },
        { path: 'file.tsx', pattern: '*.TSX', expected: false },
      ];

      for (const { path, pattern, expected } of testCases) {
        expect(matchGlob(pattern, path)).toBe(expected);
      }
    });

    /**
     * Property 9g: Empty patterns array should not match anything
     */
    it('should not match when patterns array is empty', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-z0-9/._-]+$/i.test(s)),
          (filePath) => {
            expect(matchesAnyPattern(filePath, [])).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property 9h: Multiple exclude patterns - any match should exclude
     */
    it('should exclude if any pattern matches', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z]+$/i.test(s)),
          (fileName) => {
            const excludePatterns = [
              '**/*.test.tsx',
              '**/*.spec.tsx',
              '**/index.tsx',
              '**/__tests__/**'
            ];

            // Test file should match
            expect(matchesAnyPattern(`src/${fileName}.test.tsx`, excludePatterns)).toBe(true);
            // Spec file should match
            expect(matchesAnyPattern(`src/${fileName}.spec.tsx`, excludePatterns)).toBe(true);
            // Index file should match
            expect(matchesAnyPattern(`src/components/index.tsx`, excludePatterns)).toBe(true);
            // __tests__ file should match
            expect(matchesAnyPattern(`src/__tests__/${fileName}.tsx`, excludePatterns)).toBe(true);
            // Normal file should not match
            expect(matchesAnyPattern(`src/components/${fileName}.tsx`, excludePatterns)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
