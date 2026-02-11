import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { extractSystemInstructions, getTruncatedJsonString } from '../ai/utils';
import { ANTHROPIC_AI_INSTRUMENTED_METHODS } from './constants';
import type { AnthropicAiInstrumentedMethod, AnthropicAiResponse } from './types';

/**
 * Check if a method path should be instrumented
 */
export function shouldInstrument(methodPath: string): methodPath is AnthropicAiInstrumentedMethod {
  return ANTHROPIC_AI_INSTRUMENTED_METHODS.includes(methodPath as AnthropicAiInstrumentedMethod);
}

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

/**
 * Capture error information from the response
 * @see https://docs.anthropic.com/en/api/errors#error-shapes
 */
export function handleResponseError(span: Span, response: AnthropicAiResponse): void {
  if (response.error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: response.error.type || 'internal_error' });

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
