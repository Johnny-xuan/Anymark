/**
 * ReportGenerator - Coverage report generation
 * 
 * Generates comprehensive i18n coverage reports including
 * statistics, violations, and fix recommendations.
 */

import type {
  AnalysisResult,
  ValidationSummary,
  CoverageReport,
  ReportSummary,
  ViolationsByCategory,
  I18nViolation,
  ViolationType
} from './types';

/**
 * ReportGenerator class for generating coverage reports
 */
export class ReportGenerator {
  /**
   * Generate a complete coverage report
   */
  generate(
    analysisResults: AnalysisResult[],
    validationSummary: ValidationSummary
  ): CoverageReport {
    const summary = this.generateSummary(analysisResults);
    const violationsByCategory = this.groupViolationsByCategory(analysisResults);
    const recommendations = this.generateRecommendations(analysisResults, validationSummary);

    return {
      timestamp: new Date().toISOString(),
      summary,
      translationCompleteness: validationSummary.completeness,
      violationsByCategory,
      recommendations
    };
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(results: AnalysisResult[]): ReportSummary {
    const totalFiles = results.length;
    const filesWithHook = results.filter(r => r.hasUseTranslation).length;
    const filesWithoutHook = totalFiles - filesWithHook;

    // Count violations by type
    const violationsByType: Record<ViolationType, number> = {
      'missing-hook': 0,
      'hardcoded-chinese': 0,
      'hardcoded-english': 0,
      'missing-key': 0
    };

    let totalViolations = 0;
    for (const result of results) {
      for (const violation of result.violations) {
        violationsByType[violation.type]++;
        totalViolations++;
      }
    }

    // Calculate coverage percentage
    // Files with hook and no violations are considered "covered"
    const filesWithUIElements = results.filter(r => r.hasUIElements).length;
    const coveredFiles = results.filter(
      r => r.hasUseTranslation && r.violations.length === 0
    ).length;
    
    const coveragePercentage = filesWithUIElements === 0
      ? 100
      : Math.round((coveredFiles / filesWithUIElements) * 100 * 100) / 100;

    return {
      totalFiles,
      filesWithHook,
      filesWithoutHook,
      totalViolations,
      violationsByType,
      coveragePercentage
    };
  }

  /**
   * Group violations by category
   */
  private groupViolationsByCategory(results: AnalysisResult[]): ViolationsByCategory {
    const categories: ViolationsByCategory = {
      missingHook: [],
      hardcodedChinese: [],
      hardcodedEnglish: [],
      missingKeys: []
    };

    for (const result of results) {
      for (const violation of result.violations) {
        switch (violation.type) {
          case 'missing-hook':
            categories.missingHook.push(violation);
            break;
          case 'hardcoded-chinese':
            categories.hardcodedChinese.push(violation);
            break;
          case 'hardcoded-english':
            categories.hardcodedEnglish.push(violation);
            break;
          case 'missing-key':
            categories.missingKeys.push(violation);
            break;
        }
      }
    }

    return categories;
  }

  /**
   * Generate fix recommendations
   */
  private generateRecommendations(
    results: AnalysisResult[],
    validationSummary: ValidationSummary
  ): string[] {
    const recommendations: string[] = [];

    // Check for missing hooks
    const missingHookCount = results.filter(
      r => r.hasUIElements && !r.hasUseTranslation
    ).length;
    if (missingHookCount > 0) {
      recommendations.push(
        `${missingHookCount} 个文件包含 UI 元素但未使用 useTranslation hook。` +
        `请添加 import { useTranslation } from 'react-i18next' 并使用 t() 函数。`
      );
    }

    // Check for hardcoded Chinese
    const chineseCount = results.reduce(
      (sum, r) => sum + r.violations.filter(v => v.type === 'hardcoded-chinese').length,
      0
    );
    if (chineseCount > 0) {
      recommendations.push(
        `发现 ${chineseCount} 处硬编码中文文本。` +
        `请将这些文本提取到翻译文件中，使用 t('key') 替换。`
      );
    }

    // Check for hardcoded English
    const englishCount = results.reduce(
      (sum, r) => sum + r.violations.filter(v => v.type === 'hardcoded-english').length,
      0
    );
    if (englishCount > 0) {
      recommendations.push(
        `发现 ${englishCount} 处硬编码英文 UI 文本。` +
        `请将这些文本提取到翻译文件中，确保所有语言都有对应翻译。`
      );
    }

    // Check translation completeness
    for (const [locale, completeness] of Object.entries(validationSummary.completeness)) {
      if (completeness < 100) {
        const missingCount = validationSummary.keyResults.filter(
          r => r.missingIn.includes(locale)
        ).length;
        recommendations.push(
          `${locale} 语言文件完整度为 ${completeness}%，缺少 ${missingCount} 个翻译键。`
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('🎉 恭喜！所有文件都已正确国际化，翻译完整度 100%！');
    }

    return recommendations;
  }

  /**
   * Format report for console output
   */
  formatConsole(report: CoverageReport): string {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('                    I18n 覆盖率审计报告');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');

    // Summary
    lines.push('📊 摘要统计');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push(`  总文件数: ${report.summary.totalFiles}`);
    lines.push(`  使用 useTranslation: ${report.summary.filesWithHook}`);
    lines.push(`  未使用 useTranslation: ${report.summary.filesWithoutHook}`);
    lines.push(`  总违规数: ${report.summary.totalViolations}`);
    lines.push(`  覆盖率: ${report.summary.coveragePercentage}%`);
    lines.push('');

    // Violations by type
    lines.push('📋 违规类型分布');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push(`  缺少 useTranslation: ${report.summary.violationsByType['missing-hook']}`);
    lines.push(`  硬编码中文: ${report.summary.violationsByType['hardcoded-chinese']}`);
    lines.push(`  硬编码英文: ${report.summary.violationsByType['hardcoded-english']}`);
    lines.push(`  缺少翻译键: ${report.summary.violationsByType['missing-key']}`);
    lines.push('');

    // Translation completeness
    lines.push('🌍 翻译完整度');
    lines.push('───────────────────────────────────────────────────────────────');
    for (const [locale, completeness] of Object.entries(report.translationCompleteness)) {
      const bar = this.generateProgressBar(completeness);
      lines.push(`  ${locale.padEnd(8)} ${bar} ${completeness}%`);
    }
    lines.push('');

    // Detailed violations
    if (report.summary.totalViolations > 0) {
      lines.push('⚠️  违规详情');
      lines.push('───────────────────────────────────────────────────────────────');
      
      this.formatViolationCategory(lines, '缺少 Hook', report.violationsByCategory.missingHook);
      this.formatViolationCategory(lines, '硬编码中文', report.violationsByCategory.hardcodedChinese);
      this.formatViolationCategory(lines, '硬编码英文', report.violationsByCategory.hardcodedEnglish);
      this.formatViolationCategory(lines, '缺少翻译键', report.violationsByCategory.missingKeys);
    }

    // Recommendations
    lines.push('💡 修复建议');
    lines.push('───────────────────────────────────────────────────────────────');
    for (const rec of report.recommendations) {
      lines.push(`  • ${rec}`);
    }
    lines.push('');

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`  生成时间: ${report.timestamp}`);
    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Format violations for a category
   */
  private formatViolationCategory(
    lines: string[],
    title: string,
    violations: I18nViolation[]
  ): void {
    if (violations.length === 0) return;

    lines.push(`  [${title}] (${violations.length} 处)`);
    
    // Group by file
    const byFile = new Map<string, I18nViolation[]>();
    for (const v of violations) {
      const existing = byFile.get(v.filePath) || [];
      existing.push(v);
      byFile.set(v.filePath, existing);
    }

    for (const [file, fileViolations] of byFile) {
      lines.push(`    📁 ${file}`);
      for (const v of fileViolations.slice(0, 5)) { // Limit to 5 per file
        lines.push(`       L${v.line}:${v.column} "${v.text.substring(0, 30)}${v.text.length > 30 ? '...' : ''}"`);
      }
      if (fileViolations.length > 5) {
        lines.push(`       ... 还有 ${fileViolations.length - 5} 处`);
      }
    }
    lines.push('');
  }

  /**
   * Generate a progress bar
   */
  private generateProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  /**
   * Format report as JSON
   */
  formatJSON(report: CoverageReport): string {
    return JSON.stringify(report, null, 2);
  }
}

// Export singleton instance
export const reportGenerator = new ReportGenerator();
