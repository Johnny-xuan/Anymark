/**
 * I18n Audit Integration Test
 * 
 * Tests the complete audit workflow with sample files
 */

import { describe, it, expect } from 'vitest';
import { auditContent, analyzeFile, formatReportConsole } from '../audit';

describe('I18n Audit Integration', () => {
  describe('auditContent', () => {
    it('should audit multiple files and generate a complete report', () => {
      const files = [
        {
          path: 'components/Button.tsx',
          content: `
import React from 'react';
import { useTranslation } from 'react-i18next';

export function Button() {
  const { t } = useTranslation();
  return <button>{t('common.submit')}</button>;
}
`
        },
        {
          path: 'components/Header.tsx',
          content: `
import React from 'react';

export function Header() {
  return <h1>Welcome to App</h1>;
}
`
        },
        {
          path: 'components/Form.tsx',
          content: `
import React from 'react';

export function Form() {
  return (
    <form>
      <input placeholder="请输入用户名" />
      <button>提交</button>
    </form>
  );
}
`
        }
      ];

      const languageFiles = [
        {
          locale: 'en',
          data: {
            common: {
              submit: 'Submit',
              cancel: 'Cancel'
            }
          }
        },
        {
          locale: 'zh-CN',
          data: {
            common: {
              submit: '提交'
              // missing 'cancel'
            }
          }
        }
      ];

      const report = auditContent(files, languageFiles);

      // Verify report structure
      expect(report.timestamp).toBeDefined();
      expect(report.summary.totalFiles).toBe(3);
      expect(report.summary.filesWithHook).toBe(1);
      expect(report.summary.filesWithoutHook).toBe(2);

      // Should detect violations
      expect(report.summary.totalViolations).toBeGreaterThan(0);

      // Should detect Chinese text
      expect(report.violationsByCategory.hardcodedChinese.length).toBeGreaterThan(0);

      // Should detect missing hook
      expect(report.violationsByCategory.missingHook.length).toBeGreaterThan(0);

      // Should have translation completeness
      expect(report.translationCompleteness['en']).toBeDefined();
      expect(report.translationCompleteness['zh-CN']).toBeDefined();

      // Should have recommendations
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should report 100% coverage for fully internationalized files', () => {
      const files = [
        {
          path: 'components/Good.tsx',
          content: `
import React from 'react';
import { useTranslation } from 'react-i18next';

export function Good() {
  const { t } = useTranslation();
  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </div>
  );
}
`
        }
      ];

      const languageFiles = [
        { locale: 'en', data: { title: 'Title', description: 'Description' } },
        { locale: 'zh-CN', data: { title: '标题', description: '描述' } }
      ];

      const report = auditContent(files, languageFiles);

      expect(report.summary.filesWithHook).toBe(1);
      expect(report.summary.totalViolations).toBe(0);
      expect(report.summary.coveragePercentage).toBe(100);
    });
  });

  describe('analyzeFile', () => {
    it('should analyze a single file', () => {
      const content = `
import React from 'react';
import { useTranslation } from 'react-i18next';

export function Component() {
  const { t } = useTranslation();
  return <div title="Hello">{t('hello')}</div>;
}
`;
      const result = analyzeFile('test.tsx', content);

      expect(result.hasUseTranslation).toBe(true);
      // Has UI elements because of title attribute
      expect(result.hasUIElements).toBe(true);
      expect(result.usedTranslationKeys).toContain('hello');
    });
  });

  describe('formatReportConsole', () => {
    it('should format report for console output', () => {
      const files = [
        {
          path: 'test.tsx',
          content: `
import React from 'react';
export function Test() {
  return <div>Hello</div>;
}
`
        }
      ];

      const languageFiles = [
        { locale: 'en', data: { hello: 'Hello' } }
      ];

      const report = auditContent(files, languageFiles);
      const output = formatReportConsole(report);

      expect(output).toContain('I18n 覆盖率审计报告');
      expect(output).toContain('总文件数');
      expect(output).toContain('覆盖率');
    });
  });
});
