/**
 * I18nAnalyzer - Internationalization issue detection
 * 
 * Analyzes parsed files to detect i18n violations including:
 * - Missing useTranslation hook
 * - Hardcoded Chinese text
 * - Hardcoded English UI text
 */

import type {
  ParsedFile,
  AnalysisResult,
  I18nViolation,
  ViolationType,
  DetectionRules,
  StringLiteralInfo
} from './types';
import { DEFAULT_DETECTION_RULES } from './types';

/**
 * I18nAnalyzer class for detecting i18n issues
 */
export class I18nAnalyzer {
  private rules: DetectionRules;

  constructor(rules: DetectionRules = DEFAULT_DETECTION_RULES) {
    this.rules = rules;
  }

  /**
   * Analyze a parsed file for i18n violations
   */
  analyze(parsedFile: ParsedFile): AnalysisResult {
    const hasUseTranslation = this.detectUseTranslation(parsedFile);
    const hasUIElements = this.detectUIElements(parsedFile);
    const usedTranslationKeys = this.extractTranslationKeys(parsedFile);
    const violations: I18nViolation[] = [];

    // Check for missing useTranslation hook
    if (hasUIElements && !hasUseTranslation) {
      violations.push({
        type: 'missing-hook',
        filePath: parsedFile.filePath,
        line: 1,
        column: 1,
        text: '',
        context: 'File contains UI elements but does not use useTranslation hook',
        suggestion: "Add `import { useTranslation } from 'react-i18next';` and use `const { t } = useTranslation();`"
      });
    }

    // Check for hardcoded Chinese text
    const chineseViolations = this.detectHardcodedChinese(parsedFile);
    violations.push(...chineseViolations);

    // Check for hardcoded English UI text
    const englishViolations = this.detectHardcodedEnglish(parsedFile);
    violations.push(...englishViolations);

    return {
      filePath: parsedFile.filePath,
      hasUseTranslation,
      hasUIElements,
      violations,
      usedTranslationKeys
    };
  }

  /**
   * Detect if file uses useTranslation hook
   */
  detectUseTranslation(parsedFile: ParsedFile): boolean {
    return parsedFile.imports.some(
      imp => 
        imp.moduleName === 'react-i18next' && 
        imp.importedNames.includes('useTranslation')
    );
  }

  /**
   * Detect if file contains UI elements
   */
  detectUIElements(parsedFile: ParsedFile): boolean {
    // Check for JSX elements with text content or UI-related attributes
    return parsedFile.jsxElements.some(el => {
      // Has text content
      if (el.textContent) {
        return true;
      }
      // Has UI-related attributes
      return el.attributes.some(attr => 
        ['title', 'placeholder', 'aria-label', 'alt'].includes(attr.name) &&
        attr.value
      );
    });
  }

  /**
   * Extract translation keys used in the file (t('key') calls)
   */
  extractTranslationKeys(parsedFile: ParsedFile): string[] {
    const keys: string[] = [];
    
    for (const str of parsedFile.stringLiterals) {
      if (str.context === 'function-call' && str.parentContext === 't') {
        keys.push(str.value);
      }
    }
    
    return keys;
  }

  /**
   * Detect hardcoded Chinese text
   */
  detectHardcodedChinese(parsedFile: ParsedFile): I18nViolation[] {
    const violations: I18nViolation[] = [];

    for (const str of parsedFile.stringLiterals) {
      // Skip if in excluded context
      if (this.isExcludedContext(str)) {
        continue;
      }

      // Check for Chinese characters
      if (this.rules.chinesePattern.test(str.value)) {
        violations.push({
          type: 'hardcoded-chinese',
          filePath: parsedFile.filePath,
          line: str.line,
          column: str.column,
          text: str.value,
          context: this.getContextDescription(str),
          suggestion: this.generateChineseSuggestion(str)
        });
      }
    }

    return violations;
  }

  /**
   * Detect hardcoded English UI text
   */
  detectHardcodedEnglish(parsedFile: ParsedFile): I18nViolation[] {
    const violations: I18nViolation[] = [];

    for (const str of parsedFile.stringLiterals) {
      // Skip if in excluded context
      if (this.isExcludedContext(str)) {
        continue;
      }

      // Only check JSX text and UI-related attributes
      if (!this.isUIContext(str)) {
        continue;
      }

      // Check for English UI text pattern
      if (this.isEnglishUIText(str.value)) {
        violations.push({
          type: 'hardcoded-english',
          filePath: parsedFile.filePath,
          line: str.line,
          column: str.column,
          text: str.value,
          context: this.getContextDescription(str),
          suggestion: this.generateEnglishSuggestion(str)
        });
      }
    }

    return violations;
  }

