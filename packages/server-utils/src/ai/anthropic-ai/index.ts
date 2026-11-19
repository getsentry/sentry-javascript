import { getClient, hasSpanStreamingEnabled, startSpan, startSpanManual } from '@sentry/core';
import type { Span, SpanAttributeValue } from '@sentry/core';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_FREQUENCY_PENALTY,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_K,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_TOOL_DEFINITIONS,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_REQUEST_STREAM_ATTRIBUTE } from '../core/gen-ai-attributes';
import { type GenAiSpanResult, runGenAiSpanEnd, runGenAiSpanStart } from '../core/span-hooks';
import type { GenAiOptions, InstrumentedMethodEntry } from '../core/utils';
import {
  getErrorStatus,
  getGenAiSpanOp,
  getRequestSignal,
  resolveGenAiCallRecording,
  wrapPromiseWithMethods,
} from '../core/utils';
import { ANTHROPIC_AI_ORIGIN, ANTHROPIC_METHOD_REGISTRY } from './constants';
import { instrumentAsyncIterableStream, instrumentMessageStream } from './streaming';
import { instrumentSessionToolRunner, instrumentToolRunner, instrumentToolRunnerFactory } from './tool-runner';
import type { AnthropicAiCallInfo, AnthropicAiOptions, AnthropicAiResponse, AnthropicAiStreamingEvent } from './types';
import { addResponseAttributes, getMessagesAttributes, getProviderName, messagesFromParams } from './utils';

// Set only while a streaming helper (e.g. `messages.stream()`) synchronously delegates to the
// underlying `create`. The SDK invokes that internal `create` synchronously, so a plain flag
// suppresses exactly the duplicate delegation and nothing else: a `create` made later from a
// stream event handler runs in a separate async continuation with the flag already cleared.
let suppressDelegatedCreate = false;

// Methods that have already been wrapped, so instrumenting the same client twice is a no-op.
const INSTRUMENTED_METHODS = new WeakSet<object>();

/**
 * Extract request attributes from method arguments
 */
export function extractRequestAttributes(
  args: unknown[],
  operationName: string,
  recordInputs: boolean,
  providerName = 'anthropic',
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    [GEN_AI_PROVIDER_NAME]: providerName,
    [GEN_AI_OPERATION_NAME]: operationName,
    [SENTRY_ORIGIN]: ANTHROPIC_AI_ORIGIN,
  };

  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const params = args[0] as Record<string, unknown>;
    if (recordInputs && params.tools && Array.isArray(params.tools)) {
      attributes[GEN_AI_TOOL_DEFINITIONS] = JSON.stringify(params.tools);
    }

    attributes[GEN_AI_REQUEST_MODEL] = params.model ?? 'unknown';
    if ('temperature' in params) attributes[GEN_AI_REQUEST_TEMPERATURE] = params.temperature;
    if ('top_p' in params) attributes[GEN_AI_REQUEST_TOP_P] = params.top_p;
    if ('stream' in params) attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] = params.stream;
    if ('top_k' in params) attributes[GEN_AI_REQUEST_TOP_K] = params.top_k;
    if ('frequency_penalty' in params) attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY] = params.frequency_penalty;
    if ('max_tokens' in params) attributes[GEN_AI_REQUEST_MAX_TOKENS] = params.max_tokens;
  } else {
    attributes[GEN_AI_REQUEST_MODEL] = 'unknown';
  }

  return attributes;
}

/**
 * Add private request attributes to spans.
 * This is only recorded if recordInputs is true.
 */
export function addPrivateRequestAttributes(span: Span, params: Record<string, unknown>): void {
  const messages = messagesFromParams(params);
  span.setAttributes(getMessagesAttributes(messages));
}

/**
 * Handle common error catching and reporting for streaming requests
 */
function handleStreamingError(
  error: unknown,
  span: Span,
  abortSignal: AbortSignal | undefined,
  onSpanEnd: (result: GenAiSpanResult<unknown>) => void,
): never {
  if (span.isRecording()) {
    span.setStatus(getErrorStatus(abortSignal));
    onSpanEnd({ error });
    span.end();
  }
  throw error;
}

/**
 * Handle streaming cases with common logic
 */
