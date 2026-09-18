import { GEN_AI_REQUEST_MODEL } from '@sentry/conventions/attributes';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span, SpanAttributeValue } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  defineIntegration,
  getActiveSpan,
  getClient,
  hasSpanStreamingEnabled,
  isObjectLike,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../ai/core/utils';
import { addPrivateRequestAttributes, addResponseAttributes, extractRequestAttributes } from '../ai/anthropic-ai';
import type { RawSseBodyHandle } from '../ai/anthropic-ai/streaming';
import {
  instrumentAsyncIterableStream,
  instrumentMessageStream,
  instrumentRawSseBody,
} from '../ai/anthropic-ai/streaming';
import type { AnthropicAiOptions, AnthropicAiResponse } from '../ai/anthropic-ai/types';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { anthropicAiModuleNames } from '../orchestrion/config/anthropic-ai';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

// Same name as the OTel integration by design, so the OTel 'Anthropic_AI'
// integration is deduplicated out of the default set.
const INTEGRATION_NAME = 'Anthropic_AI' as const;

const ORIGIN = 'auto.ai.anthropic';

// `stream` determines how the span is ended
const INSTRUMENTED_CHANNELS = [
  { channel: CHANNELS.ANTHROPIC_CHAT, operation: 'chat', stream: 'async-iterable' },
  {
    channel: CHANNELS.ANTHROPIC_MESSAGES_STREAM,
    operation: 'chat',
    stream: 'message-stream',
  },
] as const;

type StreamMode = (typeof INSTRUMENTED_CHANNELS)[number]['stream'];

interface AnthropicChannelContext {
  arguments: unknown[];
  result?: unknown;
}

// Spans opened for `messages.create({ stream: true })`, i.e. the ones whose stream is drained through
// the SDK's `Stream`. `messages.stream()` spans are excluded: `instrumentMessageStream` already owns
// when those end, so the raw-body wrapper must keep its hands off them.
const asyncIterableStreamSpans = new WeakSet<Span>();

// The `Stream` a raw-body wrapper was installed for, so the iterator path can claim the span.
const rawSseBodyHandles = new WeakMap<object, RawSseBodyHandle>();

