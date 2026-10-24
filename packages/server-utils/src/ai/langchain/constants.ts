export const LANGCHAIN_INTEGRATION_NAME = 'LangChain' as const;
export const LANGCHAIN_ORIGIN = 'auto.ai.langchain';
// LangChain skips the end callbacks when a consumer abandons a stream. An evicted run's span is dropped unended,
// since ending it would send a span that lasted until eviction.
export const MAX_TRACKED_LANGCHAIN_RUNS = 1000;

export const ROLE_MAP: Record<string, string> = {
  human: 'user',
  ai: 'assistant',
  assistant: 'assistant',
  system: 'system',
  function: 'function',
  tool: 'tool',
};
