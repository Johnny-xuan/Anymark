/**
 * Chrome _locales Validation Tests
 * 
 * Validates: Requirements 7.2, 7.5
 * - All messages.json files have correct format
 * - Required keys exist in all language files
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Chrome locale directory mapping (Chrome uses underscore for zh_CN)
const CHROME_LOCALES = ['en', 'zh_CN', 'ja', 'es', 'fr', 'de'];
const REQUIRED_KEYS = ['extensionName', 'extensionDescription', 'actionTitle'];

describe('Chrome _locales Validation', () => {
  const localesDir = path.join(__dirname, '../../public/_locales');

  describe('Directory Structure', () => {
    it('should have _locales directory', () => {
      expect(fs.existsSync(localesDir)).toBe(true);
    });

    it('should have all required locale directories', () => {
      for (const locale of CHROME_LOCALES) {
        const localeDir = path.join(localesDir, locale);
        expect(fs.existsSync(localeDir)).toBe(true);
      }
    });

    it('should have messages.json in each locale directory', () => {
      for (const locale of CHROME_LOCALES) {
        const messagesFile = path.join(localesDir, locale, 'messages.json');
        expect(fs.existsSync(messagesFile)).toBe(true);
      }
    });
  });

  describe('Messages Format', () => {
    for (const locale of CHROME_LOCALES) {
      describe(`${locale}/messages.json`, () => {
        let messages: Record<string, { message: string; description?: string }>;

        it('should be valid JSON', () => {
          const messagesFile = path.join(localesDir, locale, 'messages.json');
          const content = fs.readFileSync(messagesFile, 'utf-8');
          messages = JSON.parse(content);
          expect(messages).toBeDefined();
        });

        it('should have all required keys', () => {
          const messagesFile = path.join(localesDir, locale, 'messages.json');
          const content = fs.readFileSync(messagesFile, 'utf-8');
          messages = JSON.parse(content);
          
          for (const key of REQUIRED_KEYS) {
            expect(messages[key]).toBeDefined();
            expect(messages[key].message).toBeDefined();
            expect(typeof messages[key].message).toBe('string');
            expect(messages[key].message.length).toBeGreaterThan(0);
          }
        });

        it('should have valid message structure', () => {
          const messagesFile = path.join(localesDir, locale, 'messages.json');
          const content = fs.readFileSync(messagesFile, 'utf-8');
          messages = JSON.parse(content);
          
          for (const [key, value] of Object.entries(messages)) {
            // Each entry should have a message property
            expect(value.message).toBeDefined();
            expect(typeof value.message).toBe('string');
            
            // Description is optional but if present should be string
            if (value.description !== undefined) {
              expect(typeof value.description).toBe('string');
            }
          }
        });
      });
    }
  });

  describe('Cross-locale Consistency', () => {
    it('should have same keys in all locale files', () => {
      const keysByLocale: Record<string, string[]> = {};
      
      for (const locale of CHROME_LOCALES) {
        const messagesFile = path.join(localesDir, locale, 'messages.json');
        const content = fs.readFileSync(messagesFile, 'utf-8');
        const messages = JSON.parse(content);
        keysByLocale[locale] = Object.keys(messages).sort();
      }
      
      // All locales should have the same keys as English
      const enKeys = keysByLocale['en'];
      for (const locale of CHROME_LOCALES) {
        expect(keysByLocale[locale]).toEqual(enKeys);
      }
    });
  });
});
