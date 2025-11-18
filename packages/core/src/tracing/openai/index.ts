import { getCurrentScope } from '../../currentScopes';
import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { startSpan, startSpanManual } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { getTruncatedJsonString } from '../ai/utils';
import { OPENAI_INTEGRATION_NAME } from './constants';
import { instrumentStream } from './streaming';
import type {
  ChatCompletionChunk,
  InstrumentedMethod,
  OpenAiIntegration,
  OpenAiOptions,
  OpenAiResponse,
  OpenAIStream,
  ResponseStreamingEvent,
} from './types';
import {
  buildMethodPath,
  getOperationName,
  getSpanOperation,
  isChatCompletionResponse,
  isEmbeddingsResponse,
  isResponsesApiResponse,
  addChatCompletionAttributes,
  addResponsesApiAttributes,
  addEmbeddingsAttributes,
  shouldInstrument,
} from './utils';

/**
 * Extract request attributes from method arguments
 */
function extractRequestAttributes(args: unknown[], methodPath: string): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: getOperationName(methodPath),
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
  };

  // Chat completion API accepts web_search_options and tools as parameters
  // we append web search options to the available tools to capture all tool calls
  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const params = args[0] as Record<string, unknown>;

    const tools = Array.isArray(params.tools) ? params.tools : [];
    const hasWebSearchOptions = params.web_search_options && typeof params.web_search_options === 'object';
    const webSearchOptions = hasWebSearchOptions
      ? [{ type: 'web_search_options', ...(params.web_search_options as Record<string, unknown>) }]
      : [];

    const availableTools = [...tools, ...webSearchOptions];

    if (availableTools.length > 0) {
      attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] = JSON.stringify(availableTools);
    }
  }

  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const params = args[0] as Record<string, unknown>;

    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = params.model ?? 'unknown';
    if ('temperature' in params) attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE] = params.temperature;
    if ('top_p' in params) attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE] = params.top_p;
    if ('frequency_penalty' in params)
      attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE] = params.frequency_penalty;
    if ('presence_penalty' in params) attributes[GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE] = params.presence_penalty;
    if ('stream' in params) attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] = params.stream;
    if ('encoding_format' in params) attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE] = params.encoding_format;
    if ('dimensions' in params) attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE] = params.dimensions;
  } else {
    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = 'unknown';
  }

  return attributes;
}

/**
 * Add response attributes to spans
 * This currently supports both Chat Completion and Responses API responses
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
  }
}

// Extract and record AI request inputs, if present. This is intentionally separate from response attributes.
function addRequestAttributes(span: Span, params: Record<string, unknown>): void {
  if ('messages' in params) {
    const truncatedMessages = getTruncatedJsonString(params.messages);
    span.setAttributes({ [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: truncatedMessages });
  }
  if ('input' in params) {
    const truncatedInput = getTruncatedJsonString(params.input);
    span.setAttributes({ [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: truncatedInput });
  }
}

function getOptionsFromIntegration(): OpenAiOptions {
  const scope = getCurrentScope();
  const client = scope.getClient();
  const integration = client?.getIntegrationByName<OpenAiIntegration>(OPENAI_INTEGRATION_NAME);
  const shouldRecordInputsAndOutputs = integration ? Boolean(client?.getOptions().sendDefaultPii) : false;

  return {
    recordInputs: integration?.options?.recordInputs ?? shouldRecordInputsAndOutputs,
    recordOutputs: integration?.options?.recordOutputs ?? shouldRecordInputsAndOutputs,
  };
}

/**
 * Instrument a method with Sentry spans
 * Following Sentry AI Agents Manual Instrumentation conventions
 * @see https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/ai-agents-module/#manual-instrumentation
 */
function instrumentMethod<T extends unknown[], R>(
  originalMethod: (...args: T) => Promise<R>,
  methodPath: InstrumentedMethod,
  context: unknown,
  options?: OpenAiOptions,
): (...args: T) => Promise<R> {
  return async function instrumentedMethod(...args: T): Promise<R> {
    const finalOptions = options || getOptionsFromIntegration();
    const requestAttributes = extractRequestAttributes(args, methodPath);
    const model = (requestAttributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] as string) || 'unknown';
    const operationName = getOperationName(methodPath);

    const params = args[0] as Record<string, unknown> | undefined;
    const isStreamRequested = params && typeof params === 'object' && params.stream === true;

    if (isStreamRequested) {
      // For streaming responses, use manual span management to properly handle the async generator lifecycle
      return startSpanManual(
        {
          name: `${operationName} ${model} stream-response`,
          op: getSpanOperation(methodPath),
          attributes: requestAttributes as Record<string, SpanAttributeValue>,
        },
        async (span: Span) => {
          try {
            if (finalOptions.recordInputs && args[0] && typeof args[0] === 'object') {
              addRequestAttributes(span, args[0] as Record<string, unknown>);
            }

            const result = await originalMethod.apply(context, args);

            return instrumentStream(
              result as OpenAIStream<ChatCompletionChunk | ResponseStreamingEvent>,
              span,
              finalOptions.recordOutputs ?? false,
            ) as unknown as R;
          } catch (error) {
            // For streaming requests that fail before stream creation, we still want to record
            // them as streaming requests but end the span gracefully
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'auto.ai.openai.stream',
                data: {
                  function: methodPath,
                },
              },
            });
            span.end();
            throw error;
          }
        },
      );
    } else {
      //  Non-streaming responses
      return startSpan(
        {
          name: `${operationName} ${model}`,
          op: getSpanOperation(methodPath),
          attributes: requestAttributes as Record<string, SpanAttributeValue>,
        },
        async (span: Span) => {
          try {
            if (finalOptions.recordInputs && args[0] && typeof args[0] === 'object') {
              addRequestAttributes(span, args[0] as Record<string, unknown>);
            }

            const result = await originalMethod.apply(context, args);
            addResponseAttributes(span, result, finalOptions.recordOutputs);
            return result;
          } catch (error) {
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'auto.ai.openai',
                data: {
                  function: methodPath,
                },
              },
            });
            throw error;
          }
        },
      );
    }
  };
}

/**
 * Create a deep proxy for OpenAI client instrumentation
 */
function createDeepProxy<T extends object>(target: T, currentPath = '', options?: OpenAiOptions): T {
  return new Proxy(target, {
    get(obj: object, prop: string): unknown {
      const value = (obj as Record<string, unknown>)[prop];
      const methodPath = buildMethodPath(currentPath, String(prop));

      if (typeof value === 'function' && shouldInstrument(methodPath)) {
        return instrumentMethod(value as (...args: unknown[]) => Promise<unknown>, methodPath, obj, options);
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
  return createDeepProxy(client, '', options);
}
