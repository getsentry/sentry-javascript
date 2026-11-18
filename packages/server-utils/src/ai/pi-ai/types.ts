/**
 * Structural subsets of the `@earendil-works/pi-ai` types the instrumentation reads. The SDK does
 * not depend on the package, so only the fields used here are declared, and every one of them is
 * treated as possibly absent at runtime.
 */

import type { PiAiContext } from './messages';
import type { PiAiUsage } from './usage';

export interface PiAssistantMessage {
  role?: string;
  content?: unknown[];
  provider?: string;
  model?: string;
  responseModel?: string;
  responseId?: string;
  usage?: PiAiUsage;
  stopReason?: string;
  errorMessage?: string;
}

export interface PiModel {
  id?: string;
  provider?: string;
  baseUrl?: string;
}

export interface PiStreamOptions {
  temperature?: number;
  maxTokens?: number;
  reasoning?: string;
}

export interface PiEventStream {
  result(): Promise<PiAssistantMessage>;
  push(event: unknown): void;
}

/** What `streamDeferred` and `fetchDeferred` take in place of a context: a request the provider parked. */
export interface PiDeferredHandle {
  provider?: string;
  modelId?: string;
  api?: string;
  id?: string;
}

/** The request that `recordInputs`/`recordOutputs` decide on: the arguments of `stream`, `complete`, etc. */
export interface PiAiCallInfo {
  model: PiModel | undefined;
  /** The deferred calls pass a {@link PiDeferredHandle} here. */
  context: PiAiContext | PiDeferredHandle | undefined;
  options: PiStreamOptions | undefined;
}
