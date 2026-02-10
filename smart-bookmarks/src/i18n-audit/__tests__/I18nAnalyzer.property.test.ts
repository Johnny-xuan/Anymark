/**
 * I18nAnalyzer Property Tests
 * 
 * Property 1: useTranslation Hook Detection Accuracy
 * Property 2: Chinese Character Detection Completeness
 * Property 3: English UI Text Classification
 * Property 4: Context-Based Exclusion Rules
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { I18nAnalyzer } from '../I18nAnalyzer';
import { ASTParser } from '../ASTParser';
import type { ParsedFile } from '../types';

describe('I18nAnalyzer Property Tests', () => {
  const analyzer = new I18nAnalyzer();
  const parser = new ASTParser();

  describe('Property 1: useTranslation Hook Detection Accuracy', () => {
    /**
     * Validates: Requirements 1.1, 1.2, 1.4
     * 
     * For any .tsx file content, if the file contains 
     * `import { useTranslation } from 'react-i18next'`,
     * the analyzer SHALL correctly detect the presence of the hook.
     */
    it('should detect useTranslation import correctly', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Z][a-z]+$/.test(s)),
          (hasHook, componentName) => {
            const content = hasHook
              ? `
import React from 'react';
import { useTranslation } from 'react-i18next';

export function ${componentName}() {
  const { t } = useTranslation();
  return <div>{t('hello')}</div>;
}
`
              : `
import React from 'react';

export function ${componentName}() {
  return <div>Hello</div>;
}
`;
            const parsed = parser.parseContent('test.tsx', content);
            const result = analyzer.analyze(parsed);
            
            expect(result.hasUseTranslation).toBe(hasHook);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Files with UI elements but no useTranslation should be flagged
     */
    it('should flag files with UI elements but no useTranslation', () => {
      const content = `
import React from 'react';

export function Button() {
  return <button title="Click me">Submit</button>;
}
`;
      const parsed = parser.parseContent('test.tsx', content);
      const result = analyzer.analyze(parsed);
      
      expect(result.hasUIElements).toBe(true);
      expect(result.hasUseTranslation).toBe(false);
      expect(result.violations.some(v => v.type === 'missing-hook')).toBe(true);
    });
  });

  describe('Property 2: Chinese Character Detection Completeness', () => {
    /**
     * Validates: Requirements 2.1, 2.3
     * 
     * For any string literal containing Chinese characters,
     * the analyzer SHALL detect and report it.
     */
    it('should detect Chinese characters in any context', () => {
      fc.assert(
        fc.property(
          // Generate random Chinese characters
          fc.integer({ min: 0x4e00, max: 0x9fff }).map(code => String.fromCharCode(code)),
          fc.string({ minLength: 0, maxLength: 5 }).filter(s => /^[a-z]*$/.test(s)),
          (chineseChar, prefix) => {
            const chineseText = `${prefix}${chineseChar}`;
            const content = `
import React from 'react';

export function Component() {
  return <div>${chineseText}</div>;
}
`;
            const parsed = parser.parseContent('test.tsx', content);
            const result = analyzer.analyze(parsed);
            
            // Should detect the Chinese text
            const chineseViolations = result.violations.filter(v => v.type === 'hardcoded-chinese');
            expect(chineseViolations.length).toBeGreaterThan(0);
            expect(chineseViolations.some(v => v.text.includes(chineseChar))).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Chinese in JSX attributes should be detected
     */
    it('should detect Chinese in JSX attributes', () => {
      const content = `
import React from 'react';

export function Component() {
  return <input placeholder="请输入" title="标题" />;
}
`;
      const parsed = parser.parseContent('test.tsx', content);
      const result = analyzer.analyze(parsed);
      
      const chineseViolations = result.violations.filter(v => v.type === 'hardcoded-chinese');
      expect(chineseViolations.length).toBe(2);
    });
  });

  describe('Property 3: English UI Text Classification', () => {
    /**
     * Validates: Requirements 3.1, 3.2, 3.4
     * 
     * The analyzer SHALL correctly classify English text as either
     * UI text (requiring translation) or technical string (excluded).
     */
    it('should detect English UI text in visible elements', () => {
      const content = `
import React from 'react';

export function Component() {
  return (
    <div>
      <button title="Click Here">Submit Form</button>
      <input placeholder="Enter Name" />
    </div>
  );
}
`;
      const parsed = parser.parseContent('test.tsx', content);
      const result = analyzer.analyze(parsed);
      
      const englishViolations = result.violations.filter(v => v.type === 'hardcoded-english');
      // Should detect UI text like "Submit Form", "Click Here", "Enter Name"
      expect(englishViolations.length).toBeGreaterThan(0);
    });

    /**
     * Technical strings should NOT be flagged
     */
    it('should not flag technical strings', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('btn-primary', 'user_id', 'data-test', 'https://example.com'),
          (technicalString) => {
            const content = `
import React from 'react';

export function Component() {
  return <div className="${technicalString}" />;
}
`;
            const parsed = parser.parseContent('test.tsx', content);
            const result = analyzer.analyze(parsed);
            
            // className values should not be flagged
            const violations = result.violations.filter(
              v => v.type === 'hardcoded-english' && v.text === technicalString
            );
            expect(violations.length).toBe(0);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 4: Context-Based Exclusion Rules', () => {
    /**
     * Validates: Requirements 2.4, 3.5
     * 
     * Text in excluded contexts (comments, console.log, className, etc.)
     * SHALL NOT be reported as violations.
     */
    it('should exclude className values', () => {
      const content = `
import React from 'react';

export function Component() {
  return <div className="Hello World" />;
}
`;
      const parsed = parser.parseContent('test.tsx', content);
      const result = analyzer.analyze(parsed);
      
      // className should be excluded
      const violations = result.violations.filter(v => v.text === 'Hello World');
      expect(violations.length).toBe(0);
    });

    it('should exclude data-* attributes', () => {
      const content = `
import React from 'react';

export function Component() {
  return <div data-testid="Hello World" data-value="测试" />;
}
`;
      const parsed = parser.parseContent('test.tsx', content);
      const result = analyzer.analyze(parsed);
      
      // data-* attributes should be excluded
      const violations = result.violations.filter(
        v => v.text === 'Hello World' || v.text === '测试'
      );
      expect(violations.length).toBe(0);
    });

    it('should exclude translation keys (t() calls)', () => {
      const content = `
import React from 'react';
import { useTranslation } from 'react-i18next';

export function Component() {
  const { t } = useTranslation();
  return <div>{t('hello_world')}</div>;
}
`;
      const parsed = parser.parseContent('test.tsx', content);
      const result = analyzer.analyze(parsed);
      
      // Translation keys should not be flagged
      const violations = result.violations.filter(v => v.text === 'hello_world');
      expect(violations.length).toBe(0);
    });

    it('should exclude event handler attributes', () => {
      const content = `
import React from 'react';

export function Component() {
  return <button onClick="handleClick" onMouseOver="handleHover">Click</button>;
}
`;
      const parsed = parser.parseContent('test.tsx', content);
      const result = analyzer.analyze(parsed);
      
      // Event handlers should be excluded
      const violations = result.violations.filter(
        v => v.text === 'handleClick' || v.text === 'handleHover'
      );
      expect(violations.length).toBe(0);
    });
  });
});
