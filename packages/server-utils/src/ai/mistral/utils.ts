/* eslint-disable typescript-eslint/no-deprecated */
import type { Span, SpanAttributeValue } from '@sentry/core';
import type { GenAiOutputMessage } from '../core/utils';
import { setOutputMessagesAttribute } from '../core/utils';
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

/**
 * Turn a Mistral message content (string or content-chunk array) into a plain string.
 */
export function contentToString(content: unknown): string {
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
 * Build the span name for an instrumented Mistral call. Agent ids and a missing model are left out
 * to keep the name low cardinality.
 */
export function getSpanName(operationName: string, attributes: Record<string, unknown>): string {
  const model = attributes[GEN_AI_REQUEST_MODEL];

  if (operationName === 'invoke_agent' || typeof model !== 'string') {
    return operationName;
  }

  return `${operationName} ${model}`;
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

  let outputMessages: GenAiOutputMessage[] = [];

  if (Array.isArray(response.choices)) {
    const choices = response.choices as Array<Record<string, unknown>>;

    const finishReasons = choices
      .map(choice => choice.finishReason)
      .filter((reason): reason is string => typeof reason === 'string');
    if (finishReasons.length > 0) {
      attrs[GEN_AI_RESPONSE_FINISH_REASONS] = JSON.stringify(finishReasons);
    }

    if (recordOutputs) {
      // One entry per choice: Mistral can return several when `n` > 1, and both attributes are
      // specified as arrays of messages rather than one merged blob.
      outputMessages = choices.map(choice => {
        const message = choice.message as Record<string, unknown> | undefined;
        return {
          responseText: contentToString(message?.content),
          toolCalls: Array.isArray(message?.toolCalls) ? message.toolCalls : undefined,
          finishReason: typeof choice.finishReason === 'string' ? choice.finishReason : undefined,
        };
      });

      const responseTexts = outputMessages.map(message => message.responseText).filter(Boolean);
      if (responseTexts.length > 0) {
        attrs[GEN_AI_RESPONSE_TEXT] = JSON.stringify(responseTexts);
      }

      const toolCalls = outputMessages.flatMap(message => message.toolCalls ?? []);
      if (toolCalls.length > 0) {
        attrs[GEN_AI_RESPONSE_TOOL_CALLS] = JSON.stringify(toolCalls);
      }
    }
  }

  span.setAttributes(attrs);

  if (recordOutputs) {
    setOutputMessagesAttribute(span, outputMessages);
  }
}