function handleStreamingRequest<T extends unknown[], R>(
  target: (...args: T) => R | Promise<R>,
  invocationThis: unknown,
  args: T,
  spanConfig: { name: string; op: string; attributes: Record<string, SpanAttributeValue> },
  params: Record<string, unknown> | undefined,
  { recordInputs, recordOutputs }: Required<GenAiOptions>,
  isStreamRequested: boolean,
  isStreamingMethod: boolean,
  options: AnthropicAiOptions,
  call: AnthropicAiCallInfo,
): R | Promise<R> {
  const abortSignal = getRequestSignal(args[1]);
  // messages.stream() always returns a sync MessageStream, even with stream: true param
  if (isStreamRequested && !isStreamingMethod) {
    let originalResult!: Promise<R>;

    const instrumentedPromise = startSpanManual(spanConfig, (span: Span) => {
      originalResult = target.apply(invocationThis, args) as Promise<R>;

      if (recordInputs && params) {
        addPrivateRequestAttributes(span, params);
      }
      runGenAiSpanStart(options, span, call);
      const onSpanEnd = (result: GenAiSpanResult<unknown>): void => runGenAiSpanEnd(options, span, call, result);

      return (async () => {
        try {
          const result = await originalResult;
          return instrumentAsyncIterableStream(
            result as AsyncIterable<AnthropicAiStreamingEvent>,
            span,
            recordOutputs,
            onSpanEnd,
          ) as unknown as R;
        } catch (error) {
          return handleStreamingError(error, span, abortSignal, onSpanEnd);
        }
      })();
    });

    return wrapPromiseWithMethods(originalResult, instrumentedPromise);
  } else {
    return startSpanManual(spanConfig, span => {
      const onSpanEnd = (result: GenAiSpanResult<unknown>): void => runGenAiSpanEnd(options, span, call, result);
      try {
        if (recordInputs && params) {
          addPrivateRequestAttributes(span, params);
        }
        runGenAiSpanStart(options, span, call);
        // The helper synchronously delegates to `create`; suppress that one internal call so it
        // does not produce a duplicate child span (see the dedup gate in `instrumentMethod`).
        suppressDelegatedCreate = true;
        const messageStream = target.apply(invocationThis, args);
        suppressDelegatedCreate = false;
        return instrumentMessageStream(messageStream, span, recordOutputs, abortSignal, onSpanEnd);
      } catch (error) {
        suppressDelegatedCreate = false;
        return handleStreamingError(error, span, abortSignal, onSpanEnd);
      }
    });
  }
}

/**
 * Instrument a method with Sentry spans
 * Following Sentry AI Agents Manual Instrumentation conventions
 * @see https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/ai-agents-module/#manual-instrumentation
 */
function instrumentMethod<T extends unknown[], R>(
  originalMethod: (...args: T) => R | Promise<R>,
  methodPath: string,
  instrumentedMethod: InstrumentedMethodEntry,
  context: unknown,
  options: AnthropicAiOptions,
): (...args: T) => R | Promise<R> {
  return new Proxy(originalMethod, {
    apply(target, thisArg, args: T): R | Promise<R> {
      // Preserve the caller's `this` so instrumentation stays transparent: the SDK's methods
      // rely on private fields bound to the real instance, and internal delegation (e.g.
      // `messages.stream()` calling `this.create()`) must resolve against the same object it
      // would on an uninstrumented client. Fall back to the wrap-time owner for unbound calls.
      const invocationThis = thisArg !== undefined ? thisArg : context;

      const isStreamingMethod = instrumentedMethod.streaming === true;

      // If this is the SDK's internal `create` delegation from a streaming helper (e.g.
      // `messages.stream()` invoking `this.create()`), skip instrumentation: the helper span
      // already represents this operation, so a second span would be a duplicate.
      if (!isStreamingMethod && suppressDelegatedCreate) {
        return target.apply(invocationThis, args);
      }

      const operationName = instrumentedMethod.operation || 'unknown';
      const params = typeof args[0] === 'object' && args[0] !== null ? (args[0] as Record<string, unknown>) : undefined;
      const call: AnthropicAiCallInfo = { operation: 'chat', request: params };
      const recording = resolveGenAiCallRecording(options, call);
      const requestAttributes = extractRequestAttributes(
        args,
        operationName,
        recording.recordInputs,
        getProviderName(invocationThis),
      );
      const model = requestAttributes[GEN_AI_REQUEST_MODEL] || 'unknown';
      const client = getClient();
      // With span streaming, omit the `'unknown'` model sentinel so the name stays low-cardinality.
      const spanConfig = {
        name:
          (typeof model === 'string' && model !== 'unknown') || !(client && hasSpanStreamingEnabled(client))
            ? `${operationName} ${model}`
            : operationName,
        op: getGenAiSpanOp(operationName),
        attributes: requestAttributes as Record<string, SpanAttributeValue>,
      };

      const isStreamRequested = Boolean(params?.stream);

      if (isStreamRequested || isStreamingMethod) {
        return handleStreamingRequest(
          target,
          invocationThis,
          args,
          spanConfig,
          params,
          recording,
          isStreamRequested,
          isStreamingMethod,
          options,
          call,
        );
      }

      const abortSignal = getRequestSignal(args[1]);
      let originalResult!: Promise<R>;

      const instrumentedPromise = startSpan(spanConfig, span => {
        originalResult = target.apply(invocationThis, args) as Promise<R>;

        if (recording.recordInputs && params) {
          addPrivateRequestAttributes(span, params);
        }
        runGenAiSpanStart(options, span, call);

        return originalResult.then(
          result => {
            addResponseAttributes(span, result as AnthropicAiResponse, recording.recordOutputs);
            runGenAiSpanEnd(options, span, call, { response: result });
            return result;
          },
          error => {
            span.setStatus(getErrorStatus(abortSignal));
            runGenAiSpanEnd(options, span, call, { error });
            throw error;
          },
        );
      });

      return wrapPromiseWithMethods(originalResult, instrumentedPromise);
    },
  });
}

