import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import type { SpanStatusType } from '../../types-hoist/spanStatus';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { extractSystemInstructions, getTruncatedJsonString } from '../ai/utils';
import type { AnthropicAiResponse } from './types';

/**
 * Set the messages and messages original length attributes.
 * Extracts system instructions before truncation.
 */
export function setMessagesAttribute(span: Span, messages: unknown): void {
  if (Array.isArray(messages) && messages.length === 0) {
    return;
  }

  const { systemInstructions, filteredMessages } = extractSystemInstructions(messages);

  if (systemInstructions) {
    span.setAttributes({
      [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: systemInstructions,
    });
  }

  const filteredLength = Array.isArray(filteredMessages) ? filteredMessages.length : 1;
  span.setAttributes({
    [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: getTruncatedJsonString(filteredMessages),
    [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: filteredLength,
  });
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
export function handleResponseError(span: Span, response: AnthropicAiResponse): void {
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
 * Include the system prompt in the messages list, if available
 */
export function messagesFromParams(params: Record<string, unknown>): unknown[] {
  const { system, messages, input } = params;

  const systemMessages = typeof system === 'string' ? [{ role: 'system', content: params.system }] : [];

  const inputParamMessages = Array.isArray(input) ? input : input != null ? [input] : undefined;

  const messagesParamMessages = Array.isArray(messages) ? messages : messages != null ? [messages] : [];

  const userMessages = inputParamMessages ?? messagesParamMessages;

  return [...systemMessages, ...userMessages];
}
