/**
 * Agent Prompts Property Tests
 * 
 * Property 5: Prompt Language Consistency
 * Property 6: Prompt Cache Invalidation
 * 
 * Validates: Requirements 2.2, 2.3, 2.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadPrompts, clearPromptsCache, getCachedLanguage } from '../index';
import type { SupportedLanguage } from '../../../i18n/config';
import { SUPPORTED_LANGUAGES } from '../../../i18n/config';

describe('Property 5: Prompt Language Consistency', () => {
  beforeEach(() => {
    clearPromptsCache();
  });

  it('should load prompts for all supported languages', async () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      clearPromptsCache();
      const prompts = await loadPrompts(lang);
      
      // All prompts should have required fields
      expect(prompts.systemPrompt).toBeDefined();
      expect(typeof prompts.systemPrompt).toBe('string');
      expect(prompts.systemPrompt.length).toBeGreaterThan(0);
    }
  });

  it('should return prompts with consistent structure across languages', async () => {
    const enPrompts = await loadPrompts('en');
    clearPromptsCache();
    const zhPrompts = await loadPrompts('zh-CN');
    
    // Both should have the same keys
    const enKeys = Object.keys(enPrompts);
    const zhKeys = Object.keys(zhPrompts);
    
    expect(enKeys.sort()).toEqual(zhKeys.sort());
  });

  it('should contain command syntax in English regardless of language', async () => {
    // Commands should remain in English for all languages
    // These are the bash-style commands used in the Agent
    const commandPatterns = [
      /\bls\b/,      // list command
      /\bcd\b/,      // change directory
      /\bmv\b/,      // move command
      /\brm\b/,      // remove command
      /\bmkdir\b/,   // make directory
      /\bfind\b/,    // find command
      /\bAction:/,   // ReAct action marker
    ];

    for (const lang of SUPPORTED_LANGUAGES) {
      clearPromptsCache();
      const prompts = await loadPrompts(lang);
      
      // At least some command patterns should be present
      const hasCommands = commandPatterns.some(pattern => 
        pattern.test(prompts.systemPrompt)
      );
      
      expect(hasCommands).toBe(true);
    }
  });
});

describe('Property 6: Prompt Cache Invalidation', () => {
  beforeEach(() => {
    clearPromptsCache();
  });

  it('should cache prompts after first load', async () => {
    expect(getCachedLanguage()).toBeNull();
    
    await loadPrompts('en');
    expect(getCachedLanguage()).toBe('en');
  });

  it('should return cached prompts for same language', async () => {
    const prompts1 = await loadPrompts('en');
    const prompts2 = await loadPrompts('en');
    
    // Should be the exact same object (cached)
    expect(prompts1).toBe(prompts2);
  });

  it('should update cache when loading different language', async () => {
    await loadPrompts('en');
    expect(getCachedLanguage()).toBe('en');
    
    await loadPrompts('zh-CN');
    expect(getCachedLanguage()).toBe('zh-CN');
  });

  it('should clear cache when clearPromptsCache is called', async () => {
    await loadPrompts('ja');
    expect(getCachedLanguage()).toBe('ja');
    
    clearPromptsCache();
    expect(getCachedLanguage()).toBeNull();
  });

  it('should reload prompts after cache clear', async () => {
    const prompts1 = await loadPrompts('en');
    clearPromptsCache();
    const prompts2 = await loadPrompts('en');
    
    // Content should be equal but not the same object
    expect(prompts1.systemPrompt).toBe(prompts2.systemPrompt);
  });
});

describe('Prompt Fallback Behavior', () => {
  beforeEach(() => {
    clearPromptsCache();
  });

  it('should fall back to English for unsupported language', async () => {
    // Force an unsupported language by casting
    const prompts = await loadPrompts('xx' as SupportedLanguage);
    
    // Should get English prompts
    expect(prompts).toBeDefined();
    expect(prompts.systemPrompt).toBeDefined();
    expect(getCachedLanguage()).toBe('en');
  });
});
