import type { GenAiSpanHooks } from '../core/span-hooks';
import type { GenAiCallOptions } from '../core/utils';

/**
 * The call that `recordInputs`/`recordOutputs` decide on, and that the span hooks get: the arguments of
 * `run()` as passed.
 */
export interface WorkersAiCallInfo {
  /** The gen_ai operation of the call, such as `chat` or `embeddings`. */
  operation: string;
  model: unknown;
  inputs: unknown;
  options: Record<string, unknown> | undefined;
}

/**
 * Options for the Workers AI integration. `onSpanEnd` gets the value `run()` resolved with; for streams it
 * is `undefined`.
 */
export type WorkersAiOptions = GenAiCallOptions<WorkersAiCallInfo> & GenAiSpanHooks<WorkersAiCallInfo>;

/**
 * The token usage reported by Workers AI text generation models.
 */
export interface WorkersAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * The (subset of) inputs accepted by Workers AI `run` calls that we read from.
 * @see https://developers.cloudflare.com/workers-ai/models/
 */
export interface WorkersAiInput {
  // Text generation
  prompt?: string;
  messages?: Array<{ role?: string; content?: unknown }>;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  tools?: unknown;
  functions?: unknown;
  // Text embeddings
  text?: string | string[];
}

/**
 * The (subset of) outputs returned by Workers AI text generation models that we read from.
 */
export interface WorkersAiOutput {
  id?: unknown;
  model?: unknown;
  response?: unknown;
  tool_calls?: unknown[];
  choices?: WorkersAiChoice[];
  usage?: WorkersAiUsage;
}

/**
 * The (subset of) a choice in the OpenAI chat-completion format that we read from.
 */
export interface WorkersAiChoice {
  message?: { content?: unknown; tool_calls?: unknown[] };
  finish_reason?: unknown;
}
