/**
 * Agent Prompts Type Definitions
 */

/**
 * Interface for Agent prompts in each language
 */
export interface AgentPrompts {
  /** The system prompt that defines the Agent's behavior (ReAct mode) */
  systemPrompt: string;
  /** The system prompt for Function Calling mode (shorter, no ReAct format rules) */
  systemPromptFC: string;
  /** Function to build context prefix with current working directory */
  buildContextPrefix: (cwd: string) => string;
}
