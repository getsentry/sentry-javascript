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
 * LangChain Serialized type (compatible with @langchain/core)
 * Uses general types to be compatible with LangChain's Serialized interface.
 * This is a flexible interface that accepts any serialized LangChain object.
 */
export interface LangChainSerialized {
  [key: string]: unknown;
  lc?: number;
  type?: string;
  id?: string[];
  name?: string;
  graph?: Record<string, unknown>;
  kwargs?: Record<string, unknown>;
}

/**
 * LangChain message structure
 * Supports both regular messages and LangChain serialized format
 */
export interface LangChainMessage {
  [key: string]: unknown;
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
  id?: string[] | string;
  response_metadata?: {
    model_name?: string;
    finish_reason?: string;
  };
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
  generations: Array<
    Array<{
      text?: string;
      message?: LangChainMessage;
      generation_info?: {
        [key: string]: unknown;

        finish_reason?: string;
        logprobs?: unknown;
      };
      // v1+ uses generationInfo instead of generation_info
      generationInfo?: {
        [key: string]: unknown;
        finish_reason?: string;
        logprobs?: unknown;
      };
    }>
  >;
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
 * Integration interface for type safety
 */
export interface LangChainIntegration {
  name: string;
  options: LangChainOptions;
}

/**
 * LangChain callback handler interface
 * Compatible with both BaseCallbackHandlerMethodsClass and BaseCallbackHandler from @langchain/core
 * Uses general types and index signature for maximum compatibility across LangChain versions
 */
export interface LangChainCallbackHandler {
  // Allow any additional properties for full compatibility
  [key: string]: unknown;

  // LangChain BaseCallbackHandler class properties (matching the class interface exactly)
  lc_serializable: boolean;
  lc_namespace: ['langchain_core', 'callbacks', string];
  lc_secrets: { [key: string]: string } | undefined;
  lc_attributes: { [key: string]: string } | undefined;
  lc_aliases: { [key: string]: string } | undefined;
  lc_serializable_keys: string[] | undefined;
  lc_id: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lc_kwargs: { [key: string]: any };
  name: string;

  // BaseCallbackHandlerInput properties (required boolean flags)
  ignoreLLM: boolean;
  ignoreChain: boolean;
  ignoreAgent: boolean;
  ignoreRetriever: boolean;
  ignoreCustomEvent: boolean;
  raiseError: boolean;
  awaitHandlers: boolean;

  // Callback handler methods (properties with function signatures)
  // Using 'any' for parameters and return types to match LangChain's BaseCallbackHandler exactly
  handleLLMStart?: (
    llm: unknown,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ) => Promise<unknown> | unknown;
  handleChatModelStart?: (
    llm: unknown,
    messages: unknown,
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ) => Promise<unknown> | unknown;
  handleLLMNewToken?: (
    token: string,
    idx: unknown,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    fields?: unknown,
  ) => Promise<unknown> | unknown;
  handleLLMEnd?: (
    output: unknown,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    extraParams?: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
  handleLLMError?: (
    error: Error,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    extraParams?: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
  handleChainStart?: (
    chain: { name?: string },
    inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runType?: string,
    runName?: string,
  ) => Promise<unknown> | unknown;
  handleChainEnd?: (
    outputs: unknown,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    kwargs?: { inputs?: Record<string, unknown> },
  ) => Promise<unknown> | unknown;
  handleChainError?: (
    error: Error,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    kwargs?: { inputs?: Record<string, unknown> },
  ) => Promise<unknown> | unknown;
  handleToolStart?: (
    tool: { name?: string },
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ) => Promise<unknown> | unknown;
  handleToolEnd?: (output: unknown, runId: string, parentRunId?: string, tags?: string[]) => Promise<unknown> | unknown;
  handleToolError?: (error: Error, runId: string, parentRunId?: string, tags?: string[]) => Promise<unknown> | unknown;

  // LangChain class methods (required for BaseCallbackHandler compatibility)
  copy(): unknown;
  toJSON(): Record<string, unknown>;
  toJSONNotImplemented(): unknown;
}
