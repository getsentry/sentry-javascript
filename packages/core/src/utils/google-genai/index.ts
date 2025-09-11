import { getCurrentScope } from '../../currentScopes';
import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { startSpan } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_K_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { buildMethodPath, getFinalOperationName, getSpanOperation } from '../ai/utils';
import { isThenable } from '../is';
import {
  CHAT_PATH,
  CHATS_CREATE_METHOD,
  GOOGLE_GENAI_INTEGRATION_NAME,
  GOOGLE_GENAI_MODEL_PROPERTY,
  GOOGLE_GENAI_SYSTEM_NAME,
} from './constants';
import type {
  Candidate,
  ContentPart,
  GoogleGenAIIntegration,
  GoogleGenAIIstrumentedMethod,
  GoogleGenAIOptions,
  GoogleGenAIResponse,
} from './types';
import { shouldInstrument } from './utils';

/**
 * Extract model from parameters or context
 * For chat instances, the model is stored during chat creation and retrieved from context
 */
export function extractModel(params: Record<string, unknown>, context?: unknown): string {
  if ('model' in params && typeof params.model === 'string') {
    return params.model;
  }

  // For chat instances, try to get the model from the chat context
  // This is because the model is set during chat creation
  // and not passed as a parameter to the chat.sendMessage method
  if (context && typeof context === 'object') {
    const chatObj = context as Record<string, unknown>;
    if (chatObj[GOOGLE_GENAI_MODEL_PROPERTY] && typeof chatObj[GOOGLE_GENAI_MODEL_PROPERTY] === 'string') {
      return chatObj[GOOGLE_GENAI_MODEL_PROPERTY] as string;
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
      Object.assign(attributes, extractConfigAttributes(params.config as Record<string, unknown>));
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
}

/**
 * Get recording options from the Sentry integration configuration
 * Falls back to sendDefaultPii setting if integration options are not specified
 */
function getRecordingOptionsFromIntegration(): GoogleGenAIOptions {
  const scope = getCurrentScope();
  const client = scope.getClient();
  const integration = client?.getIntegrationByName(GOOGLE_GENAI_INTEGRATION_NAME) as GoogleGenAIIntegration | undefined;
  const shouldRecordInputsAndOutputs = integration ? Boolean(client?.getOptions().sendDefaultPii) : false;

  return {
    recordInputs: integration?.options?.recordInputs ?? shouldRecordInputsAndOutputs,
    recordOutputs: integration?.options?.recordOutputs ?? shouldRecordInputsAndOutputs,
  };
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
  options?: GoogleGenAIOptions,
): (...args: T) => R | Promise<R> {
  const isSyncCreate = !isThenable(originalMethod) && methodPath === CHATS_CREATE_METHOD;

  const run = (...args: T): R | Promise<R> => {
    const finalOptions = options || getRecordingOptionsFromIntegration();
    const requestAttributes = extractRequestAttributes(args, methodPath, context);
    const model = requestAttributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] ?? 'unknown';
    const operationName = getFinalOperationName(methodPath);

    if (isSyncCreate) {
      // Preserve sync return for chats.create
      return startSpan(
        {
          name: `${operationName} ${model} create`,
          op: getSpanOperation(methodPath),
          attributes: requestAttributes,
        },
        (span: Span) => {
          try {
            if (finalOptions.recordInputs && args[0] && typeof args[0] === 'object') {
              addPrivateRequestAttributes(span, args[0] as Record<string, unknown>);
            }
            const result = (originalMethod as (...args: T) => R).apply(context, args) as R;

            if (typeof model === 'string' && model !== 'unknown' && typeof result === 'object') {
              // We store the model in the result object so that it can be accessed later
              // This is because the model is not passed as a parameter to the chat.sendMessage method
              (result as Record<string, unknown>)[GOOGLE_GENAI_MODEL_PROPERTY] = model;
            }

            // No response attributes for create (returns object of chat instance, not generated content)
            return result;
          } catch (error) {
            captureException(error, {
              mechanism: { handled: false, type: 'auto.ai.google_genai', data: { function: methodPath } },
            });
            throw error;
          }
        },
      ) as R;
    }

    // Async/content-producing path
    return startSpan(
      {
        name: `${operationName} ${model}`,
        op: getSpanOperation(methodPath),
        attributes: requestAttributes,
      },
      async (span: Span) => {
        try {
          if (finalOptions.recordInputs && args[0] && typeof args[0] === 'object') {
            addPrivateRequestAttributes(span, args[0] as Record<string, unknown>);
          }

          const result = await Promise.resolve((originalMethod as (...args: T) => Promise<R>).apply(context, args));
          addResponseAttributes(span, result as GoogleGenAIResponse, finalOptions.recordOutputs);
          return result as R;
        } catch (error) {
          captureException(error, {
            mechanism: { handled: false, type: 'auto.ai.google_genai', data: { function: methodPath } },
          });
          throw error;
        }
      },
    ) as Promise<R>;
  };

  return run;
}

/**
 * Create a deep proxy for Google GenAI client instrumentation
 * Recursively instruments methods and handles special cases like chats.create
 */
function createDeepProxy<T extends object>(target: T, currentPath = '', options?: GoogleGenAIOptions): T {
  return new Proxy(target, {
    get(obj: object, prop: string): unknown {
      const value = (obj as Record<string, unknown>)[prop];
      const methodPath = buildMethodPath(currentPath, String(prop));

      if (typeof value === 'function' && shouldInstrument(methodPath)) {
        // Special case: chats.create is synchronous but needs both instrumentation AND result proxying
        if (methodPath === CHATS_CREATE_METHOD) {
          const instrumentedMethod = instrumentMethod(
            value as (...args: unknown[]) => unknown,
            methodPath,
            obj,
            options,
          );
          return function instrumentedAndProxiedCreate(...args: unknown[]): unknown {
            const result = instrumentedMethod(...args);
            // If the result is an object (like a chat instance), proxy it too
            if (result && typeof result === 'object') {
              return createDeepProxy(result as object, CHAT_PATH, options);
            }
            return result;
          };
        }

        return instrumentMethod(value as (...args: unknown[]) => Promise<unknown>, methodPath, obj, options);
      }

      if (typeof value === 'function') {
        // Bind non-instrumented functions to preserve the original `this` context
        return value.bind(obj);
      }

      if (value && typeof value === 'object') {
        return createDeepProxy(value as object, methodPath, options);
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
  return createDeepProxy(client, '', options);
}
