import { stringify } from '@sentry/core';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
} from '@sentry/conventions/attributes';
import { getTokenUsageAttributes } from '../core/utils';
import type {
  TanstackAIMiddlewareContext,
  TanstackAIModelMessage,
  TanstackAISystemPrompt,
  TanstackAIUsage,
} from './types';

/**
 * `ctx.provider` is the adapter name, which for some adapters also names the API (for example
 * `openrouter-responses`). The call metadata has the provider of the adapter, but only after the
 * first model call started.
 */
export function getProviderName(ctx: TanstackAIMiddlewareContext): string {
  return ctx.callMetadata?.source?.provider ?? ctx.provider;
}

export function getInputAttributes(
  messages: ReadonlyArray<TanstackAIModelMessage>,
  systemPrompts: ReadonlyArray<TanstackAISystemPrompt>,
): Record<string, string | undefined> {
  return {
    [GEN_AI_INPUT_MESSAGES]: stringify(messages.map(toGenAiMessage)),
    [GEN_AI_SYSTEM_INSTRUCTIONS]: systemPrompts.length
      ? stringify(
          systemPrompts.map(prompt => ({
            type: 'text',
            content: typeof prompt === 'string' ? prompt : prompt.content,
          })),
        )
      : undefined,
  };
}

/**
 * TanStack AI has no common option for temperature, top p or max tokens. Each adapter takes them in
 * `modelOptions` and passes them to the provider with the provider's key name (snake_case or camelCase,
 * and `max_tokens` or `max_output_tokens`). So we take the first of the known keys that has a value.
 */
export function getRequestAttributes(modelOptions: Record<string, unknown> = {}): Record<string, number | undefined> {
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

export function getUsageAttributes(usage: TanstackAIUsage): Record<string, number> {
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
  return attributes;
}

function toGenAiMessage(message: TanstackAIModelMessage): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = [];
  const { content } = message;

  if (message.role === 'tool') {
    parts.push({ type: 'tool_call_response', id: message.toolCallId, result: content });
  } else if (typeof content === 'string') {
    parts.push({ type: 'text', content });
  } else if (Array.isArray(content)) {
    for (const part of content) {
      // Media parts carry inline data or provider handles, so keep only their type.
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
