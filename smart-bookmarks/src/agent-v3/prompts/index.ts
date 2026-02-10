/**
 * Agent Prompts Loader
 * 
 * Dynamically loads Agent prompts based on the current language setting
 */

import type { SupportedLanguage } from '../../i18n/config';
import type { AgentPrompts } from './types';

// Re-export types
export type { AgentPrompts } from './types';

// Dynamic import functions for each language
const promptModules: Record<SupportedLanguage, () => Promise<{ default: AgentPrompts }>> = {
  'en': () => import('./en'),
  'zh-CN': () => import('./zh-CN'),
  'ja': () => import('./ja'),
  'es': () => import('./es'),
  'fr': () => import('./fr'),
  'de': () => import('./de'),
};

// Cache for loaded prompts
let cachedPrompts: AgentPrompts | null = null;
let cachedLanguage: SupportedLanguage | null = null;

/**
 * Load Agent prompts for the specified language
 * Uses caching to avoid repeated imports
 * 
 * @param language The language to load prompts for
 * @returns Promise resolving to the AgentPrompts object
 */
export async function loadPrompts(language: SupportedLanguage): Promise<AgentPrompts> {
  // Return cached prompts if available for the same language
  if (cachedPrompts && cachedLanguage === language) {
    return cachedPrompts;
  }
  
  try {
    const loader = promptModules[language];
    if (!loader) {
      console.warn(`[Prompts] No prompts found for language: ${language}, falling back to English`);
      const fallback = await promptModules['en']();
      cachedPrompts = fallback.default;
      cachedLanguage = 'en';
      return cachedPrompts;
    }
    
    const module = await loader();
    cachedPrompts = module.default;
    cachedLanguage = language;
    
    return cachedPrompts;
  } catch (error) {
    console.error(`[Prompts] Failed to load prompts for language: ${language}`, error);
    // Fall back to English on error
    const fallback = await promptModules['en']();
    cachedPrompts = fallback.default;
    cachedLanguage = 'en';
    return cachedPrompts;
  }
}

/**
 * Clear the prompts cache
 * Should be called when the user changes language
 */
export function clearPromptsCache(): void {
  cachedPrompts = null;
  cachedLanguage = null;
}

/**
 * Get the currently cached language (for testing)
 */
export function getCachedLanguage(): SupportedLanguage | null {
  return cachedLanguage;
}
