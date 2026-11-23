import type { GenAiSpanHooks } from '../core/span-hooks';
import type { GenAiCallOptions } from '../core/utils';

/** The call that `recordInputs`/`recordOutputs` decide on, and that the span hooks get. */
export interface MistralCallInfo {
  /** The gen_ai operation of the call: `chat`, `embeddings` or `invoke_agent`. */
  operation: string;
  /** The request params, the first argument of the method (such as `chat.complete`) as passed. */
  request: Record<string, unknown> | undefined;
}

/**
 * Options for the Mistral integration. `onSpanEnd` gets the response the method resolved with, such as a chat
 * completion; for streams it is `undefined`.
 */
export type MistralOptions = GenAiCallOptions<MistralCallInfo> & GenAiSpanHooks<MistralCallInfo>;

/**
 * A tool call as it appears in a response/stream delta. During streaming the `function.arguments`
 * string arrives fragmented and is accumulated by `index`.
 */
export interface MistralToolCall {
  id?: string;
  type?: string;
  index?: number;
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * A single streaming chunk. Field names are camelCase because the SDK deserializes the snake_case
 * wire payload into typed objects before instrumentation sees them. Streaming APIs actually yield
 * `CompletionEvent` objects that wrap this under `data`.
 * @see https://docs.mistral.ai/api/#tag/chat/operation/stream_chat
 */
export interface MistralCompletionChunk {
  id: string;
  model: string;
  choices?: Array<{
    delta?: { content?: string | Array<unknown> | null; toolCalls?: MistralToolCall[] | null };
    finishReason?: string | null;
  }>;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}
