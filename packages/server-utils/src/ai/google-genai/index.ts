/* eslint-disable typescript-eslint/no-deprecated */
/* eslint-disable max-lines */
import {
  captureException,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startSpan,
  startSpanManual,
  handleCallbackErrors,
  stringify,
} from '@sentry/core';
import type { Span, SpanAttributeValue } from '@sentry/core';
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_FREQUENCY_PENALTY,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_PRESENCE_PENALTY,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_K,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import type { InstrumentedMethodEntry } from '../core/utils';
import { buildMethodPath, extractSystemInstructions, getGenAiSpanOp, resolveAIRecordingOptions } from '../core/utils';
import { GOOGLE_GENAI_METHOD_REGISTRY, GOOGLE_GENAI_SYSTEM_NAME } from './constants';
import { instrumentStream } from './streaming';
import type { Candidate, ContentPart, GoogleGenAIOptions, GoogleGenAIResponse } from './types';
import type { ContentListUnion, Message, PartListUnion } from './utils';
import { contentUnionToMessages } from './utils';

/**
 * Extract model from parameters or chat context object
 * For chat instances, the model is available on the chat object as 'model' (older versions) or 'modelVersion' (newer versions)
 */
export function extractModel(params: Record<string, unknown>, context?: unknown): string {
  if ('model' in params && typeof params.model === 'string') {
    return params.model;
  }

  // Try to get model from chat context object (chat instance has model property)
  if (context && typeof context === 'object') {
    const contextObj = context as Record<string, unknown>;

    // Check for 'model' property (older versions, and streaming)
    if ('model' in contextObj && typeof contextObj.model === 'string') {
      return contextObj.model;
    }

    // Check for 'modelVersion' property (newer versions)
    if ('modelVersion' in contextObj && typeof contextObj.modelVersion === 'string') {
      return contextObj.modelVersion;
    }
  }

  return 'unknown';
}

/**
 * Extract generation config parameters
 */
function extractConfigAttributes(config: Record<string, unknown>): Record<string, SpanAttributeValue> {
  const attributes: Record<string, SpanAttributeValue> = {};

  if ('temperature' in config && typeof config.temperature === 'number') {
    attributes[GEN_AI_REQUEST_TEMPERATURE] = config.temperature;
  }
  if ('topP' in config && typeof config.topP === 'number') {
    attributes[GEN_AI_REQUEST_TOP_P] = config.topP;
  }
  if ('topK' in config && typeof config.topK === 'number') {
    attributes[GEN_AI_REQUEST_TOP_K] = config.topK;
  }
  if ('maxOutputTokens' in config && typeof config.maxOutputTokens === 'number') {
    attributes[GEN_AI_REQUEST_MAX_TOKENS] = config.maxOutputTokens;
  }
  if ('frequencyPenalty' in config && typeof config.frequencyPenalty === 'number') {
    attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY] = config.frequencyPenalty;
  }
  if ('presencePenalty' in config && typeof config.presencePenalty === 'number') {
    attributes[GEN_AI_REQUEST_PRESENCE_PENALTY] = config.presencePenalty;
  }

  return attributes;
}

/**
 * Extract request attributes from method arguments
 * Builds the base attributes for span creation including system info, model, and config
 */
export function extractRequestAttributes(
  operationName: string,
  params?: Record<string, unknown>,
  context?: unknown,
): Record<string, SpanAttributeValue> {
  const attributes: Record<string, SpanAttributeValue> = {
    [GEN_AI_PROVIDER_NAME]: GOOGLE_GENAI_SYSTEM_NAME,
    [GEN_AI_OPERATION_NAME]: operationName,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
  };

  if (params) {
    attributes[GEN_AI_REQUEST_MODEL] = extractModel(params, context);

    // Extract generation config parameters
    if ('config' in params && typeof params.config === 'object' && params.config) {
      const config = params.config as Record<string, unknown>;
      Object.assign(attributes, extractConfigAttributes(config));

      // Extract available tools from config
      if ('tools' in config && Array.isArray(config.tools)) {
        const functionDeclarations = config.tools.flatMap(
          (tool: { functionDeclarations: unknown[] }) => tool.functionDeclarations,
        );
        attributes[GEN_AI_TOOL_DEFINITIONS] = JSON.stringify(functionDeclarations);
      }
    }
  } else {
    attributes[GEN_AI_REQUEST_MODEL] = extractModel({}, context);
  }

  return attributes;
}

/**
 * Add private request attributes to spans.
 * This is only recorded if recordInputs is true.
 * Handles different parameter formats for different Google GenAI methods.
 */
