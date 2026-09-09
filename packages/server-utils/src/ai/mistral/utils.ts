/* eslint-disable typescript-eslint/no-deprecated */
import type { Span, SpanAttributeValue } from '@sentry/core';
import {
  GEN_AI_REQUEST_FREQUENCY_PENALTY,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_PRESENCE_PENALTY,
  GEN_AI_REQUEST_SEED,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { GEN_AI_REQUEST_STREAM_ATTRIBUTE } from '../core/gen-ai-attributes';

/**
 * The token that follows the operation in a span name. Agents have no `model` at request time,
 * so their span is named after the invoked agent id instead.
 */
export function getModelForSpanName(params: Record<string, unknown> | undefined, operationName: string): string {
  if (operationName === 'invoke_agent') {
    return (params?.agentId as string) || 'unknown';
  }
  return (params?.model as string) || 'unknown';
}

/**
 * Turn a Mistral message content (string or content-chunk array) into a plain string.
 */
function contentToString(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(part =>
        part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : '',
      )
      .join('');
  }
  return '';
}

/**
 * Extract request parameters. Mistral request fields are camelCase.
 */
export function extractRequestParameters(params: Record<string, unknown>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  if (params.model != null) attributes[GEN_AI_REQUEST_MODEL] = params.model;
  if ('temperature' in params) attributes[GEN_AI_REQUEST_TEMPERATURE] = params.temperature;
  if ('topP' in params) attributes[GEN_AI_REQUEST_TOP_P] = params.topP;
  if ('maxTokens' in params) attributes[GEN_AI_REQUEST_MAX_TOKENS] = params.maxTokens;
  if ('frequencyPenalty' in params) attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY] = params.frequencyPenalty;
  if ('presencePenalty' in params) attributes[GEN_AI_REQUEST_PRESENCE_PENALTY] = params.presencePenalty;
  if ('randomSeed' in params) attributes[GEN_AI_REQUEST_SEED] = params.randomSeed;
  if ('stream' in params) attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] = params.stream;

  return attributes;
}

/**
 * Add response attributes to a span using duck-typing. Mistral responses are camelCase
 * (`choices[].message`, `usage.promptTokens`), matching the SDK's deserialized objects.
 */
export function addResponseAttributes(span: Span, result: unknown, recordOutputs?: boolean): void {
  if (!result || typeof result !== 'object') return;

  const response = result as Record<string, unknown>;
  const attrs: Record<string, SpanAttributeValue> = {};

  if (typeof response.id === 'string') {
    attrs[GEN_AI_RESPONSE_ID] = response.id;
  }

  if (typeof response.model === 'string') {
    attrs[GEN_AI_RESPONSE_MODEL] = response.model;
  }

  if (response.usage && typeof response.usage === 'object') {
    const usage = response.usage as Record<string, unknown>;
    if (typeof usage.promptTokens === 'number') attrs[GEN_AI_USAGE_INPUT_TOKENS] = usage.promptTokens;
    if (typeof usage.completionTokens === 'number') attrs[GEN_AI_USAGE_OUTPUT_TOKENS] = usage.completionTokens;
    if (typeof usage.totalTokens === 'number') attrs[GEN_AI_USAGE_TOTAL_TOKENS] = usage.totalTokens;
  }

  if (Array.isArray(response.choices)) {
    const choices = response.choices as Array<Record<string, unknown>>;

    const finishReasons = choices
      .map(choice => choice.finishReason)
      .filter((reason): reason is string => typeof reason === 'string');
    if (finishReasons.length > 0) {
      attrs[GEN_AI_RESPONSE_FINISH_REASONS] = JSON.stringify(finishReasons);
    }

    if (recordOutputs) {
      const responseText = choices
        .map(choice => contentToString((choice.message as Record<string, unknown> | undefined)?.content))
        .join('');
      if (responseText) {
        attrs[GEN_AI_RESPONSE_TEXT] = responseText;
      }

      const toolCalls = choices
        .map(choice => (choice.message as Record<string, unknown> | undefined)?.toolCalls)
        .filter(calls => Array.isArray(calls) && calls.length > 0)
        .flat();
      if (toolCalls.length > 0) {
        attrs[GEN_AI_RESPONSE_TOOL_CALLS] = JSON.stringify(toolCalls);
      }
    }
  }

  span.setAttributes(attrs);
}
