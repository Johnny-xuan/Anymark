/**
 * Translation Coverage Property Tests
 * 
 * Property 1: Translation Coverage
 * Property 11: Translation Key Naming Convention
 * 
 * Validates: Requirements 1.1, 6.4, 6.5
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// i18n locale files
const LOCALES = ['en', 'zh-CN', 'ja', 'es', 'fr', 'de'];
const localesDir = path.join(__dirname, '../i18n/locales');

// Helper to get all keys from a nested object
function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe('Property 1: Translation Coverage', () => {
  let localeData: Record<string, Record<string, unknown>> = {};
  let allKeys: Record<string, string[]> = {};

  // Load all locale files
  beforeAll(() => {
    for (const locale of LOCALES) {
      const filePath = path.join(localesDir, `${locale}.json`);
      const content = fs.readFileSync(filePath, 'utf-8');
      localeData[locale] = JSON.parse(content);
      allKeys[locale] = getAllKeys(localeData[locale]).sort();
    }
  });

  it('should have all locale files', () => {
    for (const locale of LOCALES) {
      const filePath = path.join(localesDir, `${locale}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  it('should have core translation keys in all locale files', () => {
    // Core keys that must exist in all locales
    const coreKeyPrefixes = [
      'onboarding.',
      'sidebar.',
      'chat.',
    ];
    
    for (const locale of LOCALES) {
      for (const prefix of coreKeyPrefixes) {
        const hasPrefix = allKeys[locale].some(key => key.startsWith(prefix));
        expect(hasPrefix).toBe(true);
      }
    }
  });

  it('should have non-empty translations for existing keys', () => {
    for (const locale of LOCALES) {
      const keys = allKeys[locale];
      
      for (const key of keys) {
        const value = getNestedValue(localeData[locale], key);
        expect(typeof value).toBe('string');
        expect((value as string).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Property 11: Translation Key Naming Convention', () => {
  let enData: Record<string, unknown>;
  let enKeys: string[];

  beforeAll(() => {
    const filePath = path.join(localesDir, 'en.json');
    const content = fs.readFileSync(filePath, 'utf-8');
    enData = JSON.parse(content);
    enKeys = getAllKeys(enData);
  });

  it('should use camelCase or dot notation for keys', () => {
    for (const key of enKeys) {
      // Keys should be camelCase or use dot notation for nesting
      // Valid: "sidebar.title", "bookmarkList", "errors.notFound"
      // Invalid: "sidebar-title", "bookmark_list"
      const parts = key.split('.');
      for (const part of parts) {
        // Each part should be camelCase (no hyphens or underscores)
        expect(part).not.toMatch(/-/);
        expect(part).not.toMatch(/_/);
      }
    }
  });

  it('should have logical grouping with namespaces', () => {
    // Check that related keys are grouped under namespaces
    const topLevelKeys = Object.keys(enData);
    
    // Should have some namespace groupings
    const hasNamespaces = topLevelKeys.some(key => 
      typeof enData[key] === 'object' && enData[key] !== null
    );
    
    expect(hasNamespaces).toBe(true);
  });
});

// Helper to get nested value from object using dot notation
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

// Import beforeAll from vitest
import { beforeAll } from 'vitest';
