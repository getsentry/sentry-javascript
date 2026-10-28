export const LANGCHAIN_INTEGRATION_NAME = 'LangChain' as const;
export const LANGCHAIN_ORIGIN = 'auto.ai.langchain';
// Matches `MAX_TRACKED_FLUE_SPANS`: LangChain skips the end callbacks when a consumer abandons a stream.
export const MAX_TRACKED_LANGCHAIN_RUNS = 1000;

export const ROLE_MAP: Record<string, string> = {
  human: 'user',
  ai: 'assistant',
  assistant: 'assistant',
  system: 'system',
  function: 'function',
  tool: 'tool',
};
