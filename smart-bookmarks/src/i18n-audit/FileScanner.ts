/**
 * FileScanner - File system traversal and filtering
 * 
 * Scans directories for files matching specified patterns,
 * supporting glob-based include/exclude filtering.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ScanConfig, ScanResult } from './types';

/**
 * Checks if a string matches a glob pattern
 * Supports: *, **, ?
 */
export function matchGlob(pattern: string, filePath: string): boolean {
  // Normalize paths to use forward slashes
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');
  
  // Split pattern and path into segments
  const patternParts = normalizedPattern.split('/');
  const pathParts = normalizedPath.split('/');
  
  return matchParts(patternParts, pathParts, 0, 0);
}

/**
 * Recursively match pattern parts against path parts
 */
function matchParts(
  patternParts: string[],
  pathParts: string[],
  pi: number,
  pathi: number
): boolean {
  // Both exhausted - match!
  if (pi >= patternParts.length && pathi >= pathParts.length) {
    return true;
  }
  
  // Pattern exhausted but path remains - no match
  if (pi >= patternParts.length) {
    return false;
  }
  
  const patternPart = patternParts[pi];
  
  // Handle ** (globstar)
  if (patternPart === '**') {
    // ** at end matches everything remaining
    if (pi === patternParts.length - 1) {
      return true;
    }
    
    // Try matching ** against 0, 1, 2, ... path segments
    for (let skip = 0; skip <= pathParts.length - pathi; skip++) {
      if (matchParts(patternParts, pathParts, pi + 1, pathi + skip)) {
        return true;
      }
    }
    return false;
  }
  
  // Path exhausted but pattern remains - no match (unless remaining is **)
  if (pathi >= pathParts.length) {
    // Check if remaining pattern parts are all **
    for (let i = pi; i < patternParts.length; i++) {
      if (patternParts[i] !== '**') {
        return false;
      }
    }
    return true;
  }
  
  // Match current segment
  if (matchSegment(patternPart, pathParts[pathi])) {
    return matchParts(patternParts, pathParts, pi + 1, pathi + 1);
  }
  
  return false;
}

/**
 * Match a single path segment against a pattern segment
 * Supports * and ? wildcards
 */
function matchSegment(pattern: string, segment: string): boolean {
  // Convert pattern to regex
  let regexStr = pattern
    // Escape special regex characters except * and ?
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Handle * (match anything)
    .replace(/\*/g, '.*')
    // Handle ? (match single character)
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(segment);
}

/**
 * Checks if a file path matches any of the given patterns
 */
export function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchGlob(pattern, filePath));
}

/**
 * FileScanner class for traversing and filtering files
 */
export class FileScanner {
  /**
   * Scan directories for files matching the configuration
   */
  async scan(config: ScanConfig): Promise<ScanResult> {
    const startTime = Date.now();
    const files: string[] = [];
    let skippedCount = 0;

    for (const dir of config.includeDirs) {
      const result = await this.scanDirectory(dir, config);
      files.push(...result.files);
      skippedCount += result.skipped;
    }

    return {
      files,
      skippedCount,
      duration: Date.now() - startTime
    };
  }

  /**
   * Recursively scan a directory
   */
  private async scanDirectory(
    dirPath: string,
    config: ScanConfig
  ): Promise<{ files: string[]; skipped: number }> {
    const files: string[] = [];
    let skipped = 0;

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = fullPath.replace(/\\/g, '/');

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subResult = await this.scanDirectory(fullPath, config);
          files.push(...subResult.files);
          skipped += subResult.skipped;
        } else if (entry.isFile()) {
          // Check if file should be included
          if (this.shouldIncludeFile(relativePath, config)) {
            files.push(fullPath);
          } else {
            skipped++;
          }
        }
      }
    } catch (error) {
      // Log warning but continue scanning other directories
      console.warn(`Warning: Could not scan directory ${dirPath}:`, error);
    }

    return { files, skipped };
  }

  /**
   * Check if a file should be included based on config
   */
  private shouldIncludeFile(filePath: string, config: ScanConfig): boolean {
    // Check extension
    const ext = path.extname(filePath);
    if (!config.extensions.includes(ext)) {
      return false;
    }

    // Check exclude patterns
    if (matchesAnyPattern(filePath, config.excludePatterns)) {
      return false;
    }

    return true;
  }

  /**
   * Get all files in a directory (non-recursive)
   */
  async listFiles(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isFile())
        .map(entry => path.join(dirPath, entry.name));
    } catch {
      return [];
    }
  }

  /**
   * Check if a path exists and is a directory
   */
  async isDirectory(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if a path exists and is a file
   */
  async isFile(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const fileScanner = new FileScanner();
