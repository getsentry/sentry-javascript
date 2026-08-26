import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { startSpan, startSpanManual } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types/span';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_PROMPT_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_K_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import type { InstrumentedMethodEntry } from '../ai/utils';
import {
  resolveAIRecordingOptions,
  setTokenUsageAttributes,
  shouldEnableTruncation,
  wrapPromiseWithMethods,
} from '../ai/utils';
import { ANTHROPIC_METHOD_REGISTRY } from './constants';
import { instrumentAsyncIterableStream, instrumentMessageStream } from './streaming';
import type { AnthropicAiOptions, AnthropicAiResponse, AnthropicAiStreamingEvent, ContentBlock } from './types';
import { handleResponseError, messagesFromParams, setMessagesAttribute } from './utils';

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
  methodPath: string,
  operationName: string,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: operationName,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
  };

  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const params = args[0] as Record<string, unknown>;
    if (params.tools && Array.isArray(params.tools)) {
      attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] = JSON.stringify(params.tools);
    }

    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = params.model ?? 'unknown';
    if ('temperature' in params) attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE] = params.temperature;
    if ('top_p' in params) attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE] = params.top_p;
    if ('stream' in params) attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] = params.stream;
    if ('top_k' in params) attributes[GEN_AI_REQUEST_TOP_K_ATTRIBUTE] = params.top_k;
    if ('frequency_penalty' in params)
      attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE] = params.frequency_penalty;
    if ('max_tokens' in params) attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE] = params.max_tokens;
  } else {
    if (methodPath === 'models.retrieve' || methodPath === 'models.get') {
      // models.retrieve(model-id) and models.get(model-id)
      attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = args[0];
    } else {
      attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = 'unknown';
    }
  }

  return attributes;
}

/**
 * Add private request attributes to spans.
 * This is only recorded if recordInputs is true.
 */
export function addPrivateRequestAttributes(
  span: Span,
  params: Record<string, unknown>,
  enableTruncation: boolean,
): void {
  const messages = messagesFromParams(params);
  setMessagesAttribute(span, messages, enableTruncation);

  if ('prompt' in params) {
    span.setAttributes({ [GEN_AI_PROMPT_ATTRIBUTE]: JSON.stringify(params.prompt) });
  }
}

/**
 * Add content attributes when recordOutputs is enabled
 */
