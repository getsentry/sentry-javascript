import type { Span } from '../../types-hoist/span';
import {
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
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
  OpenAIConversationObject,
  OpenAICreateEmbeddingsObject,
  OpenAIResponseObject,
  ResponseStreamingEvent,
} from './types';

/**
 * Maps OpenAI method paths to OpenTelemetry semantic convention operation names
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/#llm-request-spans
 */
export function getOperationName(methodPath: string): string {
  if (methodPath.includes('chat.completions')) {
    return OPENAI_OPERATIONS.CHAT;
  }
  if (methodPath.includes('responses')) {
    return OPENAI_OPERATIONS.CHAT;
  }
  if (methodPath.includes('embeddings')) {
    return OPENAI_OPERATIONS.EMBEDDINGS;
  }
  if (methodPath.includes('conversations')) {
    return OPENAI_OPERATIONS.CHAT;
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
 * Check if response is an Embeddings API object
 */
export function isEmbeddingsResponse(response: unknown): response is OpenAICreateEmbeddingsObject {
  if (response === null || typeof response !== 'object' || !('object' in response)) {
    return false;
  }
  const responseObject = response as Record<string, unknown>;
  return (
    responseObject.object === 'list' &&
    typeof responseObject.model === 'string' &&
    responseObject.model.toLowerCase().includes('embedding')
  );
}

/**
 * Check if response is a Conversations API object
 * @see https://platform.openai.com/docs/api-reference/conversations
 */
export function isConversationResponse(response: unknown): response is OpenAIConversationObject {
  return (
    response !== null &&
    typeof response === 'object' &&
    'object' in response &&
    (response as Record<string, unknown>).object === 'conversation'
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
 * Add attributes for Chat Completion responses
 */
export function addChatCompletionAttributes(
  span: Span,
  response: OpenAiChatCompletionObject,
  recordOutputs?: boolean,
): void {
  setCommonResponseAttributes(span, response.id, response.model, response.created);
  if (response.usage) {
    setTokenUsageAttributes(
      span,
      response.usage.prompt_tokens,
      response.usage.completion_tokens,
      response.usage.total_tokens,
    );
  }
  if (Array.isArray(response.choices)) {
    const finishReasons = response.choices
      .map(choice => choice.finish_reason)
      .filter((reason): reason is string => reason !== null);
    if (finishReasons.length > 0) {
      span.setAttributes({
        [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify(finishReasons),
      });
    }

    // Extract tool calls from all choices (only if recordOutputs is true)
    if (recordOutputs) {
      const toolCalls = response.choices
        .map(choice => choice.message?.tool_calls)
        .filter(calls => Array.isArray(calls) && calls.length > 0)
        .flat();

      if (toolCalls.length > 0) {
        span.setAttributes({
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: JSON.stringify(toolCalls),
        });
      }
    }
  }
}

/**
 * Add attributes for Responses API responses
 */
export function addResponsesApiAttributes(span: Span, response: OpenAIResponseObject, recordOutputs?: boolean): void {
  setCommonResponseAttributes(span, response.id, response.model, response.created_at);
  if (response.status) {
    span.setAttributes({
      [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify([response.status]),
    });
  }
  if (response.usage) {
    setTokenUsageAttributes(
      span,
      response.usage.input_tokens,
      response.usage.output_tokens,
      response.usage.total_tokens,
    );
  }

  // Extract function calls from output (only if recordOutputs is true)
  if (recordOutputs) {
    const responseWithOutput = response as OpenAIResponseObject & { output?: unknown[] };
    if (Array.isArray(responseWithOutput.output) && responseWithOutput.output.length > 0) {
      // Filter for function_call type objects in the output array
      const functionCalls = responseWithOutput.output.filter(
        (item): unknown =>
          typeof item === 'object' && item !== null && (item as Record<string, unknown>).type === 'function_call',
      );

      if (functionCalls.length > 0) {
        span.setAttributes({
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: JSON.stringify(functionCalls),
        });
      }
    }
  }
}

/**
 * Add attributes for Embeddings API responses
 */
export function addEmbeddingsAttributes(span: Span, response: OpenAICreateEmbeddingsObject): void {
  span.setAttributes({
    [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: response.model,
    [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: response.model,
  });

  if (response.usage) {
    setTokenUsageAttributes(span, response.usage.prompt_tokens, undefined, response.usage.total_tokens);
  }
}

/**
 * Add attributes for Conversations API responses
 * @see https://platform.openai.com/docs/api-reference/conversations
 */
export function addConversationAttributes(span: Span, response: OpenAIConversationObject): void {
  const { id, created_at } = response;

  span.setAttributes({
    [OPENAI_RESPONSE_ID_ATTRIBUTE]: id,
    [GEN_AI_RESPONSE_ID_ATTRIBUTE]: id,
    // The conversation id is used to link messages across API calls
    [GEN_AI_CONVERSATION_ID_ATTRIBUTE]: id,
  });

  if (created_at) {
    span.setAttributes({
      [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: new Date(created_at * 1000).toISOString(),
    });
  }
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

/**
 * Extract conversation ID from request parameters
 * Supports both Conversations API and previous_response_id chaining
 * @see https://platform.openai.com/docs/guides/conversation-state
 */
function extractConversationId(params: Record<string, unknown>): string | undefined {
  // Conversations API: conversation parameter (e.g., "conv_...")
  if ('conversation' in params && typeof params.conversation === 'string') {
    return params.conversation;
  }
  // Responses chaining: previous_response_id links to parent response
  if ('previous_response_id' in params && typeof params.previous_response_id === 'string') {
    return params.previous_response_id;
  }
  return undefined;
}

/**
 * Extract request parameters including model settings and conversation context
 */
export function extractRequestParameters(params: Record<string, unknown>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: params.model ?? 'unknown',
  };

  if ('temperature' in params) attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE] = params.temperature;
  if ('top_p' in params) attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE] = params.top_p;
  if ('frequency_penalty' in params) attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE] = params.frequency_penalty;
  if ('presence_penalty' in params) attributes[GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE] = params.presence_penalty;
  if ('stream' in params) attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] = params.stream;
  if ('encoding_format' in params) attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE] = params.encoding_format;
  if ('dimensions' in params) attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE] = params.dimensions;

  // Capture conversation ID for linking messages across API calls
  const conversationId = extractConversationId(params);
  if (conversationId) {
    attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE] = conversationId;
  }

  return attributes;
}