  /**
   * Check if string is in an excluded context
   */
  private isExcludedContext(str: StringLiteralInfo): boolean {
    // Check excluded contexts
    if (this.rules.excludedContexts.includes(str.context)) {
      return true;
    }

    // Check excluded attributes
    if (str.context === 'jsx-attribute' && str.parentContext) {
      // Check exact match
      if (this.rules.excludedAttributes.includes(str.parentContext)) {
        return true;
      }
      // Check data-* pattern
      if (str.parentContext.startsWith('data-') && 
          this.rules.excludedAttributes.includes('data-*')) {
        return true;
      }
      // Check on* event handlers
      if (str.parentContext.startsWith('on') && 
          str.parentContext.length > 2 &&
          str.parentContext[2] === str.parentContext[2].toUpperCase()) {
        return true;
      }
    }

    // Check if it's a function call to console
    if (str.context === 'function-call' && str.parentContext) {
      if (['log', 'warn', 'error', 'info', 'debug'].includes(str.parentContext)) {
        return true;
      }
    }

    // Check if it's a translation key (t() call)
    if (str.context === 'function-call' && str.parentContext === 't') {
      return true;
    }

    return false;
  }

  /**
   * Check if string is in a UI context
   */
  private isUIContext(str: StringLiteralInfo): boolean {
    // JSX text is always UI
    if (str.context === 'jsx-text') {
      return true;
    }

    // Check UI-related attributes
    if (str.context === 'jsx-attribute' && str.parentContext) {
      const uiAttributes = ['title', 'placeholder', 'aria-label', 'alt', 'label'];
      return uiAttributes.includes(str.parentContext);
    }

    return false;
  }

  /**
   * Check if text looks like English UI text
   */
  private isEnglishUIText(text: string): boolean {
    // Skip very short strings
    if (text.length < 2) {
      return false;
    }

    // Skip if contains special characters that suggest it's not UI text
    if (/^[a-z_-]+$/.test(text)) {
      // All lowercase with underscores/dashes - likely a key or identifier
      return false;
    }

    // Skip URLs
    if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('/')) {
      return false;
    }

    // Skip file paths
    if (text.includes('/') && text.includes('.')) {
      return false;
    }

    // Skip CSS values
    if (/^\d+(\.\d+)?(px|em|rem|%|vh|vw)$/.test(text)) {
      return false;
    }

    // Skip color values
    if (/^#[0-9a-fA-F]{3,8}$/.test(text) || /^(rgb|rgba|hsl|hsla)\(/.test(text)) {
      return false;
    }

    // Check for English UI text pattern (capitalized words)
    return this.rules.englishUIPattern.test(text);
  }

  /**
   * Get context description for a string
   */
  private getContextDescription(str: StringLiteralInfo): string {
    switch (str.context) {
      case 'jsx-text':
        return 'JSX text content';
      case 'jsx-attribute':
        return `JSX attribute: ${str.parentContext || 'unknown'}`;
      case 'variable':
        return 'Variable assignment';
      case 'function-call':
        return `Function call: ${str.parentContext || 'unknown'}`;
      case 'template-literal':
        return 'Template literal';
      default:
        return 'Other context';
    }
  }

  /**
   * Generate suggestion for Chinese text
   */
  private generateChineseSuggestion(str: StringLiteralInfo): string {
    const key = this.suggestTranslationKey(str.value);
    return `Replace with t('${key}') and add translation: "${str.value}"`;
  }

  /**
   * Generate suggestion for English text
   */
  private generateEnglishSuggestion(str: StringLiteralInfo): string {
    const key = this.suggestTranslationKey(str.value);
    return `Replace with t('${key}') and add translations for all languages`;
  }

  /**
   * Suggest a translation key based on text
   */
  private suggestTranslationKey(text: string): string {
    // Convert to camelCase key
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30);
  }
}

// Export singleton instance
export const i18nAnalyzer = new I18nAnalyzer();
