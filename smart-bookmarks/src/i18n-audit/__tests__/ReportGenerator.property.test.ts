/**
 * ReportGenerator Property Tests
 * 
 * Property 5: Violation Reporting Completeness
 * Property 7: Statistics Accuracy Invariant
 * Property 8: Report Structure Completeness
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ReportGenerator } from '../ReportGenerator';
import type { AnalysisResult, ValidationSummary, I18nViolation, ViolationType } from '../types';

describe('ReportGenerator Property Tests', () => {
  const generator = new ReportGenerator();

  // Helper to create mock analysis results
  const createMockResult = (
    hasHook: boolean,
    hasUI: boolean,
    violations: I18nViolation[]
  ): AnalysisResult => ({
    filePath: `test-${Math.random().toString(36).slice(2)}.tsx`,
    hasUseTranslation: hasHook,
    hasUIElements: hasUI,
    violations,
    usedTranslationKeys: []
  });

  // Helper to create mock violation
  const createMockViolation = (type: ViolationType, text: string): I18nViolation => ({
    type,
    filePath: 'test.tsx',
    line: 1,
    column: 1,
    text,
    context: 'test context',
    suggestion: 'test suggestion'
  });

  // Helper to create mock validation summary
  const createMockValidationSummary = (
    locales: string[],
    completeness: Record<string, number>
  ): ValidationSummary => ({
    languages: locales.map(locale => ({
      locale,
      filePath: `${locale}.json`,
      keys: new Set<string>(),
      translations: {}
    })),
    allKeys: new Set<string>(),
    keyResults: [],
    completeness
  });

  describe('Property 5: Violation Reporting Completeness', () => {
    /**
     * Validates: Requirements 2.2, 3.3, 5.4
     * 
     * For any detected violation, the report SHALL include
     * file path, line number, column number, violation type,
     * detected text, and context information.
     */
    it('should include all violation details in report', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<ViolationType>('missing-hook', 'hardcoded-chinese', 'hardcoded-english', 'missing-key'),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 100 }),
          (type, text, line, column) => {
            const violation: I18nViolation = {
              type,
              filePath: 'test.tsx',
              line,
              column,
              text,
              context: 'test context',
              suggestion: 'test suggestion'
            };

            const results = [createMockResult(false, true, [violation])];
            const summary = createMockValidationSummary(['en'], { en: 100 });
            const report = generator.generate(results, summary);

            // Find the violation in the report
            const category = type === 'missing-hook' ? 'missingHook'
              : type === 'hardcoded-chinese' ? 'hardcodedChinese'
              : type === 'hardcoded-english' ? 'hardcodedEnglish'
              : 'missingKeys';

            const reportedViolation = report.violationsByCategory[category][0];

            // Property: all details are preserved
            expect(reportedViolation.filePath).toBe('test.tsx');
            expect(reportedViolation.line).toBe(line);
            expect(reportedViolation.column).toBe(column);
            expect(reportedViolation.type).toBe(type);
            expect(reportedViolation.text).toBe(text);
            expect(reportedViolation.context).toBe('test context');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 7: Statistics Accuracy Invariant', () => {
    /**
     * Validates: Requirements 1.3, 4.5, 6.5
     * 
     * For any scan result, the following invariants SHALL hold:
     * - filesWithHook + filesWithoutHook == totalFilesScanned
     * - sum(violationsByType) == totalViolations
     */
    it('should maintain filesWithHook + filesWithoutHook == totalFiles', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 20 }),
          fc.integer({ min: 0, max: 20 }),
          (withHook, withoutHook) => {
            const results: AnalysisResult[] = [];
            
            // Add files with hook
            for (let i = 0; i < withHook; i++) {
              results.push(createMockResult(true, true, []));
            }
            
            // Add files without hook
            for (let i = 0; i < withoutHook; i++) {
              results.push(createMockResult(false, true, []));
            }

            const summary = createMockValidationSummary(['en'], { en: 100 });
            const report = generator.generate(results, summary);

            // Property: counts must add up
            expect(report.summary.filesWithHook + report.summary.filesWithoutHook)
              .toBe(report.summary.totalFiles);
            expect(report.summary.totalFiles).toBe(withHook + withoutHook);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain sum(violationsByType) == totalViolations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          (hookCount, chineseCount, englishCount, keyCount) => {
            const violations: I18nViolation[] = [];
            
            for (let i = 0; i < hookCount; i++) {
              violations.push(createMockViolation('missing-hook', `hook${i}`));
            }
            for (let i = 0; i < chineseCount; i++) {
              violations.push(createMockViolation('hardcoded-chinese', `中文${i}`));
            }
            for (let i = 0; i < englishCount; i++) {
              violations.push(createMockViolation('hardcoded-english', `English${i}`));
            }
            for (let i = 0; i < keyCount; i++) {
              violations.push(createMockViolation('missing-key', `key${i}`));
            }

            const results = [createMockResult(false, true, violations)];
            const summary = createMockValidationSummary(['en'], { en: 100 });
            const report = generator.generate(results, summary);

            // Property: sum of violations by type equals total
            const sumByType = 
              report.summary.violationsByType['missing-hook'] +
              report.summary.violationsByType['hardcoded-chinese'] +
              report.summary.violationsByType['hardcoded-english'] +
              report.summary.violationsByType['missing-key'];

            expect(sumByType).toBe(report.summary.totalViolations);
            expect(report.summary.totalViolations).toBe(violations.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 8: Report Structure Completeness', () => {
    /**
     * Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6
     * 
     * For any generated coverage report, the report SHALL contain
     * all required sections: summary statistics, translation completeness,
     * violations grouped by category, and fix suggestions.
     */
    it('should contain all required sections', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 0, maxLength: 10 }),
          fc.array(fc.constantFrom('en', 'zh-CN', 'ja', 'es', 'fr', 'de'), { minLength: 1, maxLength: 6 }),
          (hasHooks, locales) => {
            const results = hasHooks.map(hasHook => 
              createMockResult(hasHook, true, [])
            );

            const completeness: Record<string, number> = {};
            locales.forEach(locale => {
              completeness[locale] = Math.round(Math.random() * 100);
            });

            const summary = createMockValidationSummary(locales, completeness);
            const report = generator.generate(results, summary);

            // Property: all required sections exist
            expect(report.timestamp).toBeDefined();
            expect(report.summary).toBeDefined();
            expect(report.summary.totalFiles).toBeDefined();
            expect(report.summary.filesWithHook).toBeDefined();
            expect(report.summary.filesWithoutHook).toBeDefined();
            expect(report.summary.totalViolations).toBeDefined();
            expect(report.summary.violationsByType).toBeDefined();
            expect(report.summary.coveragePercentage).toBeDefined();
            expect(report.translationCompleteness).toBeDefined();
            expect(report.violationsByCategory).toBeDefined();
            expect(report.violationsByCategory.missingHook).toBeDefined();
            expect(report.violationsByCategory.hardcodedChinese).toBeDefined();
            expect(report.violationsByCategory.hardcodedEnglish).toBeDefined();
            expect(report.violationsByCategory.missingKeys).toBeDefined();
            expect(report.recommendations).toBeDefined();
            expect(Array.isArray(report.recommendations)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should produce equivalent information in console and JSON formats', () => {
      const results = [
        createMockResult(true, true, []),
        createMockResult(false, true, [createMockViolation('hardcoded-chinese', '测试')])
      ];
      const summary = createMockValidationSummary(['en', 'zh-CN'], { en: 100, 'zh-CN': 80 });
      const report = generator.generate(results, summary);

      const consoleOutput = generator.formatConsole(report);
      const jsonOutput = generator.formatJSON(report);

      // Both formats should be non-empty
      expect(consoleOutput.length).toBeGreaterThan(0);
      expect(jsonOutput.length).toBeGreaterThan(0);

      // JSON should be parseable
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.summary.totalFiles).toBe(report.summary.totalFiles);
      expect(parsed.summary.totalViolations).toBe(report.summary.totalViolations);

      // Console should contain key information
      expect(consoleOutput).toContain('总文件数');
      expect(consoleOutput).toContain('覆盖率');
    });
  });
});
