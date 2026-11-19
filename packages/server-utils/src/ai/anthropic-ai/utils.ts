/* eslint-disable typescript-eslint/no-deprecated */
import { captureException, isObjectLike, SPAN_STATUS_ERROR, stringify } from '@sentry/core';
import type { Span, SpanStatusType } from '@sentry/core';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
} from '@sentry/conventions/attributes';
import { extractSystemInstructions, getTokenUsageAttributes } from '../core/utils';
import type { AnthropicAiResponse, ContentBlock } from './types';

/**
 * The `gen_ai.provider.name` of the client that owns an SDK resource such as `messages`. The SDK's clients
 * for other platforms set their own, e.g. `aws.bedrock` for `AnthropicBedrock`.
 */
export function getProviderName(resource: unknown): string {
  const name = (resource as { _client?: { _genAIProviderName?: unknown } } | null | undefined)?._client
    ?._genAIProviderName;
  return typeof name === 'string' && name ? name : 'anthropic';
}

/**
 * Get the input messages attribute, with system instructions extracted into their own attribute.
 */
export function getMessagesAttributes(messages: unknown): Record<string, string | undefined> {
  if (Array.isArray(messages) && messages.length === 0) {
    return {};
  }

  const { systemInstructions, filteredMessages } = extractSystemInstructions(messages);

  const attributes: Record<string, string | undefined> = {};
  if (systemInstructions) {
    attributes[GEN_AI_SYSTEM_INSTRUCTIONS] = systemInstructions;
  }
  attributes[GEN_AI_INPUT_MESSAGES] = stringify(filteredMessages);
  return attributes;
}

const ANTHROPIC_ERROR_TYPE_TO_SPAN_STATUS: Record<string, SpanStatusType> = {
  invalid_request_error: 'invalid_argument',
  authentication_error: 'unauthenticated',
  permission_error: 'permission_denied',
  not_found_error: 'not_found',
  request_too_large: 'failed_precondition',
  rate_limit_error: 'resource_exhausted',
  api_error: 'internal_error',
  overloaded_error: 'unavailable',
};

/**
 * Map an Anthropic API error type to a SpanStatusType value.
 * @see https://docs.anthropic.com/en/api/errors#error-shapes
 */
export function mapAnthropicErrorToStatusMessage(errorType: string | undefined): SpanStatusType {
  if (!errorType) {
    return 'internal_error';
  }
  return ANTHROPIC_ERROR_TYPE_TO_SPAN_STATUS[errorType] || 'internal_error';
}

/**
 * Capture error information from the response
 * @see https://docs.anthropic.com/en/api/errors#error-shapes
 */
function handleResponseError(span: Span, response: AnthropicAiResponse): void {
  if (response.error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: mapAnthropicErrorToStatusMessage(response.error.type) });

    captureException(response.error, {
      mechanism: {
        handled: false,
        type: 'auto.ai.anthropic.anthropic_error',
      },
    });
  }
}

/**
 * Add content attributes when recordOutputs is enabled
 */
function addContentAttributes(span: Span, response: AnthropicAiResponse): void {
  // Messages.create
  if ('content' in response) {
    if (Array.isArray(response.content)) {
      span.setAttributes({
        [GEN_AI_RESPONSE_TEXT]: response.content
          .map((item: ContentBlock) => item.text)
          .filter(text => !!text)
          .join(''),
      });

      const toolCalls: Array<ContentBlock> = [];

      for (const item of response.content) {
        if (item.type === 'tool_use' || item.type === 'server_tool_use') {
          toolCalls.push(item);
        }
      }
      if (toolCalls.length > 0) {
        span.setAttributes({ [GEN_AI_RESPONSE_TOOL_CALLS]: JSON.stringify(toolCalls) });
      }
    }
  }
  // Completions.create
  if ('completion' in response) {
    span.setAttributes({ [GEN_AI_RESPONSE_TEXT]: response.completion });
  }
}

/**
 * Add basic metadata attributes from the response
 */
function addMetadataAttributes(span: Span, response: AnthropicAiResponse): void {
  if ('id' in response && 'model' in response) {
    span.setAttributes({
      [GEN_AI_RESPONSE_ID]: response.id,
      [GEN_AI_RESPONSE_MODEL]: response.model,
    });

    if ('usage' in response && response.usage) {
      span.setAttributes(
        getTokenUsageAttributes(
          response.usage.input_tokens +
            (response.usage.cache_creation_input_tokens ?? 0) +
            (response.usage.cache_read_input_tokens ?? 0),
          response.usage.output_tokens,
          response.usage.cache_creation_input_tokens,
          response.usage.cache_read_input_tokens,
        ),
      );
    }
  }
}

/**
 * Add response attributes to spans
 */
export function addResponseAttributes(span: Span, response: AnthropicAiResponse, recordOutputs?: boolean): void {
  if (!response || typeof response !== 'object') return;

  // capture error, do not add attributes if error (they shouldn't exist)
  if ('type' in response && response.type === 'error') {
    handleResponseError(span, response);
    return;
  }

  // Private response attributes that are only recorded if recordOutputs is true.
  if (recordOutputs) {
    addContentAttributes(span, response);
  }

  // Add basic metadata attributes
  addMetadataAttributes(span, response);
}

/** Anthropic accepts the system prompt as a string or as an array of text blocks. */
function systemToText(system: unknown): string | undefined {
  if (!Array.isArray(system)) {
    return typeof system === 'string' ? system : undefined;
  }
  return system
    .map(block => (isObjectLike(block) ? block.text : undefined))
    .filter(text => typeof text === 'string' && text)
    .join('\n');
}

/**
 * Include the system prompt in the messages list, if available
 */
export function messagesFromParams(params: Record<string, unknown>): unknown[] {
  const { system, messages, input, prompt } = params;

  const systemText = systemToText(system);
  const systemMessages = systemText ? [{ role: 'system', content: systemText }] : [];

  const inputParamMessages = Array.isArray(input) ? input : input != null ? [input] : undefined;

  const messagesParamMessages = Array.isArray(messages) ? messages : messages != null ? [messages] : [];

  // The legacy Completions API takes a single raw `prompt` string instead of a message list. Model
  // it as one user message so it lands on `gen_ai.input.messages` like every other request shape.
  const promptMessages = prompt != null ? [{ role: 'user', content: stringify(prompt, String) }] : [];

  const userMessages = inputParamMessages ?? (messagesParamMessages.length ? messagesParamMessages : promptMessages);

  return [...systemMessages, ...userMessages];
}
