import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { startSpan, startSpanManual } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import { handleCallbackErrors } from '../../utils/handleCallbackErrors';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { truncateGenAiMessages } from '../ai/messageTruncation';
import type { InstrumentedMethodEntry } from '../ai/utils';
import { buildMethodPath, extractRequestAttributes, extractSystemInstructions, resolveAIRecordingOptions } from '../ai/utils';
import { CHAT_PATH, CHATS_CREATE_METHOD, GOOGLE_GENAI_METHOD_REGISTRY, GOOGLE_GENAI_SYSTEM_NAME } from './constants';
import { instrumentStream } from './streaming';
import type { Candidate, ContentPart, GoogleGenAIOptions, GoogleGenAIResponse } from './types';
import type { ContentListUnion, ContentUnion, Message, PartListUnion } from './utils';
import { contentUnionToMessages } from './utils';


/**
 * Add private request attributes to spans.
 * This is only recorded if recordInputs is true.
 * Handles different parameter formats for different Google GenAI methods.
 */
function addPrivateRequestAttributes(span: Span, params: Record<string, unknown>): void {
  const messages: Message[] = [];

  // config.systemInstruction: ContentUnion
  if (
    'config' in params &&
    params.config &&
    typeof params.config === 'object' &&
    'systemInstruction' in params.config &&
    params.config.systemInstruction
  ) {
    messages.push(...contentUnionToMessages(params.config.systemInstruction as ContentUnion, 'system'));
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
      span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE, systemInstructions);
    }

    const filteredLength = Array.isArray(filteredMessages) ? filteredMessages.length : 0;
    span.setAttributes({
      [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: filteredLength,
      [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: JSON.stringify(truncateGenAiMessages(filteredMessages as unknown[])),
    });
  }
}

/**
 * Add response attributes from the Google GenAI response
 * @see https://github.com/googleapis/js-genai/blob/v1.19.0/src/types.ts#L2313
 */
function addResponseAttributes(span: Span, response: GoogleGenAIResponse, recordOutputs?: boolean): void {
  if (!response || typeof response !== 'object') return;

  if (response.modelVersion) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, response.modelVersion);
  }

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
  methodPath: string,
  instrumentedMethod: InstrumentedMethodEntry,
  context: unknown,
  options: GoogleGenAIOptions,
): (...args: T) => R | Promise<R> {
  const isSyncCreate = methodPath === CHATS_CREATE_METHOD;

  return new Proxy(originalMethod, {
    apply(target, _, args: T): R | Promise<R> {
      const operationName = instrumentedMethod.operation;
      const params = args[0] as Record<string, unknown> | undefined;
      const requestAttributes = extractRequestAttributes(GOOGLE_GENAI_SYSTEM_NAME, 'auto.ai.google_genai', operationName, args, context);
      const model = requestAttributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] ?? 'unknown';

      // Check if this is a streaming method
      if (instrumentedMethod.streaming) {
        // Use startSpanManual for streaming methods to control span lifecycle
        return startSpanManual(
          {
            name: `${operationName} ${model}`,
            op: `gen_ai.${operationName}`,
            attributes: requestAttributes,
          },
          async (span: Span) => {
            try {
              if (options.recordInputs && params) {
                addPrivateRequestAttributes(span, params);
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
          name: isSyncCreate ? `${operationName} ${model} create` : `${operationName} ${model}`,
          op: `gen_ai.${operationName}`,
          attributes: requestAttributes,
        },
        (span: Span) => {
          if (options.recordInputs && params) {
            addPrivateRequestAttributes(span, params);
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
              // Only add response attributes for content-producing methods, not for chats.create
              if (!isSyncCreate) {
                addResponseAttributes(span, result, options.recordOutputs);
              }
            },
          );
        },
      );
    },
  }) as (...args: T) => R | Promise<R>;
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

      const instrumentedMethod = GOOGLE_GENAI_METHOD_REGISTRY[methodPath as keyof typeof GOOGLE_GENAI_METHOD_REGISTRY];
      if (typeof value === 'function' && instrumentedMethod) {
        // Special case: chats.create is synchronous but needs both instrumentation AND result proxying
        if (methodPath === CHATS_CREATE_METHOD) {
          const wrappedMethod = instrumentMethod(
            value as (...args: unknown[]) => unknown,
            methodPath,
            instrumentedMethod,
            t,
            options,
          );
          return function instrumentedAndProxiedCreate(...args: unknown[]): unknown {
            const result = wrappedMethod(...args);
            // If the result is an object (like a chat instance), proxy it too
            if (result && typeof result === 'object') {
              return createDeepProxy(result, CHAT_PATH, options);
            }
            return result;
          };
        }

        return instrumentMethod(
          value as (...args: unknown[]) => Promise<unknown>,
          methodPath,
          instrumentedMethod,
          t,
          options,
        );
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
 * import { instrumentGoogleGenAIClient } from '@sentry/core';
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
