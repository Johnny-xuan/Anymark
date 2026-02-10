#!/usr/bin/env npx ts-node
/**
 * I18n Audit CLI Script
 * 
 * Run with: npx ts-node scripts/i18n-audit.ts
 * Or add to package.json scripts: "i18n-audit": "ts-node scripts/i18n-audit.ts"
 */

import * as fs from 'fs';
import * as path from 'path';
import { FileScanner } from '../src/i18n-audit/FileScanner';
import { ASTParser } from '../src/i18n-audit/ASTParser';
import { I18nAnalyzer } from '../src/i18n-audit/I18nAnalyzer';
import { TranslationValidator } from '../src/i18n-audit/TranslationValidator';
import { ReportGenerator } from '../src/i18n-audit/ReportGenerator';
import type { AuditConfig, AnalysisResult } from '../src/i18n-audit/types';
import { DEFAULT_AUDIT_CONFIG } from '../src/i18n-audit/types';

async function main() {
  const config: AuditConfig = {
    ...DEFAULT_AUDIT_CONFIG,
    rootDir: 'src',
    scanDirs: [
      'sidebar/components',
      'popup',
      'onboarding',
      'components'
    ],
    localesDir: 'i18n/locales',
    outputFormat: 'both'
  };

  const scanner = new FileScanner();
  const parser = new ASTParser();
  const analyzer = new I18nAnalyzer(config.rules);
  const validator = new TranslationValidator();
  const reporter = new ReportGenerator();

  console.log('🔍 开始 I18n 覆盖率审计...\n');

  // Step 1: Scan files
  console.log('📁 扫描文件...');
  const scanConfig = {
    includeDirs: config.scanDirs.map(dir => path.join(config.rootDir, dir)),
    excludePatterns: config.excludePatterns,
    extensions: ['.tsx', '.ts', '.jsx', '.js']
  };

  const scanResult = await scanner.scan(scanConfig);
  console.log(`   找到 ${scanResult.files.length} 个文件，跳过 ${scanResult.skippedCount} 个`);

  // Step 2 & 3: Parse and analyze each file
  console.log('\n📊 分析文件...');
  const analysisResults: AnalysisResult[] = [];

  for (const filePath of scanResult.files) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = parser.parseContent(filePath, content);
      const result = analyzer.analyze(parsed);
      analysisResults.push(result);
    } catch (error) {
      console.warn(`   ⚠️ 无法分析文件: ${filePath}`);
    }
  }
  console.log(`   分析完成 ${analysisResults.length} 个文件`);

  // Step 4: Load and validate translation files
  console.log('\n🌍 验证翻译文件...');
  const localesPath = path.join(config.rootDir, config.localesDir);
  const languageData = await loadLanguageFiles(localesPath);
  const languages = validator.loadLanguageFiles(languageData);
  
  const usedKeys = analysisResults.flatMap(r => r.usedTranslationKeys);
  const validationSummary = validator.validateKeys(usedKeys, languages);
  console.log(`   加载 ${languages.length} 个语言文件`);

  // Step 5: Generate report
  console.log('\n📝 生成报告...\n');
  const report = reporter.generate(analysisResults, validationSummary);

  // Output report
  console.log(reporter.formatConsole(report));

  // Save JSON report
  const jsonPath = 'i18n-audit-report.json';
  await fs.promises.writeFile(jsonPath, reporter.formatJSON(report), 'utf-8');
  console.log(`\n📄 JSON 报告已保存到: ${jsonPath}`);

  // Exit with error code if there are violations
  if (report.summary.totalViolations > 0) {
    process.exit(1);
  }
}

async function loadLanguageFiles(
  localesDir: string
): Promise<Array<{ locale: string; filePath: string; data: Record<string, unknown> }>> {
  const result: Array<{ locale: string; filePath: string; data: Record<string, unknown> }> = [];

  try {
    const files = await fs.promises.readdir(localesDir);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(localesDir, file);
        const locale = file.replace('.json', '');
        
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          result.push({ locale, filePath, data });
        } catch (error) {
          console.warn(`   ⚠️ 无法加载语言文件: ${filePath}`);
        }
      }
    }
  } catch (error) {
    console.warn(`   ⚠️ 无法读取语言目录: ${localesDir}`);
  }

  return result;
}

main().catch(console.error);
