import type { Span } from '../../types-hoist/span';
import {
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
  OPENAI_OPERATIONS,
  OPENAI_RESPONSE_ID_ATTRIBUTE,
  OPENAI_RESPONSE_MODEL_ATTRIBUTE,
  OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { INSTRUMENTED_METHODS } from './constants';
import type {
  ChatCompletionChunk,
  InstrumentedMethod,
  OpenAiChatCompletionObject,
  OpenAIResponseObject,
  ResponseStreamingEvent,
} from './types';

/**
 * Maps OpenAI method paths to Sentry operation names
 */
export function getOperationName(methodPath: string): string {
  if (methodPath.includes('chat.completions')) {
    return OPENAI_OPERATIONS.CHAT;
  }
  if (methodPath.includes('responses')) {
    return OPENAI_OPERATIONS.RESPONSES;
  }
  if (methodPath.includes('embeddings')) {
    return OPENAI_OPERATIONS.EMBEDDINGS;
  }
  return methodPath.split('.').pop() || 'unknown';
}

/**
 * Get the span operation for OpenAI methods
 * Following Sentry's convention: "gen_ai.{operation_name}"
 */
export function getSpanOperation(methodPath: string): string {
  return `gen_ai.${getOperationName(methodPath)}`;
}

/**
 * Check if a method path should be instrumented
 */
export function shouldInstrument(methodPath: string): methodPath is InstrumentedMethod {
  return INSTRUMENTED_METHODS.includes(methodPath as InstrumentedMethod);
}

/**
 * Build method path from current traversal
 */
export function buildMethodPath(currentPath: string, prop: string): string {
  return currentPath ? `${currentPath}.${prop}` : prop;
}

/**
 * Check if response is a Chat Completion object
 */
export function isChatCompletionResponse(response: unknown): response is OpenAiChatCompletionObject {
  return (
    response !== null &&
    typeof response === 'object' &&
    'object' in response &&
    (response as Record<string, unknown>).object === 'chat.completion'
  );
}

/**
 * Check if response is a Responses API object
 */
export function isResponsesApiResponse(response: unknown): response is OpenAIResponseObject {
  return (
    response !== null &&
    typeof response === 'object' &&
    'object' in response &&
    (response as Record<string, unknown>).object === 'response'
  );
}

/**
 * Check if streaming event is from the Responses API
 */
export function isResponsesApiStreamEvent(event: unknown): event is ResponseStreamingEvent {
  return (
    event !== null &&
    typeof event === 'object' &&
    'type' in event &&
    typeof (event as Record<string, unknown>).type === 'string' &&
    ((event as Record<string, unknown>).type as string).startsWith('response.')
  );
}

/**
 * Check if streaming event is a chat completion chunk
 */
export function isChatCompletionChunk(event: unknown): event is ChatCompletionChunk {
  return (
    event !== null &&
    typeof event === 'object' &&
    'object' in event &&
    (event as Record<string, unknown>).object === 'chat.completion.chunk'
  );
}

/**
 * Set token usage attributes
 * @param span - The span to add attributes to
 * @param promptTokens - The number of prompt tokens
 * @param completionTokens - The number of completion tokens
 * @param totalTokens - The number of total tokens
 */
export function setTokenUsageAttributes(
  span: Span,
  promptTokens?: number,
  completionTokens?: number,
  totalTokens?: number,
): void {
  if (promptTokens !== undefined) {
    span.setAttributes({
      [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: promptTokens,
      [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: promptTokens,
    });
  }
  if (completionTokens !== undefined) {
    span.setAttributes({
      [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: completionTokens,
      [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: completionTokens,
    });
  }
  if (totalTokens !== undefined) {
    span.setAttributes({
      [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: totalTokens,
    });
  }
}

/**
 * Set common response attributes
 * @param span - The span to add attributes to
 * @param id - The response id
 * @param model - The response model
 * @param timestamp - The response timestamp
 */
export function setCommonResponseAttributes(span: Span, id: string, model: string, timestamp: number): void {
  span.setAttributes({
    [OPENAI_RESPONSE_ID_ATTRIBUTE]: id,
    [GEN_AI_RESPONSE_ID_ATTRIBUTE]: id,
  });
  span.setAttributes({
    [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: model,
    [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: model,
  });
  span.setAttributes({
    [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: new Date(timestamp * 1000).toISOString(),
  });
}