const _anthropicAIIntegration = ((options: AnthropicAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, anthropicAiModuleNames, instrumentAnthropic, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentAnthropic(options: AnthropicAiOptions): void {
  for (const { channel, operation, stream } of INSTRUMENTED_CHANNELS) {
    bindTracingChannelToSpan(
      diagnosticsChannel.tracingChannel<AnthropicChannelContext>(channel),
      data => createGenAiSpan(data, operation, stream, options),
      {
        beforeSpanEnd: (span, data) => {
          addResponseAttributes(
            span,
            data.result as AnthropicAiResponse,
            resolveAIRecordingOptions(options).recordOutputs,
          );
        },
        deferSpanEnd: ({ span, data }) => wrapStreamResult(span, data, stream, options),
      },
    );
  }

  subscribeToSseStream(options);
}

/**
 * Wrap the raw `Response` behind every SSE stream so the span ends no matter how the caller drains it.
 *
 * `Stream.fromSSEResponse` runs inside the traced `messages.create` call, so the active span here is
 * the `gen_ai` span that call opened — that is what links a response to its span, since nothing on the
 * `Stream` the SDK hands back points at the `Response` it was built from.
 */
function subscribeToSseStream(options: AnthropicAiOptions): void {
  const { recordOutputs } = resolveAIRecordingOptions(options);

  diagnosticsChannel.tracingChannel<AnthropicChannelContext>(CHANNELS.ANTHROPIC_SSE_STREAM).end.subscribe(message => {
    const data = message as AnthropicChannelContext;
    const span = getActiveSpan();
    const stream = data.result;
    const response = data.arguments?.[0];
    if (!span || !asyncIterableStreamSpans.has(span) || !isObjectLike(stream) || !isObjectLike(response)) {
      return;
    }

    const handle = instrumentRawSseBody(response, span, recordOutputs);
    if (handle) {
      rawSseBodyHandles.set(stream, handle);
    }
  });
}

/**
 * Build the span for an instrumented call.
 * Returning `undefined` opts the payload out so no span is opened.
 */
function createGenAiSpan(
  data: AnthropicChannelContext,
  operation: string,
  stream: StreamMode,
  options: AnthropicAiOptions,
): Span | undefined {
  const args = data.arguments ?? [];

  // When LangChain (or another provider) is driving the SDK, it records the spans itself and marks this
  // provider as skipped — mirror the OTel integration and don't double-instrument.
  if (_INTERNAL_shouldSkipAiProviderWrapping(INTEGRATION_NAME)) {
    return undefined;
  }

  // `messages.stream()` internally calls the instrumented `messages.create({ stream: true })` tagged with
  // an `X-Stainless-Helper-Method: 'stream'` header. The messages-stream channel already covers it, so skip
  // the nested create to avoid a duplicate span.
  const requestOptions = args[1] as { headers?: Record<string, unknown> } | undefined;
  if (requestOptions?.headers?.['X-Stainless-Helper-Method'] === 'stream') {
    return undefined;
  }

  const params = typeof args[0] === 'object' && args[0] !== null ? (args[0] as Record<string, unknown>) : undefined;

  const { recordInputs } = resolveAIRecordingOptions(options);

  const attributes = extractRequestAttributes(args, operation, recordInputs);
  const model = (attributes[GEN_AI_REQUEST_MODEL] as string) || 'unknown';
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ORIGIN;
  const client = getClient();

  const span = startInactiveSpan({
    // With span streaming, omit the `'unknown'` model sentinel so the name stays low-cardinality.
    name: model !== 'unknown' || !(client && hasSpanStreamingEnabled(client)) ? `${operation} ${model}` : operation,
    op: getGenAiSpanOp(operation),
    attributes: attributes as Record<string, SpanAttributeValue>,
  });

  if (recordInputs && params) {
    addPrivateRequestAttributes(span, params);
  }

  if (stream === 'async-iterable') {
    asyncIterableStreamSpans.add(span);
  }

  return span;
}

type AsyncIterableStream = { [Symbol.asyncIterator]: () => AsyncIterator<unknown> };
type MessageStreamEmitter = { on: (...args: unknown[]) => void };

function isAsyncIterable(value: unknown): value is AsyncIterableStream {
  return !!value && typeof (value as AsyncIterableStream)[Symbol.asyncIterator] === 'function';
}

function isMessageStream(value: unknown): value is MessageStreamEmitter {
  return !!value && typeof (value as MessageStreamEmitter).on === 'function';
}

/**
 * Hand span-ending ownership to a streamed result: returns `true` to skip the normal `beforeSpanEnd`,
 * `false` for non-streaming results (which end via `beforeSpanEnd`).
 *
 * - `async-iterable`: patch the `Stream`'s async iterator in place so `instrumentAsyncIterableStream` ends
 *   the span when iteration finishes.
 * - `message-stream`: `instrumentMessageStream` attaches `'message'`/`'error'` listeners that end the span.
 */
function wrapStreamResult(
  span: Span,
  data: AnthropicChannelContext,
  stream: StreamMode,
  options: AnthropicAiOptions,
): boolean {
  const { recordOutputs } = resolveAIRecordingOptions(options);
  const result = data.result;

  if (stream === 'async-iterable' && isAsyncIterable(result)) {
    const handle = rawSseBodyHandles.get(result);
    const iterate = result[Symbol.asyncIterator].bind(result);
    const instrumented = instrumentAsyncIterableStream({ [Symbol.asyncIterator]: iterate }, span, recordOutputs);
    result[Symbol.asyncIterator] = () => {
      handle?.claim();
      return instrumented;
    };
    return true;
  }

  if (stream === 'message-stream' && isMessageStream(result)) {
    instrumentMessageStream(result, span, recordOutputs);
    return true;
  }

  return false;
}

/**
 * Diagnostics-channel-based Anthropic integration. Subscribes to the `orchestrion:@anthropic-ai/sdk:*`
 * diagnostics_channels injected into the SDK's chat (`messages`/`completions`/beta `messages`) and
 * `messages.stream()` methods, so it requires the Sentry runtime hook or bundler plugin.
 */
export const anthropicAIIntegration = defineIntegration(_anthropicAIIntegration);