/**
 * Instrument the Anthropic client's methods in place.
 *
 * We deliberately do not wrap the client in a Proxy. The Anthropic SDK relies on private class
 * fields (`this.#field`), which are invisible to a Proxy and throw if a method runs with a
 * proxied `this`. Wrapping the registered methods in place (as own properties shadowing the
 * prototype) keeps `this` bound to the real instance, so instrumentation stays observationally
 * transparent: internal delegation (e.g. `messages.stream()` calling `this.create()`) and
 * `instanceof` checks behave exactly as on an uninstrumented client, and non-instrumented
 * methods are left untouched.
 */
function instrumentClientInPlace<T extends object>(client: T, options: AnthropicAiOptions): T {
  for (const methodPath of Object.keys(ANTHROPIC_METHOD_REGISTRY) as Array<keyof typeof ANTHROPIC_METHOD_REGISTRY>) {
    const segments = methodPath.split('.');
    const methodName = segments.pop() as string;

    let owner = client as Record<string, unknown> | undefined;
    for (const segment of segments) {
      owner = owner?.[segment] as Record<string, unknown> | undefined;
    }

    if (!owner || typeof owner[methodName] !== 'function') {
      continue;
    }

    const originalMethod = owner[methodName] as (...args: unknown[]) => unknown;
    if (INSTRUMENTED_METHODS.has(originalMethod)) {
      continue;
    }

    const instrumented = instrumentMethod(
      originalMethod,
      methodPath,
      ANTHROPIC_METHOD_REGISTRY[methodPath],
      owner,
      options,
    );
    INSTRUMENTED_METHODS.add(instrumented);
    owner[methodName] = instrumented;
  }

  const beta = (client as { beta?: { messages?: object; sessions?: { events?: object } } }).beta;
  if (beta?.messages) {
    instrumentToolRunnerFactory(beta.messages, instrumentToolRunner, options);
  }
  if (beta?.sessions?.events) {
    instrumentToolRunnerFactory(beta.sessions.events, instrumentSessionToolRunner, options);
  }

  return client;
}

/**
 * Instrument an Anthropic AI client with Sentry tracing
 * Can be used across Node.js, Cloudflare Workers, and Vercel Edge
 *
 * @template T - The type of the client that extends object
 * @param client - The Anthropic AI client to instrument
 * @param options - Optional configuration for recording inputs and outputs
 * @returns The instrumented client with the same type as the input
 */
export function instrumentAnthropicAiClient<T extends object>(anthropicAiClient: T, options?: AnthropicAiOptions): T {
  return instrumentClientInPlace(anthropicAiClient, options ?? {});
}