export function addPrivateRequestAttributes(span: Span, params: Record<string, unknown>, operationName: string): void {
  if (operationName === 'embeddings') {
    const contents = params.contents;
    if (contents != null) {
      span.setAttribute(GEN_AI_EMBEDDINGS_INPUT, stringify(contents, String));
    }
    return;
  }

  const messages: Message[] = [];

  // config.systemInstruction: ContentUnion
  if (
    'config' in params &&
    params.config &&
    typeof params.config === 'object' &&
    'systemInstruction' in params.config &&
    params.config.systemInstruction
  ) {
    messages.push(...contentUnionToMessages(params.config.systemInstruction, 'system'));
  }

  // For chats.create: history contains the conversation history
  if ('history' in params) {
    messages.push(...contentUnionToMessages(params.history as PartListUnion, 'user'));
  }

  // For models.generateContent: ContentListUnion
  if ('contents' in params) {
    messages.push(...contentUnionToMessages(params.contents as ContentListUnion, 'user'));
  }

  // For chat.sendMessage: message can be PartListUnion
  if ('message' in params) {
    messages.push(...contentUnionToMessages(params.message as PartListUnion, 'user'));
  }

  if (Array.isArray(messages) && messages.length) {
    const { systemInstructions, filteredMessages } = extractSystemInstructions(messages);

    if (systemInstructions) {
      span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS, systemInstructions);
    }

    span.setAttributes({
      [GEN_AI_INPUT_MESSAGES]: stringify(filteredMessages),
    });
  }
}

/**
 * Add response attributes from the Google GenAI response
 * @see https://github.com/googleapis/js-genai/blob/v1.19.0/src/types.ts#L2313
 */
export function addResponseAttributes(span: Span, response: GoogleGenAIResponse, recordOutputs?: boolean): void {
  if (!response || typeof response !== 'object') return;

  if (response.modelVersion) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL, response.modelVersion);
  }

  // Add usage metadata if present
  if (response.usageMetadata && typeof response.usageMetadata === 'object') {
    const usage = response.usageMetadata;
    if (typeof usage.promptTokenCount === 'number') {
      span.setAttributes({
        [GEN_AI_USAGE_INPUT_TOKENS]: usage.promptTokenCount,
      });
    }
    if (typeof usage.candidatesTokenCount === 'number') {
      span.setAttributes({
        [GEN_AI_USAGE_OUTPUT_TOKENS]: usage.candidatesTokenCount,
      });
    }
    if (typeof usage.totalTokenCount === 'number') {
      span.setAttributes({
        [GEN_AI_USAGE_TOTAL_TOKENS]: usage.totalTokenCount,
      });
    }
  }

  // Add response text if recordOutputs is enabled
  if (recordOutputs && Array.isArray(response.candidates) && response.candidates.length > 0) {
    const responseTexts = response.candidates
      .map((candidate: Candidate) => {
        if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
          return candidate.content.parts
            .map((part: ContentPart) => (typeof part.text === 'string' ? part.text : ''))
            .filter((text: string) => text.length > 0)
            .join('');
        }
        return '';
      })
      .filter((text: string) => text.length > 0);

    if (responseTexts.length > 0) {
      span.setAttributes({
        [GEN_AI_RESPONSE_TEXT]: responseTexts.join(''),
      });
    }
  }

  // Add tool calls if recordOutputs is enabled
  if (recordOutputs && response.functionCalls) {
    const functionCalls = response.functionCalls;
    if (Array.isArray(functionCalls) && functionCalls.length > 0) {
      span.setAttributes({
        [GEN_AI_RESPONSE_TOOL_CALLS]: JSON.stringify(functionCalls),
      });
    }
  }
}

/**
 * Instrument any async or synchronous genai method with Sentry spans
 * Handles operations like models.generateContent and chat.sendMessage and chats.create
 * @see https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/ai-agents-module/#manual-instrumentation
 */
