import type { ANTHROPIC_AI_INSTRUMENTED_METHODS } from './constants';

export interface AnthropicAiOptions {
  /**
   * Enable or disable input recording.
   */
  recordInputs?: boolean;
  /**
   * Enable or disable output recording.
   */
  recordOutputs?: boolean;
}

export type Message = {
  role: 'user' | 'assistant';
  content: string | unknown[];
};

export type ContentBlock = {
  type: 'tool_use' | 'server_tool_use' | string;
  text?: string;
  /** Tool name when type is tool_use */
  name?: string;
  /** Tool invocation id when type is tool_use */
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
};

// @see https://docs.anthropic.com/en/api/errors#error-shapes
export type MessageError = {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
  request_id?: string;
};

type SuccessfulResponse = {
  [key: string]: unknown; // Allow for additional unknown properties
  id: string;
  model: string;
  created?: number;
  created_at?: number; // Available for Models.retrieve
  messages?: Array<Message>;
  content?: string | Array<ContentBlock>; // Available for Messages.create
  completion?: string; // Available for Completions.create
  input_tokens?: number; // Available for Models.countTokens
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  error?: never; // This should help TypeScript infer the type correctly
};

export type AnthropicAiResponse = SuccessfulResponse | MessageError;

/**
 * Basic interface for Anthropic AI client with only the instrumented methods
 * This provides type safety while being generic enough to work with different client implementations
 */
export interface AnthropicAiClient {
  messages?: {
    create: (...args: unknown[]) => Promise<AnthropicAiResponse>;
    countTokens: (...args: unknown[]) => Promise<AnthropicAiResponse>;
  };
  models?: {
    list: (...args: unknown[]) => Promise<AnthropicAiResponse>;
    get: (...args: unknown[]) => Promise<AnthropicAiResponse>;
  };
  completions?: {
    create: (...args: unknown[]) => Promise<AnthropicAiResponse>;
  };
}

/**
 * Anthropic AI Integration interface for type safety
 */
export interface AnthropicAiIntegration {
  name: string;
  options: AnthropicAiOptions;
}

export type AnthropicAiInstrumentedMethod = (typeof ANTHROPIC_AI_INSTRUMENTED_METHODS)[number];

/**
 * Message type for Anthropic AI
 */
export type AnthropicAiMessage = {
  id: string;
  type: 'message';
  role: string;
  model: string;
  content: unknown[];
  stop_reason: string | null;
  stop_sequence: number | null;
  usage?: {
    input_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation?: unknown;
    output_tokens?: number; // Not final; do not treat as total. Use `message_delta.usage.output_tokens` for the final total.
    service_tier?: string;
  };
};

/**
 * Streaming event type for Anthropic AI
 */
export type AnthropicAiStreamingEvent = {
  type:
    | 'message_start'
    | 'message_delta'
    | 'message_stop'
    | 'content_block_start'
    | 'content_block_delta'
    | 'content_block_stop'
    | 'error';
  error?: {
    type: string;
    message: string;
  };
  index?: number;
  delta?: {
    type: unknown;
    text?: string;
    /** Present for fine-grained tool streaming */
    partial_json?: string;
    stop_reason?: string;
    stop_sequence?: number;
  };
  usage?: {
    output_tokens: number; // Final total output tokens; emitted on the last `message_delta` event
  };
  message?: AnthropicAiMessage;
  /** Present for fine-grained tool streaming */
  content_block?: ContentBlock;
};
