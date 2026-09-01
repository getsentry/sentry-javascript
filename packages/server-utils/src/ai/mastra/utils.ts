import type { SpanAttributeValue } from '@sentry/core';
import { stringify } from '@sentry/core';
import {
  ERROR_TYPE,
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PIPELINE_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_FREQUENCY_PENALTY,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_PRESENCE_PENALTY,
  GEN_AI_REQUEST_SEED,
  GEN_AI_REQUEST_STOP_SEQUENCES,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_K,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { AGENT_SPAN_TYPES, MODEL_SPAN_TYPES, SPAN_TYPE_OPS, TOOL_SPAN_TYPES } from './constants';
import type { MastraExportedSpan, MastraSpanType, MastraUsageStats } from './types';

export interface AttributeRecordingOptions {
  recordInputs: boolean;
  recordOutputs: boolean;
}

export type SpanAttributes = Record<string, SpanAttributeValue | undefined>;

export function isExportedSpanType(spanType: MastraSpanType): boolean {
  return spanType in SPAN_TYPE_OPS;
}

export function getOperation(spanType: MastraSpanType): { op: string; operationName: string } | undefined {
  return SPAN_TYPE_OPS[spanType];
}

/**
 * `{operation} {identifier}` per the gen_ai name templates. Mastra's own span name is never used.
 * https://getsentry.github.io/sentry-conventions/names/
 */
export function getSpanName(span: MastraExportedSpan): string {
  const operationName = getOperation(span.type)?.operationName ?? span.type;
  const identifier =
    MODEL_SPAN_TYPES.has(span.type) || span.type === 'rag_embedding'
      ? span.attributes?.model
      : (span.entityName ?? span.entityId);

  return identifier ? `${operationName} ${identifier}` : operationName;
}

function serialize(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return typeof value === 'string' ? value : stringify(value);
}

function positive(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

export function getUsageAttributes(usage: MastraUsageStats | undefined): SpanAttributes {
  if (!usage) {
    return {};
  }

  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;
  // Mastra only reports `totalTokens` for some providers, so derive it when both halves are known.
  const totalTokens =
    usage.totalTokens ??
    (inputTokens !== undefined || outputTokens !== undefined ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined);

  return {
    [GEN_AI_USAGE_INPUT_TOKENS]: inputTokens,
    [GEN_AI_USAGE_OUTPUT_TOKENS]: outputTokens,
    [GEN_AI_USAGE_TOTAL_TOKENS]: totalTokens,
    // Mastra reports these as 0 for providers that don't cache or reason.
    [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: positive(usage.inputDetails?.cacheRead),
    [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: positive(usage.inputDetails?.cacheWrite),
    [GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]: positive(usage.outputDetails?.reasoning),
  };
}

const USAGE_ATTRIBUTE_KEYS = [
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
] as const;

function addTokenCounts(
  left: SpanAttributeValue | undefined,
  right: SpanAttributeValue | undefined,
): number | undefined {
  const a = typeof left === 'number' ? left : undefined;
  const b = typeof right === 'number' ? right : undefined;
  if (a === undefined && b === undefined) {
    return undefined;
  }
  return (a ?? 0) + (b ?? 0);
}

/** Sum usage across generations. `setAttributes(undefined)` would drop the previous total. */
export function mergeUsageAttributes(existing: SpanAttributes, incoming: SpanAttributes): SpanAttributes {
  const merged: SpanAttributes = {};
  for (const key of USAGE_ATTRIBUTE_KEYS) {
    const value = addTokenCounts(existing[key], incoming[key]);
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

/** Convention attributes only. Called on start and end — Mastra fills fields progressively. */
export function getSpanAttributes(span: MastraExportedSpan, options: AttributeRecordingOptions): SpanAttributes {
  const operationName = getOperation(span.type)?.operationName;

  const attributes: SpanAttributes = {
    [GEN_AI_OPERATION_NAME]: operationName,
    [GEN_AI_CONVERSATION_ID]: span.attributes?.conversationId ?? span.metadata?.threadId,
  };

  if (AGENT_SPAN_TYPES.has(span.type)) {
    addAgentAttributes(attributes, span, options);
  }

  if (MODEL_SPAN_TYPES.has(span.type) || span.type === 'rag_embedding') {
    addModelAttributes(attributes, span, options);
  }

  if (TOOL_SPAN_TYPES.has(span.type)) {
    addToolAttributes(attributes, span, options);
  }

  if (span.errorInfo) {
    attributes[ERROR_TYPE] = span.errorInfo.name ?? span.errorInfo.id;
  }

  return attributes;
}

function addAgentAttributes(
  attributes: SpanAttributes,
  span: MastraExportedSpan,
  options: AttributeRecordingOptions,
): void {
  const attrs = span.attributes ?? {};
  const name = span.entityName ?? span.entityId;

  attributes[GEN_AI_AGENT_NAME] = name;
  attributes[GEN_AI_PIPELINE_NAME] = name;
  attributes[GEN_AI_TOOL_DEFINITIONS] = serialize(attrs.availableTools);

  if (options.recordInputs) {
    // `prompt` is Mastra's legacy alias for the system prompt.
    attributes[GEN_AI_SYSTEM_INSTRUCTIONS] = attrs.instructions ?? attrs.prompt;
    attributes[GEN_AI_INPUT_MESSAGES] = serialize(span.input);
  }
  if (options.recordOutputs) {
    attributes[GEN_AI_OUTPUT_MESSAGES] = serialize(span.output);
    // oxlint-disable-next-line typescript/no-deprecated -- still emitted by the other AI integrations
    attributes[GEN_AI_RESPONSE_TEXT] = responseText(span.output);
  }
}

function addModelAttributes(
  attributes: SpanAttributes,
  span: MastraExportedSpan,
  options: AttributeRecordingOptions,
): void {
  const attrs = span.attributes ?? {};
  const parameters = attrs.parameters ?? {};

  attributes[GEN_AI_REQUEST_MODEL] = attrs.model;
  attributes[GEN_AI_PROVIDER_NAME] = attrs.provider;
  attributes[GEN_AI_RESPONSE_MODEL] = attrs.responseModel;
  attributes[GEN_AI_RESPONSE_ID] = attrs.responseId;
  attributes[GEN_AI_RESPONSE_STREAMING] = attrs.streaming;
  attributes[GEN_AI_RESPONSE_FINISH_REASONS] = attrs.finishReason ? JSON.stringify([attrs.finishReason]) : undefined;
  attributes[GEN_AI_AGENT_NAME] = span.entityName;

  attributes[GEN_AI_REQUEST_TEMPERATURE] = parameters.temperature;
  attributes[GEN_AI_REQUEST_MAX_TOKENS] = parameters.maxOutputTokens;
  attributes[GEN_AI_REQUEST_TOP_P] = parameters.topP;
  attributes[GEN_AI_REQUEST_TOP_K] = parameters.topK;
  attributes[GEN_AI_REQUEST_PRESENCE_PENALTY] = parameters.presencePenalty;
  attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY] = parameters.frequencyPenalty;
  attributes[GEN_AI_REQUEST_SEED] = parameters.seed;
  attributes[GEN_AI_REQUEST_STOP_SEQUENCES] = serialize(parameters.stopSequences);

  Object.assign(attributes, getUsageAttributes(attrs.usage));

  if (options.recordInputs) {
    attributes[GEN_AI_INPUT_MESSAGES] = serialize(span.input);
  }
  if (options.recordOutputs) {
    attributes[GEN_AI_OUTPUT_MESSAGES] = serialize(span.output);
    // oxlint-disable-next-line typescript/no-deprecated -- still emitted by the other AI integrations
    attributes[GEN_AI_RESPONSE_TEXT] = responseText(span.output);
  }
}

function addToolAttributes(
  attributes: SpanAttributes,
  span: MastraExportedSpan,
  options: AttributeRecordingOptions,
): void {
  const attrs = span.attributes ?? {};

  attributes[GEN_AI_TOOL_NAME] = span.entityName ?? span.entityId;
  attributes[GEN_AI_TOOL_DESCRIPTION] = attrs.toolDescription;

  if (options.recordInputs) {
    attributes[GEN_AI_TOOL_CALL_ARGUMENTS] = serialize(span.input);
  }
  if (options.recordOutputs) {
    attributes[GEN_AI_TOOL_CALL_RESULT] = serialize(span.output);
  }
}

function responseText(output: unknown): string | undefined {
  if (typeof output === 'string') {
    return output;
  }
  if (output && typeof output === 'object' && 'text' in output && typeof output.text === 'string') {
    return output.text;
  }
  return undefined;
}
