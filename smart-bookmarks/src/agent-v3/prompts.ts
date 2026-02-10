/**
 * Agent V3 - System Prompts
 * 
 * This file re-exports from the new prompts module for backward compatibility.
 * New code should import from './prompts/index' directly.
 * 
 * @deprecated Use './prompts/index' instead
 */

// Re-export everything from the new prompts module
export { loadPrompts, clearPromptsCache, getCachedLanguage } from './prompts/index';
export type { AgentPrompts } from './prompts/types';

// For backward compatibility, export the English prompts as defaults
import enPrompts from './prompts/en';

/**
 * @deprecated Use loadPrompts() instead
 */
export const REACT_SYSTEM_PROMPT = enPrompts.systemPrompt;

/**
 * @deprecated Use loadPrompts() instead
 */
export const buildContextPrefix = enPrompts.buildContextPrefix;
