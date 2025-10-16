/**
 * Options for LangChain integration
 */
export interface LangChainOptions {
  /**
   * Whether to record input messages/prompts
   * @default false (respects sendDefaultPii option)
   */
  recordInputs?: boolean;

  /**
   * Whether to record output text and responses
   * @default false (respects sendDefaultPii option)
   */
  recordOutputs?: boolean;
}

/**
 * LangChain LLM/Chat Model serialized data
 */
export interface LangChainSerializedLLM {
  [key: string]: unknown;
  type?: string;
  lc?: number;
  id?: string[];
  kwargs?: {
    [key: string]: unknown;
    model?: string;
    temperature?: number;
  };
}

/**
 * LangChain message structure
 * Supports both regular messages and LangChain serialized format
 */
export interface LangChainMessage {
  [key: string]: unknown;
  // Regular message format
  type?: string;
  content?: string;
  message?: {
    content?: unknown[];
    type?: string;
  };
  role?: string;
  additional_kwargs?: Record<string, unknown>;
  // LangChain serialized format
  lc?: number;
  id?: string[];
  kwargs?: {
    [key: string]: unknown;
    content?: string;
    additional_kwargs?: Record<string, unknown>;
    response_metadata?: Record<string, unknown>;
  };
}

/**
 * LangChain LLM result structure
 */
export interface LangChainLLMResult {
  [key: string]: unknown;
  generations: Array<{
    text?: string;
    message?: LangChainMessage;
    generation_info?: {
      [key: string]: unknown;

      finish_reason?: string;
      logprobs?: unknown;
    };
  }>;
  llmOutput?: {
    [key: string]: unknown;
    tokenUsage?: {
      completionTokens?: number;
      promptTokens?: number;
      totalTokens?: number;
    };
    model_name?: string;
  };
}

/**
 * LangChain Run ID
 */
export type LangChainRunId = string;

/**
 * LangChain span context stored per run
 */
export interface LangChainSpanContext {
  spanId: string;
  traceId?: string;
  parentSpanId?: string;
  streamingBuffer?: string[];
}

/**
 * LangChain Tool structure
 */
export interface LangChainTool {
  [key: string]: unknown;
  name: string;
  description?: string;
}

/**
 * LangChain Document structure for retrievers
 */
export interface LangChainDocument {
  [key: string]: unknown;
  pageContent: string;
  metadata?: Record<string, unknown>;
}

/**
 * Integration interface for type safety
 */
export interface LangChainIntegration {
  name: string;
  options: LangChainOptions;
}
