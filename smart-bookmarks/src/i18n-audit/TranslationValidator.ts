/**
 * TranslationValidator - Translation key validation
 * 
 * Validates translation key completeness across all language files.
 * Identifies missing keys and calculates completeness percentages.
 */

import type {
  LanguageFile,
  KeyValidationResult,
  ValidationSummary
} from './types';

/**
 * TranslationValidator class for validating translation keys
 */
export class TranslationValidator {
  /**
   * Load language files from JSON objects
   * In browser environment, pass pre-loaded JSON objects
   */
  loadLanguageFiles(
    languageData: Array<{ locale: string; filePath: string; data: Record<string, unknown> }>
  ): LanguageFile[] {
    return languageData.map(({ locale, filePath, data }) => ({
      locale,
      filePath,
      keys: new Set(this.flattenKeys(data)),
      translations: data
    }));
  }

  /**
   * Flatten nested translation object to dot-notation keys
   */
  flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively flatten nested objects
        keys.push(...this.flattenKeys(value as Record<string, unknown>, fullKey));
      } else {
        // Leaf node - add the key
        keys.push(fullKey);
      }
    }

    return keys;
  }

  /**
   * Validate translation keys across all language files
   */
  validateKeys(usedKeys: string[], languages: LanguageFile[]): ValidationSummary {
    // Collect all unique keys from all language files
    const allKeysFromFiles = new Set<string>();
    for (const lang of languages) {
      for (const key of lang.keys) {
        allKeysFromFiles.add(key);
      }
    }

    // Also include used keys from code
    const allKeys = new Set([...allKeysFromFiles, ...usedKeys]);

    // Validate each key
    const keyResults: KeyValidationResult[] = [];
    for (const key of allKeys) {
      const presentIn: string[] = [];
      const missingIn: string[] = [];

      for (const lang of languages) {
        if (lang.keys.has(key)) {
          presentIn.push(lang.locale);
        } else {
          missingIn.push(lang.locale);
        }
      }

      keyResults.push({ key, presentIn, missingIn });
    }

    // Calculate completeness for each language
    const completeness: Record<string, number> = {};
    const totalKeys = allKeys.size;

    for (const lang of languages) {
      if (totalKeys === 0) {
        completeness[lang.locale] = 100;
      } else {
        const presentCount = [...allKeys].filter(k => lang.keys.has(k)).length;
        completeness[lang.locale] = Math.round((presentCount / totalKeys) * 100 * 100) / 100;
      }
    }

    return {
      languages,
      allKeys,
      keyResults,
      completeness
    };
  }

  /**
   * Get keys that are missing in specific languages
   */
  getMissingKeys(summary: ValidationSummary): Record<string, string[]> {
    const missingByLanguage: Record<string, string[]> = {};

    for (const lang of summary.languages) {
      missingByLanguage[lang.locale] = [];
    }

    for (const result of summary.keyResults) {
      for (const locale of result.missingIn) {
        if (missingByLanguage[locale]) {
          missingByLanguage[locale].push(result.key);
        }
      }
    }

    return missingByLanguage;
  }

  /**
   * Get keys that exist in some languages but not all
   */
  getIncompleteKeys(summary: ValidationSummary): KeyValidationResult[] {
    return summary.keyResults.filter(
      result => result.missingIn.length > 0 && result.presentIn.length > 0
    );
  }

  /**
   * Get keys that are defined but never used in code
   */
  getUnusedKeys(summary: ValidationSummary, usedKeys: string[]): string[] {
    const usedSet = new Set(usedKeys);
    const unusedKeys: string[] = [];

    for (const key of summary.allKeys) {
      if (!usedSet.has(key)) {
        unusedKeys.push(key);
      }
    }

    return unusedKeys;
  }

  /**
   * Get keys that are used in code but not defined in any language file
   */
  getUndefinedKeys(summary: ValidationSummary, usedKeys: string[]): string[] {
    const undefinedKeys: string[] = [];

    for (const key of usedKeys) {
      const result = summary.keyResults.find(r => r.key === key);
      if (result && result.presentIn.length === 0) {
        undefinedKeys.push(key);
      }
    }

    return undefinedKeys;
  }
}

// Export singleton instance
export const translationValidator = new TranslationValidator();
