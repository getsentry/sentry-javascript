/**
 * Structural types for the subset of the `@tanstack/ai` chat middleware contract we consume.
 *
 * Declared locally rather than imported: `@tanstack/ai` is ESM-only and not a dependency of this
 * package. Mirrors `ChatMiddleware`, `ChatMiddlewareContext` and `ChatMiddlewareConfig` as of
 * `@tanstack/ai` 1.x.
 */

import type { TANSTACK_AI_MIDDLEWARE_BRAND } from './constants';

export type TanstackAiFetch = (input: unknown, init?: unknown) => Promise<unknown>;

/** Mirrors `TokenUsage` from `@tanstack/ai-event-client`. */
export interface TanstackAiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  promptTokensDetails?: { cachedTokens?: number; cacheWriteTokens?: number };
  completionTokensDetails?: { reasoningTokens?: number };
}

export interface TanstackAiTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  execute?: (args: unknown, context?: { toolCallId?: string }) => unknown;
}

export interface TanstackAiMiddlewareContext {
  activity: string;
  phase: string;
  provider: string;
  model: string;
  threadId: string;
  streaming: boolean;
  subagentName?: string;
}

/** Mirrors `ModelMessage`. */
export interface TanstackAiModelMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null | Array<{ type: string; content?: string }>;
  toolCalls?: Array<{ id: string; function?: { name: string; arguments: string } }>;
  toolCallId?: string;
}

export interface TanstackAiMiddlewareConfig {
  messages: TanstackAiModelMessage[];
  systemPrompts: Array<string | { content: string }>;
  tools: TanstackAiTool[];
  modelOptions?: Record<string, unknown>;
  wrapFetch?: (next: TanstackAiFetch) => TanstackAiFetch;
}

/** A stream chunk: an AG-UI event discriminated by `type`. */
export interface TanstackAiChunk {
  type: string;
  delta?: string;
  model?: string;
  finishReason?: string | null;
  toolCallId?: string;
  toolCallName?: string;
  input?: unknown;
}

export interface TanstackAiToolCallHookContext {
  toolName: string;
  toolCallId: string;
  args: unknown;
  tool?: TanstackAiTool;
}

export interface TanstackAiAfterToolCallInfo {
  toolCallId: string;
  ok: boolean;
  result?: unknown;
  error?: unknown;
}

export interface TanstackAiChatMiddleware {
  name: string;
  [TANSTACK_AI_MIDDLEWARE_BRAND]: true;
  onConfig(
    ctx: TanstackAiMiddlewareContext,
    config: TanstackAiMiddlewareConfig,
  ): Partial<TanstackAiMiddlewareConfig> | undefined;
  onStart(ctx: TanstackAiMiddlewareContext): void;
  onChunk(ctx: TanstackAiMiddlewareContext, chunk: TanstackAiChunk): void;
  onUsage(ctx: TanstackAiMiddlewareContext, usage: TanstackAiUsage): void;
  onBeforeToolCall(ctx: TanstackAiMiddlewareContext, hookCtx: TanstackAiToolCallHookContext): void;
  onAfterToolCall(ctx: TanstackAiMiddlewareContext, info: TanstackAiAfterToolCallInfo): void;
  onFinish(ctx: TanstackAiMiddlewareContext): void;
  onAbort(ctx: TanstackAiMiddlewareContext): void;
  onError(ctx: TanstackAiMiddlewareContext, info: { error: unknown }): void;
}
