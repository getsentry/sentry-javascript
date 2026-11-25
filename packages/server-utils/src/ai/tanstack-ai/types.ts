/**
 * The parts of the `@tanstack/ai` 1.x chat middleware contract that we use. `@tanstack/ai` is not a
 * dependency of this package, so these mirror `ChatMiddleware`, `ChatMiddlewareContext` and
 * `ChatMiddlewareConfig`.
 */

import type { TANSTACK_AI_MIDDLEWARE_BRAND } from './constants';

/** The options of a `chat()` call. The recording options and the span hooks get this object. */
export interface TanstackAICallInfo {
  threadId?: string;
  stream?: boolean;
  outputSchema?: unknown;
  middleware?: unknown;
  [key: string]: unknown;
}

/** Mirrors `TokenUsage`. */
export interface TanstackAIUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptTokensDetails?: { cachedTokens?: number; cacheWriteTokens?: number };
  completionTokensDetails?: { reasoningTokens?: number };
}

export interface TanstackAITool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  execute?: unknown;
}

/** Mirrors `ModelMessage`. */
export interface TanstackAIModelMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null | Array<{ type: string; content?: string }>;
  toolCalls?: Array<{ id: string; function?: { name: string; arguments: string } }>;
  toolCallId?: string;
}

export type TanstackAISystemPrompt = string | { content: string };

export interface TanstackAIMiddlewareContext {
  phase: string;
  /** The adapter name, for example `openai-chat`. */
  provider: string;
  model: string;
  threadId: string;
  subagentName?: string;
  /** The metadata of the current model call. TanStack sets it when the model call starts. */
  callMetadata?: { model?: string; responseId?: string; source?: { provider?: string } };
  signal?: AbortSignal;
}

export interface TanstackAIMiddlewareConfig {
  messages: TanstackAIModelMessage[];
  /** The messages sent to the provider, when a middleware makes them different from `messages`. */
  providerMessages?: TanstackAIModelMessage[];
  systemPrompts: TanstackAISystemPrompt[];
  tools: TanstackAITool[];
  modelOptions?: Record<string, unknown>;
}

/** A stream chunk: an AG-UI event, discriminated by `type`. */
export interface TanstackAIChunk {
  type: string;
  delta?: string;
  model?: string;
  responseId?: string;
  finishReason?: string | null;
  toolCallId?: string;
  toolCallName?: string;
  input?: unknown;
  /** `{ type: 'interrupt' }` on the `RUN_FINISHED` chunk of a run that stops at an interrupt. */
  outcome?: { type: string };
  /** The error of a `RUN_ERROR` chunk. */
  error?: { message: string; code?: string };
  message?: string;
  code?: string;
}

export interface TanstackAIToolCallHookContext {
  toolName: string;
  toolCallId: string;
  args: unknown;
  tool?: TanstackAITool;
}

export interface TanstackAIAfterToolCallInfo {
  toolCallId: string;
  ok: boolean;
  result?: unknown;
  error?: unknown;
}

export interface TanstackAIChatMiddleware {
  name: string;
  [TANSTACK_AI_MIDDLEWARE_BRAND]: true;
  onConfig(ctx: TanstackAIMiddlewareContext, config: TanstackAIMiddlewareConfig): void;
  onChunk(ctx: TanstackAIMiddlewareContext, chunk: TanstackAIChunk): void;
  onInterruptBoundary(ctx: TanstackAIMiddlewareContext): void;
  onUsage(ctx: TanstackAIMiddlewareContext, usage: TanstackAIUsage): void;
  onGuardToolCall(ctx: TanstackAIMiddlewareContext, hookCtx: TanstackAIToolCallHookContext): void;
  onAfterToolCall(ctx: TanstackAIMiddlewareContext, info: TanstackAIAfterToolCallInfo): void;
  onFinish(ctx: TanstackAIMiddlewareContext): void;
  onAbort(ctx: TanstackAIMiddlewareContext): void;
  onError(ctx: TanstackAIMiddlewareContext, info: { error: unknown }): void;
}
