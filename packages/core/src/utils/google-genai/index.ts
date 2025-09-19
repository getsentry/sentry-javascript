import { getClient } from '../../currentScopes';
import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { startSpan } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_K_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { buildMethodPath, getFinalOperationName, getSpanOperation } from '../ai/utils';
import { handleCallbackErrors } from '../handleCallbackErrors';
import { CHAT_PATH, CHATS_CREATE_METHOD, GOOGLE_GENAI_SYSTEM_NAME } from './constants';
import type {
  Candidate,
  ContentPart,
  GoogleGenAIIstrumentedMethod,
  GoogleGenAIOptions,
  GoogleGenAIResponse,
} from './types';
import { shouldInstrument } from './utils';

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
    attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE] = config.temperature;
  }
  if ('topP' in config && typeof config.topP === 'number') {
    attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE] = config.topP;
  }
  if ('topK' in config && typeof config.topK === 'number') {
    attributes[GEN_AI_REQUEST_TOP_K_ATTRIBUTE] = config.topK;
  }
  if ('maxOutputTokens' in config && typeof config.maxOutputTokens === 'number') {
    attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE] = config.maxOutputTokens;
  }
  if ('frequencyPenalty' in config && typeof config.frequencyPenalty === 'number') {
    attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE] = config.frequencyPenalty;
  }
  if ('presencePenalty' in config && typeof config.presencePenalty === 'number') {
    attributes[GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE] = config.presencePenalty;
  }

  return attributes;
}

/**
 * Extract request attributes from method arguments
 * Builds the base attributes for span creation including system info, model, and config
 */
function extractRequestAttributes(
  args: unknown[],
  methodPath: string,
  context?: unknown,
): Record<string, SpanAttributeValue> {
  const attributes: Record<string, SpanAttributeValue> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: GOOGLE_GENAI_SYSTEM_NAME,
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: getFinalOperationName(methodPath),
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
  };

  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const params = args[0] as Record<string, unknown>;

    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = extractModel(params, context);

    // Extract generation config parameters
    if ('config' in params && typeof params.config === 'object' && params.config) {
      const config = params.config as Record<string, unknown>;
      Object.assign(attributes, extractConfigAttributes(config));

      // Extract available tools from config
      if ('tools' in config && Array.isArray(config.tools)) {
        const functionDeclarations = config.tools.map(
          (tool: { functionDeclarations: unknown[] }) => tool.functionDeclarations,
        );
        attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] = JSON.stringify(functionDeclarations);
      }
    }
  } else {
    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = extractModel({}, context);
  }

  return attributes;
}

/**
 * Add private request attributes to spans.
 * This is only recorded if recordInputs is true.
 * Handles different parameter formats for different Google GenAI methods.
 */
function addPrivateRequestAttributes(span: Span, params: Record<string, unknown>): void {
  // For models.generateContent: ContentListUnion: Content | Content[] | PartUnion | PartUnion[]
  if ('contents' in params) {
    span.setAttributes({ [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify(params.contents) });
  }

  // For chat.sendMessage: message can be string or Part[]
  if ('message' in params) {
    span.setAttributes({ [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify(params.message) });
  }

  // For chats.create: history contains the conversation history
  if ('history' in params) {
    span.setAttributes({ [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify(params.history) });
  }
}

/**
 * Add response attributes from the Google GenAI response
 * @see https://github.com/googleapis/js-genai/blob/v1.19.0/src/types.ts#L2313
 */
function addResponseAttributes(span: Span, response: GoogleGenAIResponse, recordOutputs?: boolean): void {
  if (!response || typeof response !== 'object') return;

  // Add usage metadata if present
  if (response.usageMetadata && typeof response.usageMetadata === 'object') {
    const usage = response.usageMetadata;
    if (typeof usage.promptTokenCount === 'number') {
      span.setAttributes({
        [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: usage.promptTokenCount,
      });
    }
    if (typeof usage.candidatesTokenCount === 'number') {
      span.setAttributes({
        [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: usage.candidatesTokenCount,
      });
    }
    if (typeof usage.totalTokenCount === 'number') {
      span.setAttributes({
        [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: usage.totalTokenCount,
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
        [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: responseTexts.join(''),
      });
    }
  }

  // Add tool calls if recordOutputs is enabled
  if (recordOutputs && response.functionCalls) {
    const functionCalls = response.functionCalls;
    if (Array.isArray(functionCalls) && functionCalls.length > 0) {
      span.setAttributes({
        [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: JSON.stringify(functionCalls),
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
  methodPath: GoogleGenAIIstrumentedMethod,
  context: unknown,
  options: GoogleGenAIOptions,
): (...args: T) => R | Promise<R> {
  const isSyncCreate = methodPath === CHATS_CREATE_METHOD;

  const run = (...args: T): R | Promise<R> => {
    const requestAttributes = extractRequestAttributes(args, methodPath, context);
    const model = requestAttributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] ?? 'unknown';
    const operationName = getFinalOperationName(methodPath);

    // Single span for both sync and async operations
    return startSpan(
      {
        name: isSyncCreate ? `${operationName} ${model} create` : `${operationName} ${model}`,
        op: getSpanOperation(methodPath),
        attributes: requestAttributes,
      },
      (span: Span) => {
        if (options.recordInputs && args[0] && typeof args[0] === 'object') {
          addPrivateRequestAttributes(span, args[0] as Record<string, unknown>);
        }

        return handleCallbackErrors(
          () => originalMethod.apply(context, args),
          error => {
            captureException(error, {
              mechanism: { handled: false, type: 'auto.ai.google_genai', data: { function: methodPath } },
            });
          },
          () => {},
          result => {
            // Only add response attributes for content-producing methods, not for chats.create
            if (!isSyncCreate) {
              addResponseAttributes(span, result, options.recordOutputs);
            }
          },
        );
      },
    );
  };

  return run;
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

      if (typeof value === 'function' && shouldInstrument(methodPath)) {
        // Special case: chats.create is synchronous but needs both instrumentation AND result proxying
        if (methodPath === CHATS_CREATE_METHOD) {
          const instrumentedMethod = instrumentMethod(value as (...args: unknown[]) => unknown, methodPath, t, options);
          return function instrumentedAndProxiedCreate(...args: unknown[]): unknown {
            const result = instrumentedMethod(...args);
            // If the result is an object (like a chat instance), proxy it too
            if (result && typeof result === 'object') {
              return createDeepProxy(result, CHAT_PATH, options);
            }
            return result;
          };
        }

        return instrumentMethod(value as (...args: unknown[]) => Promise<unknown>, methodPath, t, options);
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
  }) as T;
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
 * import { GoogleGenerativeAI } from '@google/genai';
 * import { instrumentGoogleGenAIClient } from '@sentry/core';
 *
 * const genAI = new GoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });
 * const instrumentedClient = instrumentGoogleGenAIClient(genAI);
 *
 * // Now both chats.create and sendMessage will be instrumented
 * const chat = instrumentedClient.chats.create({ model: 'gemini-1.5-pro' });
 * const response = await chat.sendMessage({ message: 'Hello' });
 * ```
 */
export function instrumentGoogleGenAIClient<T extends object>(client: T, options?: GoogleGenAIOptions): T {
  const sendDefaultPii = Boolean(getClient()?.getOptions().sendDefaultPii);

  const _options = {
    recordInputs: sendDefaultPii,
    recordOutputs: sendDefaultPii,
    ...options,
  };
  return createDeepProxy(client, '', _options);
}
