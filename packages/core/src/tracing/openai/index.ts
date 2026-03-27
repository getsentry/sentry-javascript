import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { startSpan, startSpanManual } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import type { InstrumentedMethodEntry } from '../ai/utils';
import {
  buildMethodPath,
  extractRequestAttributes,
  extractSystemInstructions,
  getTruncatedJsonString,
  resolveAIRecordingOptions,
  wrapPromiseWithMethods,
} from '../ai/utils';
import { OPENAI_METHOD_REGISTRY } from './constants';
import { instrumentStream } from './streaming';
import type { ChatCompletionChunk, OpenAiOptions, OpenAIStream, ResponseStreamingEvent } from './types';
import { addResponseAttributes } from './utils';

// Extract and record AI request inputs, if present. This is intentionally separate from response attributes.
function addRequestAttributes(span: Span, params: Record<string, unknown>, operationName: string): void {
  // Store embeddings input on a separate attribute and do not truncate it
  if (operationName === 'embeddings' && 'input' in params) {
    const input = params.input;

    // No input provided
    if (input == null) {
      return;
    }

    // Empty input string
    if (typeof input === 'string' && input.length === 0) {
      return;
    }

    // Empty array input
    if (Array.isArray(input) && input.length === 0) {
      return;
    }

    // Store strings as-is, arrays/objects as JSON
    span.setAttribute(GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE, typeof input === 'string' ? input : JSON.stringify(input));
    return;
  }

  const src = 'input' in params ? params.input : 'messages' in params ? params.messages : undefined;

  if (!src) {
    return;
  }

  if (Array.isArray(src) && src.length === 0) {
    return;
  }

  const { systemInstructions, filteredMessages } = extractSystemInstructions(src);

  if (systemInstructions) {
    span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE, systemInstructions);
  }

  const truncatedInput = getTruncatedJsonString(filteredMessages);
  span.setAttribute(GEN_AI_INPUT_MESSAGES_ATTRIBUTE, truncatedInput);

  if (Array.isArray(filteredMessages)) {
    span.setAttribute(GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE, filteredMessages.length);
  } else {
    span.setAttribute(GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE, 1);
  }
}

/**
 * Instrument a method with Sentry spans
 * Following Sentry AI Agents Manual Instrumentation conventions
 * @see https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/ai-agents-module/#manual-instrumentation
 */
function instrumentMethod<T extends unknown[], R>(
  originalMethod: (...args: T) => Promise<R>,
  methodPath: string,
  instrumentedMethod: InstrumentedMethodEntry,
  context: unknown,
  options: OpenAiOptions,
): (...args: T) => Promise<R> {
  return function instrumentedCall(...args: T): Promise<R> {
    const operationName = instrumentedMethod.operation;
    const requestAttributes = extractRequestAttributes('openai', 'auto.ai.openai', operationName, args);
    const model = (requestAttributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] as string) || 'unknown';

    const params = args[0] as Record<string, unknown> | undefined;
    const isStreamRequested = params && typeof params === 'object' && params.stream === true;

    const spanConfig = {
      name: `${operationName} ${model}`,
      op: `gen_ai.${operationName}`,
      attributes: requestAttributes as Record<string, SpanAttributeValue>,
    };

    if (isStreamRequested) {
      let originalResult!: Promise<R>;

      const instrumentedPromise = startSpanManual(spanConfig, (span: Span) => {
        originalResult = originalMethod.apply(context, args);

        if (options.recordInputs && params) {
          addRequestAttributes(span, params, operationName);
        }

        // Return async processing
        return (async () => {
          try {
            const result = await originalResult;
            return instrumentStream(
              result as OpenAIStream<ChatCompletionChunk | ResponseStreamingEvent>,
              span,
              options.recordOutputs ?? false,
            ) as unknown as R;
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'auto.ai.openai.stream',
                data: { function: methodPath },
              },
            });
            span.end();
            throw error;
          }
        })();
      });

      return wrapPromiseWithMethods(originalResult, instrumentedPromise, 'auto.ai.openai');
    }

    // Non-streaming
    let originalResult!: Promise<R>;

    const instrumentedPromise = startSpan(spanConfig, (span: Span) => {
      // Call synchronously to capture the promise
      originalResult = originalMethod.apply(context, args);

      if (options.recordInputs && params) {
        addRequestAttributes(span, params, operationName);
      }

      return originalResult.then(
        result => {
          addResponseAttributes(span, result, options.recordOutputs);
          return result;
        },
        error => {
          captureException(error, {
            mechanism: {
              handled: false,
              type: 'auto.ai.openai',
              data: { function: methodPath },
            },
          });
          throw error;
        },
      );
    });

    return wrapPromiseWithMethods(originalResult, instrumentedPromise, 'auto.ai.openai');
  };
}

/**
 * Create a deep proxy for OpenAI client instrumentation
 */
function createDeepProxy<T extends object>(target: T, currentPath = '', options: OpenAiOptions): T {
  return new Proxy(target, {
    get(obj: object, prop: string): unknown {
      const value = (obj as Record<string, unknown>)[prop];
      const methodPath = buildMethodPath(currentPath, String(prop));

      const instrumentedMethod = OPENAI_METHOD_REGISTRY[methodPath as keyof typeof OPENAI_METHOD_REGISTRY];
      if (typeof value === 'function' && instrumentedMethod) {
        return instrumentMethod(
          value as (...args: unknown[]) => Promise<unknown>,
          methodPath,
          instrumentedMethod,
          obj,
          options,
        );
      }

      if (typeof value === 'function') {
        // Bind non-instrumented functions to preserve the original `this` context,
        // which is required for accessing private class fields (e.g. #baseURL) in OpenAI SDK v5.
        return value.bind(obj);
      }

      if (value && typeof value === 'object') {
        return createDeepProxy(value, methodPath, options);
      }

      return value;
    },
  }) as T;
}

/**
 * Instrument an OpenAI client with Sentry tracing
 * Can be used across Node.js, Cloudflare Workers, and Vercel Edge
 */
export function instrumentOpenAiClient<T extends object>(client: T, options?: OpenAiOptions): T {
  return createDeepProxy(client, '', resolveAIRecordingOptions(options));
}
