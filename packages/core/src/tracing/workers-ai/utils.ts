import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_REQUEST_FREQUENCY_PENALTY,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_PRESENCE_PENALTY,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_K,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_SYSTEM_INSTRUCTIONS,
} from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import type { Span, SpanAttributeValue } from '../../types/span';
import {
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { extractSystemInstructions, getTruncatedJsonString, setTokenUsageAttributes } from '../ai/utils';
import { WORKERS_AI_ORIGIN, WORKERS_AI_PROVIDER_NAME } from './constants';
import type { WorkersAiInput, WorkersAiOutput } from './types';
import { stringify } from '../../shared-exports';

/**
 * Determine the gen_ai operation name from the inputs passed to `AI.run`.
 * Workers AI exposes a single `run` method, so we infer the operation from the input shape.
 */
export function getOperationName(inputs: unknown): string {
  if (inputs && typeof inputs === 'object') {
    if ('messages' in inputs || 'prompt' in inputs) {
      return 'chat';
    }
    if ('text' in inputs) {
      return 'embeddings';
    }
  }
  return 'chat';
}

/**
 * Extract the request attributes (model, request parameters, system, origin) from a `run` call.
 */
export function extractRequestAttributes(
  model: unknown,
  inputs: unknown,
  operationName: string,
): Record<string, SpanAttributeValue> {
  const attributes: Record<string, SpanAttributeValue> = {
    [GEN_AI_PROVIDER_NAME]: WORKERS_AI_PROVIDER_NAME,
    [GEN_AI_OPERATION_NAME]: operationName,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: WORKERS_AI_ORIGIN,
    [GEN_AI_REQUEST_MODEL]: typeof model === 'string' ? model : 'unknown',
  };

  if (inputs && typeof inputs === 'object') {
    const params = inputs as WorkersAiInput;

    if (typeof params.temperature === 'number') {
      attributes[GEN_AI_REQUEST_TEMPERATURE] = params.temperature;
    }
    if (typeof params.max_tokens === 'number') {
      attributes[GEN_AI_REQUEST_MAX_TOKENS] = params.max_tokens;
    }
    if (typeof params.top_p === 'number') {
      attributes[GEN_AI_REQUEST_TOP_P] = params.top_p;
    }
    if (typeof params.top_k === 'number') {
      attributes[GEN_AI_REQUEST_TOP_K] = params.top_k;
    }
    if (typeof params.frequency_penalty === 'number') {
      attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY] = params.frequency_penalty;
    }
    if (typeof params.presence_penalty === 'number') {
      attributes[GEN_AI_REQUEST_PRESENCE_PENALTY] = params.presence_penalty;
    }
    if (params.stream === true) {
      attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] = true;
    }
  }

  return attributes;
}

/**
 * Record the request inputs (messages/prompt/embeddings input) on the span.
 * Only called when `recordInputs` is enabled.
 */
export function addRequestAttributes(
  span: Span,
  inputs: unknown,
  operationName: string,
  enableTruncation: boolean,
): void {
  if (!inputs || typeof inputs !== 'object') {
    return;
  }
  const params = inputs as WorkersAiInput;

  // Store embeddings input on a separate attribute and do not truncate it
  if (operationName === 'embeddings') {
    const text = params.text;

    if (text == null || (typeof text === 'string' && text.length === 0) || (Array.isArray(text) && text.length === 0)) {
      return;
    }

    span.setAttribute(GEN_AI_EMBEDDINGS_INPUT, typeof text === 'string' ? text : JSON.stringify(text));
    return;
  }

  const src = params.messages ?? params.prompt;

  if (src == null || (Array.isArray(src) && src.length === 0)) {
    return;
  }

  const { systemInstructions, filteredMessages } = extractSystemInstructions(src);

  if (systemInstructions) {
    span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS, systemInstructions);
  }

  span.setAttribute(
    GEN_AI_INPUT_MESSAGES,
    enableTruncation ? getTruncatedJsonString(filteredMessages) : stringify(filteredMessages),
  );

  span.setAttribute(
    GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
    Array.isArray(filteredMessages) ? filteredMessages.length : 1,
  );
}

/**
 * Record the response attributes (token usage, response text, tool calls) on the span.
 */
export function addResponseAttributes(span: Span, result: unknown, recordOutputs: boolean): void {
  if (
    !result ||
    typeof result !== 'object' ||
    // Raw `Response` objects (from `returnRawResponse`/`websocket`) cannot be introspected without consuming them.
    (typeof Response !== 'undefined' && result instanceof Response)
  ) {
    return;
  }

  const response = result as WorkersAiOutput;

  if (response.usage) {
    setTokenUsageAttributes(span, response.usage.prompt_tokens, response.usage.completion_tokens);
  }

  if (recordOutputs) {
    if (typeof response.response === 'string') {
      span.setAttribute(GEN_AI_OUTPUT_MESSAGES, response.response);
    } else if (response.response != null) {
      span.setAttribute(GEN_AI_OUTPUT_MESSAGES, JSON.stringify(response.response));
    }

    if (Array.isArray(response.tool_calls) && response.tool_calls.length > 0) {
      span.setAttribute(GEN_AI_OUTPUT_MESSAGES, JSON.stringify(response.tool_calls));
    }
  }
}