function addContentAttributes(span: Span, response: AnthropicAiResponse): void {
  // Messages.create
  if ('content' in response) {
    if (Array.isArray(response.content)) {
      span.setAttributes({
        [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: response.content
          .map((item: ContentBlock) => item.text)
          .filter(text => !!text)
          .join(''),
      });

      const toolCalls: Array<ContentBlock> = [];

      for (const item of response.content) {
        if (item.type === 'tool_use' || item.type === 'server_tool_use') {
          toolCalls.push(item);
        }
      }
      if (toolCalls.length > 0) {
        span.setAttributes({ [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: JSON.stringify(toolCalls) });
      }
    }
  }
  // Completions.create
  if ('completion' in response) {
    span.setAttributes({ [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: response.completion });
  }
  // Models.countTokens
  if ('input_tokens' in response) {
    span.setAttributes({ [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: JSON.stringify(response.input_tokens) });
  }
}

/**
 * Add basic metadata attributes from the response
 */
function addMetadataAttributes(span: Span, response: AnthropicAiResponse): void {
  if ('id' in response && 'model' in response) {
    span.setAttributes({
      [GEN_AI_RESPONSE_ID_ATTRIBUTE]: response.id,
      [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: response.model,
    });

    if ('usage' in response && response.usage) {
      setTokenUsageAttributes(
        span,
        response.usage.input_tokens,
        response.usage.output_tokens,
        response.usage.cache_creation_input_tokens,
        response.usage.cache_read_input_tokens,
      );
    }
  }
}

/**
 * Add response attributes to spans
 */
export function addResponseAttributes(span: Span, response: AnthropicAiResponse, recordOutputs?: boolean): void {
  if (!response || typeof response !== 'object') return;

  // capture error, do not add attributes if error (they shouldn't exist)
  if ('type' in response && response.type === 'error') {
    handleResponseError(span, response);
    return;
  }

  // Private response attributes that are only recorded if recordOutputs is true.
  if (recordOutputs) {
    addContentAttributes(span, response);
  }

  // Add basic metadata attributes
  addMetadataAttributes(span, response);
}

/**
 * Handle common error catching and reporting for streaming requests
 */
function handleStreamingError(error: unknown, span: Span): never {
  if (span.isRecording()) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
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
  requestAttributes: Record<string, unknown>,
  operationName: string,
  methodPath: string,
  params: Record<string, unknown> | undefined,
  options: AnthropicAiOptions,
  isStreamRequested: boolean,
  isStreamingMethod: boolean,
): R | Promise<R> {
  const model = requestAttributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] ?? 'unknown';
  const spanConfig = {
    name: `${operationName} ${model}`,
    op: `gen_ai.${operationName}`,
    attributes: requestAttributes as Record<string, SpanAttributeValue>,
  };

  // messages.stream() always returns a sync MessageStream, even with stream: true param
  if (isStreamRequested && !isStreamingMethod) {
    let originalResult!: Promise<R>;

    const instrumentedPromise = startSpanManual(spanConfig, (span: Span) => {
      originalResult = target.apply(invocationThis, args) as Promise<R>;

      if (options.recordInputs && params) {
        addPrivateRequestAttributes(span, params, shouldEnableTruncation(options.enableTruncation));
      }

      return (async () => {
        try {
          const result = await originalResult;
          return instrumentAsyncIterableStream(
            result as AsyncIterable<AnthropicAiStreamingEvent>,
            span,
            options.recordOutputs ?? false,
          ) as unknown as R;
        } catch (error) {
          return handleStreamingError(error, span);
        }
      })();
    });

    return wrapPromiseWithMethods(originalResult, instrumentedPromise);
  } else {
    return startSpanManual(spanConfig, span => {
      try {
        if (options.recordInputs && params) {
          addPrivateRequestAttributes(span, params, shouldEnableTruncation(options.enableTruncation));
        }
        // The helper synchronously delegates to `create`; suppress that one internal call so it
        // does not produce a duplicate child span (see the dedup gate in `instrumentMethod`).
        suppressDelegatedCreate = true;
        const messageStream = target.apply(invocationThis, args);
        suppressDelegatedCreate = false;
        return instrumentMessageStream(messageStream, span, options.recordOutputs ?? false);
      } catch (error) {
        suppressDelegatedCreate = false;
        return handleStreamingError(error, span);
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
      const requestAttributes = extractRequestAttributes(args, methodPath, operationName);
      const model = requestAttributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] ?? 'unknown';

      const params = typeof args[0] === 'object' ? (args[0] as Record<string, unknown>) : undefined;
      const isStreamRequested = Boolean(params?.stream);

      if (isStreamRequested || isStreamingMethod) {
        return handleStreamingRequest(
          target,
          invocationThis,
          args,
          requestAttributes,
          operationName,
          methodPath,
          params,
          options,
          isStreamRequested,
          isStreamingMethod,
        );
      }

      let originalResult!: Promise<R>;

      const instrumentedPromise = startSpan(
        {
          name: `${operationName} ${model}`,
          op: `gen_ai.${operationName}`,
          attributes: requestAttributes as Record<string, SpanAttributeValue>,
        },
        span => {
          originalResult = target.apply(invocationThis, args) as Promise<R>;

          if (options.recordInputs && params) {
            addPrivateRequestAttributes(span, params, shouldEnableTruncation(options.enableTruncation));
          }

          return originalResult.then(result => {
            addResponseAttributes(span, result as AnthropicAiResponse, options.recordOutputs);
            return result;
          });
        },
      );

      return wrapPromiseWithMethods(originalResult, instrumentedPromise);
    },
  }) as (...args: T) => R | Promise<R>;
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
  return instrumentClientInPlace(anthropicAiClient, resolveAIRecordingOptions(options));
}
