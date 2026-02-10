/**
 * I18n Coverage Audit Tool
 * 
 * A tool for auditing internationalization coverage in React components.
 * Detects hardcoded text, missing useTranslation hooks, and validates
 * translation key completeness across all language files.
 */

// Export all types
export * from './types';

// Export modules
export { FileScanner, fileScanner, matchGlob, matchesAnyPattern } from './FileScanner';
export { ASTParser, astParser } from './ASTParser';
export { I18nAnalyzer, i18nAnalyzer } from './I18nAnalyzer';
export { TranslationValidator, translationValidator } from './TranslationValidator';
export { ReportGenerator, reportGenerator } from './ReportGenerator';

// Export main audit functions
export { auditContent, analyzeFile, formatReportConsole, formatReportJSON } from './audit';
// export { ASTParser } from './ASTParser';
// export { I18nAnalyzer } from './I18nAnalyzer';
// export { TranslationValidator } from './TranslationValidator';
// export { ReportGenerator } from './ReportGenerator';

// Main audit function (will be implemented in task 9)
// export { runAudit } from './audit';
