// `@sentry/conventions` marks several gen_ai attributes (e.g. `GEN_AI_SYSTEM`, `GEN_AI_PROMPT`,
// `GEN_AI_REQUEST_AVAILABLE_TOOLS`, `GEN_AI_TOOL_*`) as deprecated in favour of newer semconv names. We
// intentionally keep emitting the current names so these spans match what the Sentry product consumes
// today; migrating to the new names is a separate, coordinated change.
/* eslint-disable typescript-eslint/no-deprecated */
import type { Span } from '../../types/span';
import type { SpanAttributeValue } from '../../types/span';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_REQUEST_FREQUENCY_PENALTY,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_PRESENCE_PENALTY,
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
import {
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import type { ChatCompletionChunk, ResponseStreamingEvent } from './types';

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
 * Add response attributes to a span using duck-typing.
 * Works for Chat Completions, Responses API, Embeddings, and Conversations API responses.
 */
export function addResponseAttributes(span: Span, result: unknown, recordOutputs?: boolean): void {
  if (!result || typeof result !== 'object') return;

  const response = result as Record<string, unknown>;
  const attrs: Record<string, SpanAttributeValue> = {};

  // Response ID
  if (typeof response.id === 'string') {
    attrs[GEN_AI_RESPONSE_ID] = response.id;
  }

  // Response model
  if (typeof response.model === 'string') {
    attrs[GEN_AI_RESPONSE_MODEL] = response.model;
  }

  // Conversation ID (conversation objects use id as conversation link)
  if (response.object === 'conversation' && typeof response.id === 'string') {
    attrs[GEN_AI_CONVERSATION_ID] = response.id;
  }

  // Token usage — supports both naming conventions (chat: prompt_tokens/completion_tokens, responses: input_tokens/output_tokens)
  if (response.usage && typeof response.usage === 'object') {
    const usage = response.usage as Record<string, unknown>;

    const inputTokens = usage.prompt_tokens ?? usage.input_tokens;
    if (typeof inputTokens === 'number') {
      attrs[GEN_AI_USAGE_INPUT_TOKENS] = inputTokens;
    }

    const outputTokens = usage.completion_tokens ?? usage.output_tokens;
    if (typeof outputTokens === 'number') {
      attrs[GEN_AI_USAGE_OUTPUT_TOKENS] = outputTokens;
    }

    if (typeof usage.total_tokens === 'number') {
      attrs[GEN_AI_USAGE_TOTAL_TOKENS] = usage.total_tokens;
    }
  }

  // Finish reasons from choices (chat completions)
  if (Array.isArray(response.choices)) {
    const choices = response.choices as Array<Record<string, unknown>>;
    const finishReasons = choices
      .map(choice => choice.finish_reason)
      .filter((reason): reason is string => typeof reason === 'string');
    if (finishReasons.length > 0) {
      attrs[GEN_AI_RESPONSE_FINISH_REASONS] = JSON.stringify(finishReasons);
    }

    if (recordOutputs) {
      // Response text from choices
      const responseTexts = choices.map(choice => {
        const message = choice.message as Record<string, unknown> | undefined;
        return (message?.content as string) || '';
      });
      attrs[GEN_AI_RESPONSE_TEXT] = JSON.stringify(responseTexts);

      // Tool calls from choices
      const toolCalls = choices
        .map(choice => {
          const message = choice.message as Record<string, unknown> | undefined;
          return message?.tool_calls;
        })
        .filter(calls => Array.isArray(calls) && calls.length > 0)
        .flat();

      if (toolCalls.length > 0) {
        attrs[GEN_AI_RESPONSE_TOOL_CALLS] = JSON.stringify(toolCalls);
      }
    }
  }

  // Finish reason from status (responses API)
  if (typeof response.status === 'string') {
    // Only set if not already set from choices
    if (!attrs[GEN_AI_RESPONSE_FINISH_REASONS]) {
      attrs[GEN_AI_RESPONSE_FINISH_REASONS] = JSON.stringify([response.status]);
    }
  }

  if (recordOutputs) {
    // Response text from output_text (responses API)
    if (typeof response.output_text === 'string' && !attrs[GEN_AI_RESPONSE_TEXT]) {
      attrs[GEN_AI_RESPONSE_TEXT] = response.output_text;
    }

    // Tool calls from output array (responses API)
    if (Array.isArray(response.output) && response.output.length > 0 && !attrs[GEN_AI_RESPONSE_TOOL_CALLS]) {
      const functionCalls = (response.output as Array<Record<string, unknown>>).filter(
        item => item?.type === 'function_call',
      );
      if (functionCalls.length > 0) {
        attrs[GEN_AI_RESPONSE_TOOL_CALLS] = JSON.stringify(functionCalls);
      }
    }
  }

  span.setAttributes(attrs);
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
    [GEN_AI_REQUEST_MODEL]: params.model ?? 'unknown',
  };

  if ('temperature' in params) attributes[GEN_AI_REQUEST_TEMPERATURE] = params.temperature;
  if ('top_p' in params) attributes[GEN_AI_REQUEST_TOP_P] = params.top_p;
  if ('frequency_penalty' in params) attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY] = params.frequency_penalty;
  if ('presence_penalty' in params) attributes[GEN_AI_REQUEST_PRESENCE_PENALTY] = params.presence_penalty;
  if ('stream' in params) attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] = params.stream;
  if ('encoding_format' in params) attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE] = params.encoding_format;
  if ('dimensions' in params) attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE] = params.dimensions;

  // Capture conversation ID for linking messages across API calls
  const conversationId = extractConversationId(params);
  if (conversationId) {
    attributes[GEN_AI_CONVERSATION_ID] = conversationId;
  }

  return attributes;
}
