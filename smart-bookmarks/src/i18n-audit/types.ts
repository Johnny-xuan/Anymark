/**
 * I18n Coverage Audit - Core Types
 * 
 * Type definitions for the internationalization coverage audit tool
 */

// ============================================================
// Configuration Types
// ============================================================

/**
 * Configuration for file scanning
 */
export interface ScanConfig {
  /** Directories to scan */
  includeDirs: string[];
  /** Glob patterns to exclude */
  excludePatterns: string[];
  /** File extensions to include */
  extensions: string[];
}

/**
 * Detection rules for i18n violations
 */
export interface DetectionRules {
  /** Pattern to match Chinese characters */
  chinesePattern: RegExp;
  /** Pattern to match English UI text */
  englishUIPattern: RegExp;
  /** Contexts to exclude from detection */
  excludedContexts: string[];
  /** Attributes to exclude from detection */
  excludedAttributes: string[];
}

/**
 * Main audit configuration
 */
export interface AuditConfig {
  /** Project root directory */
  rootDir: string;
  /** Directories to scan */
  scanDirs: string[];
  /** Locales directory path */
  localesDir: string;
  /** Patterns to exclude */
  excludePatterns: string[];
  /** Detection rules */
  rules: DetectionRules;
  /** Output format */
  outputFormat: 'console' | 'json' | 'both';
}

// ============================================================
// Scan Result Types
// ============================================================

/**
 * Result of file scanning
 */
export interface ScanResult {
  /** List of scanned file paths */
  files: string[];
  /** Number of skipped files */
  skippedCount: number;
  /** Scan duration in milliseconds */
  duration: number;
}

// ============================================================
// AST Parser Types
// ============================================================

/**
 * Information about an import statement
 */
export interface ImportInfo {
  /** Module name being imported from */
  moduleName: string;
  /** Names being imported */
  importedNames: string[];
  /** Line number in source */
  line: number;
}

/**
 * Information about a JSX attribute
 */
export interface AttributeInfo {
  /** Attribute name */
  name: string;
  /** Attribute value (if string) */
  value: string | null;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
}

/**
 * Information about a JSX element
 */
export interface JSXElementInfo {
  /** Tag name */
  tagName: string;
  /** Element attributes */
  attributes: AttributeInfo[];
  /** Text content (if any) */
  textContent: string | null;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
}

/**
 * Context where a string literal appears
 */
export type StringContext = 
  | 'jsx-text' 
  | 'jsx-attribute' 
  | 'variable' 
  | 'function-call' 
  | 'template-literal'
  | 'other';

/**
 * Information about a string literal
 */
export interface StringLiteralInfo {
  /** The string value */
  value: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Context where the string appears */
  context: StringContext;
  /** Parent context (e.g., attribute name) */
  parentContext?: string;
}

/**
 * Parsed file information
 */
export interface ParsedFile {
  /** File path */
  filePath: string;
  /** Import statements */
  imports: ImportInfo[];
  /** JSX elements */
  jsxElements: JSXElementInfo[];
  /** String literals */
  stringLiterals: StringLiteralInfo[];
  /** Whether file has parse errors */
  hasErrors: boolean;
  /** Parse error message if any */
  errorMessage?: string;
}

// ============================================================
// Analysis Types
// ============================================================

/**
 * Type of i18n violation
 */
export type ViolationType = 
  | 'missing-hook' 
  | 'hardcoded-chinese' 
  | 'hardcoded-english' 
  | 'missing-key';

/**
 * An i18n violation found during analysis
 */
export interface I18nViolation {
  /** Type of violation */
  type: ViolationType;
  /** File path */
  filePath: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Detected text */
  text: string;
  /** Context information */
  context: string;
  /** Suggested fix */
  suggestion: string;
}

/**
 * Result of analyzing a single file
 */
