import type { GenAiSpanHooks } from '../core/span-hooks';
import type { GenAiCallOptions } from '../core/utils';

/**
 * The call that `recordInputs`/`recordOutputs` decide on, and that the span hooks get: a model call, or a tool
 * call of a tool runner.
 */
export type AnthropicAiCallInfo =
  | {
      operation: 'chat';
      /** The request params, the first argument of the method (such as `messages.create`) as passed. */
      request: Record<string, unknown> | undefined;
    }
  | {
      operation: 'execute_tool';
      /** The runnable tool, as passed to the tool runner. */
      tool: { name: string };
      /** The input the model called the tool with. */
      input: unknown;
    };

/**
 * Options for the Anthropic AI integration. `onSpanEnd` gets the response the method resolved with, such as a
 * `Message`, or the result of a tool call; for streams it is `undefined`.
 */
export type AnthropicAiOptions = GenAiCallOptions<AnthropicAiCallInfo> & GenAiSpanHooks<AnthropicAiCallInfo>;

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
  request_id: string;
};

type SuccessfulResponse = {
  [key: string]: unknown; // Allow for additional unknown properties
  id: string;
  model: string;
  created?: number;
  messages?: Array<Message>;
  content?: string | Array<ContentBlock>; // Available for Messages.create
  completion?: string; // Available for Completions.create
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: never; // This should help TypeScript infer the type correctly
};

export type AnthropicAiResponse = SuccessfulResponse | MessageError;

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
    // Cumulative input counts, which can be larger than at `message_start`
    input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
  message?: AnthropicAiMessage;
  /** Present for fine-grained tool streaming */
  content_block?: ContentBlock;
};
