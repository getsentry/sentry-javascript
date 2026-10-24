import type { Span } from '@sentry/core';
import { SPAN_STATUS_ERROR, startInactiveSpan, stringify } from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_COST_TOTAL_TOKENS,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { getGenAiSpanOp, getTokenUsageAttributes } from '../core/utils';
import { TANSTACK_AI_ORIGIN } from './constants';
import type {
  TanstackAiMiddlewareConfig,
  TanstackAiMiddlewareContext,
  TanstackAiModelMessage,
  TanstackAiUsage,
} from './types';

/** What the middleware tracks for one `chat()` call. */
export interface RunState {
  agentSpan: Span;
  chatSpan?: Span;
  recordInputs: boolean;
  recordOutputs: boolean;
  outputText: string;
  outputToolCalls: Array<Record<string, unknown>>;
  // `TOOL_CALL_END` carries the parsed input but not the name, which only `TOOL_CALL_START` has.
  toolCallNames: Map<string, string>;
  usage: TanstackAiUsage;
  toolCallIds: Set<string>;
}

export function startChatSpan(
  ctx: TanstackAiMiddlewareContext,
  config: TanstackAiMiddlewareConfig,
  run: RunState,
): Span {
  const attributes: Record<string, string | number | boolean | undefined> = {
    [SENTRY_ORIGIN]: TANSTACK_AI_ORIGIN,
    [GEN_AI_OPERATION_NAME]: 'chat',
    [GEN_AI_PROVIDER_NAME]: ctx.provider,
    [GEN_AI_REQUEST_MODEL]: ctx.model,
    [GEN_AI_CONVERSATION_ID]: ctx.threadId,
    [GEN_AI_RESPONSE_STREAMING]: ctx.streaming,
    ...requestAttributes(config.modelOptions),
  };

  if (config.tools.length) {
    attributes[GEN_AI_TOOL_DEFINITIONS] = stringify(
      config.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    );
  }
  if (run.recordInputs) {
    attributes[GEN_AI_INPUT_MESSAGES] = stringify(config.messages.map(toGenAiMessage));
    if (config.systemPrompts.length) {
      attributes[GEN_AI_SYSTEM_INSTRUCTIONS] = config.systemPrompts
        .map(prompt => (typeof prompt === 'string' ? prompt : prompt.content))
        .join('\n');
    }
  }

  run.outputText = '';
  run.outputToolCalls = [];
  run.toolCallNames.clear();
  return startInactiveSpan({
    name: `chat ${ctx.model}`,
    op: getGenAiSpanOp('chat'),
    parentSpan: run.agentSpan,
    attributes,
  });
}

export function endChatSpan(run: RunState, error?: unknown): void {
  const span = run.chatSpan;
  if (!span) {
    return;
  }
  run.chatSpan = undefined;
  if (error !== undefined) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
  span.end();
}

export function setOutputMessages(span: Span, run: RunState, finishReason: string | undefined): void {
  const parts = [...(run.outputText ? [{ type: 'text', content: run.outputText }] : []), ...run.outputToolCalls];
  if (parts.length) {
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, stringify([{ role: 'assistant', parts, finish_reason: finishReason }]));
  }
}

/** TanStack's `ModelMessage` in the gen_ai conventions shape (`{ role, parts }`). */
function toGenAiMessage(message: TanstackAiModelMessage): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = [];
  const { content } = message;

  if (message.role === 'tool') {
    parts.push({ type: 'tool_call_response', id: message.toolCallId, result: content });
  } else if (typeof content === 'string') {
    parts.push({ type: 'text', content });
  } else if (Array.isArray(content)) {
    for (const part of content) {
      // Media parts carry inline bytes or provider handles; keep only their kind.
      parts.push(part.type === 'text' ? { type: 'text', content: part.content } : { type: part.type });
    }
  }
  for (const toolCall of message.toolCalls ?? []) {
    parts.push({
      type: 'tool_call',
      id: toolCall.id,
      name: toolCall.function?.name,
      arguments: toolCall.function?.arguments,
    });
  }
  return { role: message.role, parts };
}

/** Sampling options live in the provider-native `modelOptions`, so accept the common spellings. */
function requestAttributes(modelOptions: Record<string, unknown> = {}): Record<string, number | undefined> {
  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = modelOptions[key];
      if (typeof value === 'number') {
        return value;
      }
    }
    return undefined;
  };
  return {
    [GEN_AI_REQUEST_TEMPERATURE]: pick('temperature'),
    [GEN_AI_REQUEST_TOP_P]: pick('top_p', 'topP'),
    [GEN_AI_REQUEST_MAX_TOKENS]: pick('max_tokens', 'maxTokens', 'max_output_tokens', 'maxOutputTokens'),
  };
}

export function usageAttributes(usage: TanstackAiUsage): Record<string, number> {
  const attributes = getTokenUsageAttributes(
    usage.promptTokens,
    usage.completionTokens,
    usage.promptTokensDetails?.cacheWriteTokens,
    usage.promptTokensDetails?.cachedTokens,
    usage.totalTokens,
  );
  if (typeof usage.completionTokensDetails?.reasoningTokens === 'number') {
    attributes[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS] = usage.completionTokensDetails.reasoningTokens;
  }
  // The provider's own figure (e.g. OpenRouter) includes cache discounts and gateway markup that a
  // price table cannot reproduce.
  if (typeof usage.cost === 'number') {
    attributes[GEN_AI_COST_TOTAL_TOKENS] = usage.cost;
  }
  return attributes;
}

export function addUsage(total: TanstackAiUsage, usage: TanstackAiUsage): TanstackAiUsage {
  const add = (a: number | undefined, b: number | undefined): number | undefined =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
  return {
    promptTokens: add(total.promptTokens, usage.promptTokens),
    completionTokens: add(total.completionTokens, usage.completionTokens),
    totalTokens: add(total.totalTokens, usage.totalTokens),
    cost: add(total.cost, usage.cost),
    promptTokensDetails: {
      cachedTokens: add(total.promptTokensDetails?.cachedTokens, usage.promptTokensDetails?.cachedTokens),
      cacheWriteTokens: add(total.promptTokensDetails?.cacheWriteTokens, usage.promptTokensDetails?.cacheWriteTokens),
    },
    completionTokensDetails: {
      reasoningTokens: add(
        total.completionTokensDetails?.reasoningTokens,
        usage.completionTokensDetails?.reasoningTokens,
      ),
    },
  };
}
