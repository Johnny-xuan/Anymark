/**
 * ASTParser Unit Tests
 * 
 * Tests for TSX file parsing, import extraction, and string literal detection
 */

import { describe, it, expect } from 'vitest';
import { ASTParser } from '../ASTParser';

describe('ASTParser', () => {
  const parser = new ASTParser();

  describe('parseContent', () => {
    it('should parse a simple TSX file', () => {
      const content = `
import React from 'react';
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t } = useTranslation();
  return <div>Hello World</div>;
}
`;
      const result = parser.parseContent('test.tsx', content);
      
      expect(result.hasErrors).toBe(false);
      expect(result.imports.length).toBe(2);
      expect(result.imports[0].moduleName).toBe('react');
      expect(result.imports[1].moduleName).toBe('react-i18next');
      expect(result.imports[1].importedNames).toContain('useTranslation');
    });

    it('should extract JSX elements', () => {
      const content = `
import React from 'react';

export function Button() {
  return <button className="btn" title="Click me">Submit</button>;
}
`;
      const result = parser.parseContent('test.tsx', content);
      
      expect(result.hasErrors).toBe(false);
      expect(result.jsxElements.length).toBeGreaterThan(0);
      
      const button = result.jsxElements.find(el => el.tagName === 'button');
      expect(button).toBeDefined();
      expect(button?.textContent).toBe('Submit');
      expect(button?.attributes.find(a => a.name === 'className')?.value).toBe('btn');
      expect(button?.attributes.find(a => a.name === 'title')?.value).toBe('Click me');
    });

    it('should extract string literals', () => {
      const content = `
import React from 'react';

export function Component() {
  const message = "Hello";
  return <div title="World">你好</div>;
}
`;
      const result = parser.parseContent('test.tsx', content);
      
      expect(result.hasErrors).toBe(false);
      expect(result.stringLiterals.length).toBeGreaterThan(0);
      
      // Check for variable string
      const helloStr = result.stringLiterals.find(s => s.value === 'Hello');
      expect(helloStr).toBeDefined();
      expect(helloStr?.context).toBe('variable');
      
      // Check for JSX attribute string
      const worldStr = result.stringLiterals.find(s => s.value === 'World');
      expect(worldStr).toBeDefined();
      expect(worldStr?.context).toBe('jsx-attribute');
      
      // Check for JSX text (Chinese)
      const chineseStr = result.stringLiterals.find(s => s.value === '你好');
      expect(chineseStr).toBeDefined();
      expect(chineseStr?.context).toBe('jsx-text');
    });

    it('should detect useTranslation import', () => {
      const content = `
import { useTranslation } from 'react-i18next';

export function Component() {
  const { t } = useTranslation();
  return <div>{t('hello')}</div>;
}
`;
      const result = parser.parseContent('test.tsx', content);
      
      const i18nImport = result.imports.find(i => i.moduleName === 'react-i18next');
      expect(i18nImport).toBeDefined();
      expect(i18nImport?.importedNames).toContain('useTranslation');
    });

    it('should handle template literals', () => {
      const content = `
const message = \`Hello \${name}\`;
`;
      const result = parser.parseContent('test.tsx', content);
      
      const templateStr = result.stringLiterals.find(s => s.context === 'template-literal');
      expect(templateStr).toBeDefined();
      expect(templateStr?.value).toContain('Hello');
    });

    it('should handle parse errors gracefully', async () => {
      const result = await parser.parse('nonexistent.tsx');
      
      expect(result.hasErrors).toBe(true);
      expect(result.errorMessage).toBeDefined();
    });
  });
});
