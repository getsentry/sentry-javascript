import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import { ANTHROPIC_AI_INSTRUMENTED_METHODS } from './constants';
import type { AnthropicAiInstrumentedMethod, AnthropicAiResponse } from './types';

/**
 * Check if a method path should be instrumented
 */
export function shouldInstrument(methodPath: string): methodPath is AnthropicAiInstrumentedMethod {
  return ANTHROPIC_AI_INSTRUMENTED_METHODS.includes(methodPath as AnthropicAiInstrumentedMethod);
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
  const { system, messages } = params;

  const systemMessages = typeof system === 'string' ? [{ role: 'system', content: params.system }] : [];

  const userMessages = Array.isArray(messages) ? messages : messages != null ? [messages] : [];

  return [...systemMessages, ...userMessages];
}
