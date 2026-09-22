import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startSpan,
  startSpanManual,
  stringify,
} from '@sentry/core';
import type { Span, SpanAttributeValue } from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
} from '@sentry/conventions/attributes';
import type { InstrumentedMethodEntry } from '../core/utils';
import {
  buildMethodPath,
  extractSystemInstructions,
  getGenAiSpanOp,
  resolveAIRecordingOptions,
  wrapPromiseWithMethods,
} from '../core/utils';
import { GEN_AI_REQUEST_STREAM_ATTRIBUTE } from '../core/gen-ai-attributes';
import { MISTRAL_METHOD_REGISTRY, MISTRAL_ORIGIN, MISTRAL_PROVIDER_NAME } from './constants';
import { instrumentEventStream } from './streaming';
import type { MistralOptions } from './types';
import { addResponseAttributes, extractRequestParameters, getSpanName } from './utils';

/**
 * Serialize tool definitions from request parameters, if present.
 */
function extractToolDefinitions(params: Record<string, unknown>): string | undefined {
  if (!Array.isArray(params.tools) || params.tools.length === 0) {
    return undefined;
  }
  return stringify(params.tools);
}

/**
 * Extract request attributes from method arguments.
 *
 * `streaming` comes from the called method, not the request: v2 streams only through the dedicated
 * `*.stream` methods, and their `stream` request field is optional, so a params-derived value would
 * be missing on most streaming calls.
 */
export function extractRequestAttributes(
  args: unknown[],
  operationName: string,
  recordInputs: boolean,
  streaming: boolean,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    [GEN_AI_PROVIDER_NAME]: MISTRAL_PROVIDER_NAME,
    [GEN_AI_OPERATION_NAME]: operationName,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: MISTRAL_ORIGIN,
    [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: streaming,
  };

  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const params = args[0] as Record<string, unknown>;

    if (operationName === 'invoke_agent' && typeof params.agentId === 'string') {
      attributes[GEN_AI_AGENT_NAME] = params.agentId;
    }

    const tools = recordInputs ? extractToolDefinitions(params) : undefined;
    if (tools) {
      attributes[GEN_AI_TOOL_DEFINITIONS] = tools;
    }

    Object.assign(attributes, extractRequestParameters(params));
  }

  return attributes;
}

/**
 * Record AI request inputs on the span, if recording is enabled.
 */
export function addRequestAttributes(span: Span, params: Record<string, unknown>, operationName: string): void {
  if (operationName === 'embeddings') {
    const input = params.inputs;
    if (input == null || (typeof input === 'string' && input.length === 0) || (Array.isArray(input) && !input.length)) {
      return;
    }
    span.setAttribute(GEN_AI_EMBEDDINGS_INPUT, stringify(input, String));
    return;
  }

  const src = 'messages' in params ? params.messages : undefined;
  if (!src || (Array.isArray(src) && src.length === 0)) {
    return;
  }

  const { systemInstructions, filteredMessages } = extractSystemInstructions(src);
  if (systemInstructions) {
    span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS, systemInstructions);
  }
  span.setAttribute(GEN_AI_INPUT_MESSAGES, stringify(filteredMessages));
}

/**
 * Instrument a single Mistral SDK method with a gen_ai span.
 * @see https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/ai-agents-module/#manual-instrumentation
 */
function instrumentMethod<T extends unknown[], R>(
  originalMethod: (...args: T) => Promise<R>,
  instrumentedMethod: InstrumentedMethodEntry,
  context: unknown,
  options: MistralOptions,
): (...args: T) => Promise<R> {
  return function instrumentedCall(...args: T): Promise<R> {
    const operationName = instrumentedMethod.operation || 'unknown';
    const isStreamRequested = !!instrumentedMethod.streaming;
    const requestAttributes = extractRequestAttributes(args, operationName, !!options.recordInputs, isStreamRequested);

    const params = args[0] as Record<string, unknown> | undefined;

    const spanConfig = {
      name: getSpanName(operationName, requestAttributes),
      op: getGenAiSpanOp(operationName),
      attributes: requestAttributes as Record<string, SpanAttributeValue>,
    };

    if (isStreamRequested) {
      let originalResult!: Promise<R>;

      const instrumentedPromise = startSpanManual(spanConfig, (span: Span) => {
        originalResult = originalMethod.apply(context, args);

        if (options.recordInputs && params) {
          addRequestAttributes(span, params, operationName);
        }

        return originalResult.then(
          result => {
            // Patched in place so the caller keeps the real `EventStream`; `instrumentEventStream`
            // takes over ending the span once the stream is drained.
            if (!instrumentEventStream(result, span, options.recordOutputs ?? false)) {
              span.end();
            }
            return result;
          },
          error => {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            span.end();
            throw error;
          },
        );
      });

      return wrapPromiseWithMethods(originalResult, instrumentedPromise);
    }

    let originalResult!: Promise<R>;

    const instrumentedPromise = startSpan(spanConfig, (span: Span) => {
      originalResult = originalMethod.apply(context, args);

      if (options.recordInputs && params) {
        addRequestAttributes(span, params, operationName);
      }

      return originalResult.then(result => {
        addResponseAttributes(span, result, options.recordOutputs);
        return result;
      });
    });

    return wrapPromiseWithMethods(originalResult, instrumentedPromise);
  };
}

/**
 * Create a deep proxy for Mistral client instrumentation.
 */
function createDeepProxy<T extends object>(target: T, currentPath = '', options: MistralOptions): T {
  return new Proxy(target, {
    get(obj: object, prop: string): unknown {
      const value = (obj as Record<string, unknown>)[prop];
      const methodPath = buildMethodPath(currentPath, String(prop));

      const instrumentedMethod = MISTRAL_METHOD_REGISTRY[methodPath as keyof typeof MISTRAL_METHOD_REGISTRY];
      if (typeof value === 'function' && instrumentedMethod) {
        return instrumentMethod(value as (...args: unknown[]) => Promise<unknown>, instrumentedMethod, obj, options);
      }

      if (typeof value === 'function') {
        // Preserve the original `this` for uninstrumented methods (private class fields).
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
 * Instrument a Mistral client with Sentry tracing.
 * Can be used across Node.js, Cloudflare Workers, and Vercel Edge.
 */
export function instrumentMistralAiClient<T extends object>(client: T, options?: MistralOptions): T {
  return createDeepProxy(client, '', resolveAIRecordingOptions(options));
}
