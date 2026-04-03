import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import {
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
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
    attrs[GEN_AI_RESPONSE_ID_ATTRIBUTE] = response.id;
  }

  // Response model
  if (typeof response.model === 'string') {
    attrs[GEN_AI_RESPONSE_MODEL_ATTRIBUTE] = response.model;
  }

  // Conversation ID (conversation objects use id as conversation link)
  if (response.object === 'conversation' && typeof response.id === 'string') {
    attrs[GEN_AI_CONVERSATION_ID_ATTRIBUTE] = response.id;
  }

  // Token usage — supports both naming conventions (chat: prompt_tokens/completion_tokens, responses: input_tokens/output_tokens)
  if (response.usage && typeof response.usage === 'object') {
    const usage = response.usage as Record<string, unknown>;

    const inputTokens = usage.prompt_tokens ?? usage.input_tokens;
    if (typeof inputTokens === 'number') {
      attrs[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] = inputTokens;
    }

    const outputTokens = usage.completion_tokens ?? usage.output_tokens;
    if (typeof outputTokens === 'number') {
      attrs[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] = outputTokens;
    }

    if (typeof usage.total_tokens === 'number') {
      attrs[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE] = usage.total_tokens;
    }
  }

  // Finish reasons from choices (chat completions)
  if (Array.isArray(response.choices)) {
    const choices = response.choices as Array<Record<string, unknown>>;
    const finishReasons = choices
      .map(choice => choice.finish_reason)
      .filter((reason): reason is string => typeof reason === 'string');
    if (finishReasons.length > 0) {
      attrs[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE] = JSON.stringify(finishReasons);
    }

    if (recordOutputs) {
      // Response text from choices
      const responseTexts = choices.map(choice => {
        const message = choice.message as Record<string, unknown> | undefined;
        return (message?.content as string) || '';
      });
      attrs[GEN_AI_RESPONSE_TEXT_ATTRIBUTE] = JSON.stringify(responseTexts);

      // Tool calls from choices
      const toolCalls = choices
        .map(choice => {
          const message = choice.message as Record<string, unknown> | undefined;
          return message?.tool_calls;
        })
        .filter(calls => Array.isArray(calls) && calls.length > 0)
        .flat();

      if (toolCalls.length > 0) {
        attrs[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE] = JSON.stringify(toolCalls);
      }
    }
  }

  // Finish reason from status (responses API)
  if (typeof response.status === 'string') {
    // Only set if not already set from choices
    if (!attrs[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]) {
      attrs[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE] = JSON.stringify([response.status]);
    }
  }

  if (recordOutputs) {
    // Response text from output_text (responses API)
    if (typeof response.output_text === 'string' && !attrs[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]) {
      attrs[GEN_AI_RESPONSE_TEXT_ATTRIBUTE] = response.output_text;
    }

    // Tool calls from output array (responses API)
    if (Array.isArray(response.output) && response.output.length > 0 && !attrs[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]) {
      const functionCalls = (response.output as Array<Record<string, unknown>>).filter(
        item => item?.type === 'function_call',
      );
      if (functionCalls.length > 0) {
        attrs[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE] = JSON.stringify(functionCalls);
      }
    }
  }

  span.setAttributes(attrs);
}
