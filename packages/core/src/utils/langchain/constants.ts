export const LANGCHAIN_INTEGRATION_NAME = 'LangChain';
export const LANGCHAIN_ORIGIN = 'auto.ai.langchain';

/**
 * LangChain event types we instrument
 * Based on LangChain.js callback system
 * @see https://js.langchain.com/docs/concepts/callbacks/
 */
export const LANGCHAIN_EVENT_TYPES = {
  CHAT_MODEL_START: 'handleChatModelStart',
  LLM_START: 'handleLLMStart',
  LLM_NEW_TOKEN: 'handleLLMNewToken',
  LLM_END: 'handleLLMEnd',
  LLM_ERROR: 'handleLLMError',
  CHAIN_START: 'handleChainStart',
  CHAIN_END: 'handleChainEnd',
  CHAIN_ERROR: 'handleChainError',
  TOOL_START: 'handleToolStart',
  TOOL_END: 'handleToolEnd',
  TOOL_ERROR: 'handleToolError',
  RETRIEVER_START: 'handleRetrieverStart',
  RETRIEVER_END: 'handleRetrieverEnd',
  RETRIEVER_ERROR: 'handleRetrieverError',
} as const;