export interface AnalysisResult {
  /** File path */
  filePath: string;
  /** Whether file uses useTranslation hook */
  hasUseTranslation: boolean;
  /** Whether file contains UI elements */
  hasUIElements: boolean;
  /** Detected violations */
  violations: I18nViolation[];
  /** Translation keys used in this file */
  usedTranslationKeys: string[];
}

// ============================================================
// Validation Types
// ============================================================

/**
 * A loaded language file
 */
export interface LanguageFile {
  /** Language code (e.g., 'en', 'zh-CN') */
  locale: string;
  /** File path */
  filePath: string;
  /** All translation keys (flattened) */
  keys: Set<string>;
  /** Original JSON object */
  translations: Record<string, unknown>;
}

/**
 * Result of validating a single key
 */
export interface KeyValidationResult {
  /** The translation key */
  key: string;
  /** Languages where key exists */
  presentIn: string[];
  /** Languages where key is missing */
  missingIn: string[];
}

/**
 * Summary of translation validation
 */
export interface ValidationSummary {
  /** All loaded language files */
  languages: LanguageFile[];
  /** All unique translation keys */
  allKeys: Set<string>;
  /** Validation results for each key */
  keyResults: KeyValidationResult[];
  /** Completeness percentage for each language */
  completeness: Record<string, number>;
}

// ============================================================
// Report Types
// ============================================================

/**
 * Summary statistics for the report
 */
export interface ReportSummary {
  /** Total files scanned */
  totalFiles: number;
  /** Files with useTranslation hook */
  filesWithHook: number;
  /** Files without useTranslation hook */
  filesWithoutHook: number;
  /** Total violations found */
  totalViolations: number;
  /** Violations grouped by type */
  violationsByType: Record<ViolationType, number>;
  /** Overall coverage percentage */
  coveragePercentage: number;
}

/**
 * Violations grouped by category
 */
export interface ViolationsByCategory {
  /** Files missing useTranslation hook */
  missingHook: I18nViolation[];
  /** Hardcoded Chinese text */
  hardcodedChinese: I18nViolation[];
  /** Hardcoded English UI text */
  hardcodedEnglish: I18nViolation[];
  /** Missing translation keys */
  missingKeys: I18nViolation[];
}

/**
 * Complete coverage report
 */
export interface CoverageReport {
  /** Report generation timestamp */
  timestamp: string;
  /** Summary statistics */
  summary: ReportSummary;
  /** Translation completeness by language */
  translationCompleteness: Record<string, number>;
  /** Violations grouped by category */
  violationsByCategory: ViolationsByCategory;
  /** Fix recommendations */
  recommendations: string[];
}

// ============================================================
// Default Configuration
// ============================================================

/**
 * Default detection rules
 */
export const DEFAULT_DETECTION_RULES: DetectionRules = {
  // Match Chinese characters (CJK Unified Ideographs)
  chinesePattern: /[\u4e00-\u9fff\u3400-\u4dbf]/,
  // Match potential English UI text (capitalized words/phrases)
  englishUIPattern: /^[A-Z][a-z]+(\s+[A-Za-z]+)*$/,
  // Contexts to exclude
  excludedContexts: ['comment', 'console', 'import', 'type-annotation'],
  // Attributes to exclude (technical, not UI text)
  excludedAttributes: [
    'className', 'class', 'id', 'data-testid', 'data-*',
    'href', 'src', 'type', 'name', 'key', 'ref', 'style',
    'onClick', 'onChange', 'onSubmit', 'onKeyDown', 'onKeyUp',
    'role', 'tabIndex', 'autoFocus', 'disabled', 'readOnly'
  ]
};

/**
 * Default audit configuration
 */
export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  rootDir: 'smart-bookmarks/src',
  scanDirs: [
    'sidebar/components',
    'popup',
    'onboarding',
    'components'
  ],
  localesDir: 'i18n/locales',
  excludePatterns: [
    '**/*.test.tsx',
    '**/*.spec.tsx',
    '**/index.tsx',
    '**/__tests__/**'
  ],
  rules: DEFAULT_DETECTION_RULES,
  outputFormat: 'both'
};
