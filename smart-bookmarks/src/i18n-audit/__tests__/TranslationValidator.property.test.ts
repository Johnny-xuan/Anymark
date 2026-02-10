/**
 * TranslationValidator Property Tests
 * 
 * Property 6: Translation Key Validation Round-Trip
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TranslationValidator } from '../TranslationValidator';

describe('TranslationValidator Property Tests', () => {
  const validator = new TranslationValidator();

  describe('Property 6: Translation Key Validation Round-Trip', () => {
    /**
     * For any set of language files and code files using translation keys,
     * the validator SHALL correctly identify:
     * (a) all keys used in code
     * (b) all keys present in each language file
     * (c) keys missing from specific language files
     * 
     * The union of reported present and missing keys for each language
     * SHALL equal the set of all used keys.
     */
    it('should correctly identify all keys across languages', () => {
      fc.assert(
        fc.property(
          // Generate random keys
          fc.uniqueArray(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z][a-z0-9_.]*$/i.test(s)),
            { minLength: 1, maxLength: 10 }
          ),
          // Generate which keys each language has (subset of all keys)
          fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
          (allKeys, enHasKey) => {
            // Create language data
            const enData: Record<string, string> = {};
            const zhData: Record<string, string> = {};
            
            allKeys.forEach((key, i) => {
              if (enHasKey[i % enHasKey.length]) {
                enData[key] = `EN: ${key}`;
              }
              // zh-CN has all keys
              zhData[key] = `ZH: ${key}`;
            });

            const languages = validator.loadLanguageFiles([
              { locale: 'en', filePath: 'en.json', data: enData },
              { locale: 'zh-CN', filePath: 'zh-CN.json', data: zhData }
            ]);

            const summary = validator.validateKeys(allKeys, languages);

            // Property: union of present and missing equals all keys
            for (const result of summary.keyResults) {
              const unionSize = result.presentIn.length + result.missingIn.length;
              expect(unionSize).toBe(languages.length);
            }

            // Property: all keys are accounted for
            expect(summary.allKeys.size).toBe(allKeys.length);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should calculate completeness correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 0, max: 20 }),
          (totalKeys, presentKeys) => {
            const actualPresent = Math.min(presentKeys, totalKeys);
            
            // Create keys
            const allKeys = Array.from({ length: totalKeys }, (_, i) => `key${i}`);
            const enKeys = allKeys.slice(0, actualPresent);
            
            const enData: Record<string, string> = {};
            enKeys.forEach(k => { enData[k] = k; });
            
            const zhData: Record<string, string> = {};
            allKeys.forEach(k => { zhData[k] = k; });

            const languages = validator.loadLanguageFiles([
              { locale: 'en', filePath: 'en.json', data: enData },
              { locale: 'zh-CN', filePath: 'zh-CN.json', data: zhData }
            ]);

            const summary = validator.validateKeys(allKeys, languages);

            // Property: completeness calculation is correct
            const expectedEnCompleteness = totalKeys === 0 
              ? 100 
              : Math.round((actualPresent / totalKeys) * 100 * 100) / 100;
            
            expect(summary.completeness['en']).toBe(expectedEnCompleteness);
            expect(summary.completeness['zh-CN']).toBe(100);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should flatten nested keys correctly', () => {
      const nestedData = {
        common: {
          buttons: {
            submit: 'Submit',
            cancel: 'Cancel'
          },
          labels: {
            name: 'Name'
          }
        },
        pages: {
          home: 'Home'
        }
      };

      const keys = validator.flattenKeys(nestedData);

      expect(keys).toContain('common.buttons.submit');
      expect(keys).toContain('common.buttons.cancel');
      expect(keys).toContain('common.labels.name');
      expect(keys).toContain('pages.home');
      expect(keys.length).toBe(4);
    });

    it('should identify missing keys per language', () => {
      const enData = { hello: 'Hello', world: 'World' };
      const zhData = { hello: '你好' }; // missing 'world'

      const languages = validator.loadLanguageFiles([
        { locale: 'en', filePath: 'en.json', data: enData },
        { locale: 'zh-CN', filePath: 'zh-CN.json', data: zhData }
      ]);

      const summary = validator.validateKeys(['hello', 'world'], languages);
      const missing = validator.getMissingKeys(summary);

      expect(missing['en']).toEqual([]);
      expect(missing['zh-CN']).toContain('world');
    });

    it('should identify incomplete keys (present in some but not all)', () => {
      const enData = { a: 'A', b: 'B' };
      const zhData = { a: 'A' }; // missing 'b'
      const jaData = { a: 'A', b: 'B', c: 'C' }; // has extra 'c'

      const languages = validator.loadLanguageFiles([
        { locale: 'en', filePath: 'en.json', data: enData },
        { locale: 'zh-CN', filePath: 'zh-CN.json', data: zhData },
        { locale: 'ja', filePath: 'ja.json', data: jaData }
      ]);

      const summary = validator.validateKeys(['a', 'b'], languages);
      const incomplete = validator.getIncompleteKeys(summary);

      // 'b' is incomplete (missing in zh-CN)
      // 'c' is incomplete (only in ja)
      expect(incomplete.length).toBeGreaterThan(0);
      expect(incomplete.some(k => k.key === 'b')).toBe(true);
    });
  });
});