function instrumentMethod<T extends unknown[], R>(
  originalMethod: (...args: T) => R | Promise<R>,
  methodPath: string,
  instrumentedMethod: InstrumentedMethodEntry,
  context: unknown,
  options: GoogleGenAIOptions,
): (...args: T) => R | Promise<R> {
  const isEmbeddings = instrumentedMethod.operation === 'embeddings';

  return new Proxy(originalMethod, {
    apply(target, _, args: T): R | Promise<R> {
      const operationName = instrumentedMethod.operation || 'unknown';
      const params = args[0] as Record<string, unknown> | undefined;
      const requestAttributes = extractRequestAttributes(operationName, params, context);
      const model = requestAttributes[GEN_AI_REQUEST_MODEL] ?? 'unknown';

      // Check if this is a streaming method
      if (instrumentedMethod.streaming) {
        // Use startSpanManual for streaming methods to control span lifecycle
        return startSpanManual(
          {
            name: `${operationName} ${model}`,
            op: getGenAiSpanOp(operationName),
            attributes: requestAttributes,
          },
          async (span: Span) => {
            try {
              if (options.recordInputs && params) {
                addPrivateRequestAttributes(span, params, operationName);
              }
              const stream = await target.apply(context, args);
              return instrumentStream(stream, span, Boolean(options.recordOutputs)) as R;
            } catch (error) {
              span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
              captureException(error, {
                mechanism: {
                  handled: false,
                  type: 'auto.ai.google_genai',
                  data: { function: methodPath },
                },
              });
              span.end();
              throw error;
            }
          },
        );
      }
      // Single span for both sync and async operations
      return startSpan(
        {
          name: `${operationName} ${model}`,
          op: getGenAiSpanOp(operationName),
          attributes: requestAttributes,
        },
        (span: Span) => {
          if (options.recordInputs && params) {
            addPrivateRequestAttributes(span, params, operationName);
          }

          return handleCallbackErrors(
            () => target.apply(context, args),
            error => {
              captureException(error, {
                mechanism: { handled: false, type: 'auto.ai.google_genai', data: { function: methodPath } },
              });
            },
            () => {},
            result => {
              // Only add response attributes for content-producing methods, not for embeddings
              if (!isEmbeddings) {
                addResponseAttributes(span, result, options.recordOutputs);
              }
            },
          );
        },
      );
    },
  });
}

/**
 * Create a deep proxy for Google GenAI client instrumentation
 * Recursively instruments methods and handles special cases like chats.create
 */
function createDeepProxy<T extends object>(target: T, currentPath = '', options: GoogleGenAIOptions): T {
  return new Proxy(target, {
    get: (t, prop, receiver) => {
      const value = Reflect.get(t, prop, receiver);
      const methodPath = buildMethodPath(currentPath, String(prop));

      const instrumentedMethod: InstrumentedMethodEntry | undefined =
        GOOGLE_GENAI_METHOD_REGISTRY[methodPath as keyof typeof GOOGLE_GENAI_METHOD_REGISTRY];
      if (typeof value === 'function' && instrumentedMethod) {
        // If an operation is specified, we need to instrument the method itself
        const wrappedMethod = instrumentedMethod.operation
          ? instrumentMethod(value as (...args: unknown[]) => unknown, methodPath, instrumentedMethod, t, options)
          : value.bind(t);

        if (!instrumentedMethod.proxyResultPath) {
          return wrappedMethod;
        }

        // If a proxyResultPath is specified, we need to proxy the result of the method.
        // Note: This currently only properly handles synchronous methods. For async methods,
        // the Promise itself would be proxied instead of the resolved value. Currently we
        // don't have a case where this is needed, so I'll keep it simple for now.
        return function (...args: unknown[]): unknown {
          const result = wrappedMethod(...args);
          if (result && typeof result === 'object') {
            return createDeepProxy(result as object, instrumentedMethod.proxyResultPath, options);
          }
          return result;
        };
      }

      if (typeof value === 'function') {
        // Bind non-instrumented functions to preserve the original `this` context
        return value.bind(t);
      }

      if (value && typeof value === 'object') {
        return createDeepProxy(value, methodPath, options);
      }

      return value;
    },
  });
}

/**
 * Instrument a Google GenAI client with Sentry tracing
 * Can be used across Node.js, Cloudflare Workers, and Vercel Edge
 *
 * @template T - The type of the client that extends client object
 * @param client - The Google GenAI client to instrument
 * @param options - Optional configuration for recording inputs and outputs
 * @returns The instrumented client with the same type as the input
 *
 * @example
 * ```typescript
 * import { GoogleGenAI } from '@google/genai';
 * import { instrumentGoogleGenAIClient } from '@sentry/node';
 *
 * const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });
 * const instrumentedClient = instrumentGoogleGenAIClient(genAI);
 *
 * // Now both chats.create and sendMessage will be instrumented
 * const chat = instrumentedClient.chats.create({ model: 'gemini-1.5-pro' });
 * const response = await chat.sendMessage({ message: 'Hello' });
 * ```
 */
export function instrumentGoogleGenAIClient<T extends object>(client: T, options?: GoogleGenAIOptions): T {
  return createDeepProxy(client, '', resolveAIRecordingOptions(options));
}
