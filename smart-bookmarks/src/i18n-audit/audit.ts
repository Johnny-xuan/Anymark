/**
 * I18n Audit - Main entry point
 * 
 * Provides audit functions for both browser and Node.js environments.
 */

import { ASTParser } from './ASTParser';
import { I18nAnalyzer } from './I18nAnalyzer';
import { TranslationValidator } from './TranslationValidator';
import { ReportGenerator } from './ReportGenerator';
import type { AuditConfig, CoverageReport, AnalysisResult } from './types';
import { DEFAULT_AUDIT_CONFIG } from './types';

/**
 * Quick audit function for browser environment
 * Accepts pre-loaded file contents
 */
export function auditContent(
  files: Array<{ path: string; content: string }>,
  languageFiles: Array<{ locale: string; data: Record<string, unknown> }>,
  config: Partial<AuditConfig> = {}
): CoverageReport {
  const fullConfig: AuditConfig = { ...DEFAULT_AUDIT_CONFIG, ...config };
  
  const parser = new ASTParser();
  const analyzer = new I18nAnalyzer(fullConfig.rules);
  const validator = new TranslationValidator();
  const reporter = new ReportGenerator();

  // Parse and analyze files
  const analysisResults: AnalysisResult[] = [];
  for (const file of files) {
    const parsed = parser.parseContent(file.path, file.content);
    const result = analyzer.analyze(parsed);
    analysisResults.push(result);
  }

  // Validate translations
  const languages = validator.loadLanguageFiles(
    languageFiles.map(lf => ({
      locale: lf.locale,
      filePath: `${lf.locale}.json`,
      data: lf.data
    }))
  );
  
  const usedKeys = analysisResults.flatMap(r => r.usedTranslationKeys);
  const validationSummary = validator.validateKeys(usedKeys, languages);

  // Generate report
  return reporter.generate(analysisResults, validationSummary);
}

/**
 * Analyze a single file content
 */
export function analyzeFile(
  filePath: string,
  content: string,
  config: Partial<AuditConfig> = {}
): AnalysisResult {
  const fullConfig: AuditConfig = { ...DEFAULT_AUDIT_CONFIG, ...config };
  
  const parser = new ASTParser();
  const analyzer = new I18nAnalyzer(fullConfig.rules);

  const parsed = parser.parseContent(filePath, content);
  return analyzer.analyze(parsed);
}

/**
 * Format a report for console output
 */
export function formatReportConsole(report: CoverageReport): string {
  const reporter = new ReportGenerator();
  return reporter.formatConsole(report);
}

/**
 * Format a report as JSON
 */
export function formatReportJSON(report: CoverageReport): string {
  const reporter = new ReportGenerator();
  return reporter.formatJSON(report);
}
