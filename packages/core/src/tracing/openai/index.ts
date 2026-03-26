import { DEBUG_BUILD } from '../../debug-build';
import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { startSpan, startSpanManual } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import { debug } from '../../utils/debug-logger';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import type { InstrumentedMethodEntry } from '../ai/utils';
import {
  buildMethodPath,
  extractSystemInstructions,
  getTruncatedJsonString,
  resolveAIRecordingOptions,
  wrapPromiseWithMethods,
} from '../ai/utils';
import { OPENAI_METHOD_REGISTRY } from './constants';
import { instrumentStream } from './streaming';
import type { ChatCompletionChunk, OpenAiOptions, OpenAiResponse, OpenAIStream, ResponseStreamingEvent } from './types';
import {
  addChatCompletionAttributes,
  addConversationAttributes,
  addEmbeddingsAttributes,
  addResponsesApiAttributes,
  extractRequestParameters,
  isChatCompletionResponse,
  isConversationResponse,
  isEmbeddingsResponse,
  isResponsesApiResponse,
} from './utils';

/**
 * Extract available tools from request parameters
 */
function extractAvailableTools(params: Record<string, unknown>): string | undefined {
  const tools = Array.isArray(params.tools) ? params.tools : [];
  const hasWebSearchOptions = params.web_search_options && typeof params.web_search_options === 'object';
  const webSearchOptions = hasWebSearchOptions
    ? [{ type: 'web_search_options', ...(params.web_search_options as Record<string, unknown>) }]
    : [];

  const availableTools = [...tools, ...webSearchOptions];
  if (availableTools.length === 0) {
    return undefined;
  }

  try {
    return JSON.stringify(availableTools);
  } catch (error) {
    DEBUG_BUILD && debug.error('Failed to serialize OpenAI tools:', error);
    return undefined;
  }
}

/**
 * Extract request attributes from method arguments
 */
function extractRequestAttributes(args: unknown[], operationName: string): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: operationName,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
  };

  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const params = args[0] as Record<string, unknown>;

    const availableTools = extractAvailableTools(params);
    if (availableTools) {
      attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] = availableTools;
    }

    Object.assign(attributes, extractRequestParameters(params));
  } else {
    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = 'unknown';
  }

  return attributes;
}

/**
 * Add response attributes to spans
 * This supports Chat Completion, Responses API, Embeddings, and Conversations API responses
 */
function addResponseAttributes(span: Span, result: unknown, recordOutputs?: boolean): void {
  if (!result || typeof result !== 'object') return;

  const response = result as OpenAiResponse;

  if (isChatCompletionResponse(response)) {
    addChatCompletionAttributes(span, response, recordOutputs);
    if (recordOutputs && response.choices?.length) {
      const responseTexts = response.choices.map(choice => choice.message?.content || '');
      span.setAttributes({ [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: JSON.stringify(responseTexts) });
    }
  } else if (isResponsesApiResponse(response)) {
    addResponsesApiAttributes(span, response, recordOutputs);
    if (recordOutputs && response.output_text) {
      span.setAttributes({ [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: response.output_text });
    }
  } else if (isEmbeddingsResponse(response)) {
    addEmbeddingsAttributes(span, response);
  } else if (isConversationResponse(response)) {
    addConversationAttributes(span, response);
  }
}

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
    const requestAttributes = extractRequestAttributes(args, operationName);
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

      const instrumentedMethod = OPENAI_METHOD_REGISTRY[methodPath];
      if (typeof value === 'function' && instrumentedMethod) {
        return instrumentMethod(value as (...args: unknown[]) => Promise<unknown>, methodPath, instrumentedMethod, obj, options);
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
