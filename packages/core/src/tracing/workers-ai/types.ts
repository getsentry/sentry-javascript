import type { AIRecordingOptions } from '../ai/utils';

export interface WorkersAiOptions extends AIRecordingOptions {
  /**
   * Enable or disable truncation of recorded input messages.
   * Defaults to `true`.
   */
  enableTruncation?: boolean;
}

/**
 * Minimal shape of the Cloudflare Workers AI binding (`env.AI`).
 * We only rely on the `run` method, everything else is passed through untouched.
 * @see https://developers.cloudflare.com/workers-ai/configuration/bindings/
 */
export interface WorkersAiClient {
  run: (model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
  [key: string]: unknown;
}

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
  response?: unknown;
  tool_calls?: unknown[];
  usage?: WorkersAiUsage;
}
