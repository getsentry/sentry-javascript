import type { GenAiOptions } from '../core/utils';

/** Options for the Mistral integration. */
export type MistralOptions = GenAiOptions;

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
