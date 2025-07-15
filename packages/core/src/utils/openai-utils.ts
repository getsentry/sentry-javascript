import { OPENAI_OPERATIONS } from './openai-attributes';
import { INSTRUMENTED_METHODS } from './openai-constants';
import type { InstrumentedMethod, OpenAiChatCompletionObject, OpenAIResponseObject } from './openai-types';

/**
 * Maps OpenAI method paths to Sentry operation names
 */
export function getOperationName(methodPath: string): string {
  if (methodPath.includes('chat.completions')) {
    return OPENAI_OPERATIONS.CHAT;
  }
  if (methodPath.includes('responses')) {
    // The responses API is also a chat operation
    return OPENAI_OPERATIONS.CHAT;
  }
  if (methodPath.includes('embeddings')) {
    return 'embeddings';
  }
  // Default to the last part of the method path
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
