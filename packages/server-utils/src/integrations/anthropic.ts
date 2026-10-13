import { GEN_AI_REQUEST_MODEL, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn, Span, SpanAttributeValue } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  defineIntegration,
  getActiveSpan,
  getClient,
  hasSpanStreamingEnabled,
  startInactiveSpan,
} from '@sentry/core';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../ai/core/utils';
import { wrapApiPromiseResponse } from '../ai/core/apiPromise';
import { addPrivateRequestAttributes, addResponseAttributes, extractRequestAttributes } from '../ai/anthropic-ai';
import { instrumentAsyncIterableStream, instrumentMessageStream } from '../ai/anthropic-ai/streaming';
import type { AnthropicAiOptions, AnthropicAiResponse } from '../ai/anthropic-ai/types';
import type { OrchestrionChannelContext } from '../orchestrion/types';
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
      diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(channel),
      data => createGenAiSpan(data, operation, options, stream),
      {
        beforeSpanEnd: (span, data) => {
          addResponseAttributes(
            span,
            data.result as AnthropicAiResponse,
            resolveAIRecordingOptions(options).recordOutputs,
          );
        },
        deferSpanEnd: ({ span, data, end }) =>
          wrapApiPromiseResponse(
            data.result,
            response => {
              data.result = response;
              if (!wrapStreamResult(span, data, stream, options)) {
                end();
              }
            },
            end,
          ) || wrapStreamResult(span, data, stream, options),
      },
    );
  }
}

/**
 * Build the span for an instrumented call.
 * Returning `undefined` opts the payload out so no span is opened.
 */
function createGenAiSpan(
  data: OrchestrionChannelContext,
  operation: string,
  options: AnthropicAiOptions,
  stream: StreamMode,
): Span | undefined {
  const args = data.arguments ?? [];

  // When LangChain (or another provider) is driving the SDK, it records the spans itself and marks this
  // provider as skipped — mirror the OTel integration and don't double-instrument.
  if (_INTERNAL_shouldSkipAiProviderWrapping(INTEGRATION_NAME)) {
    return undefined;
  }

  // `messages.stream()` internally calls the instrumented `messages.create({ stream: true })` tagged with
  // a `stream` helper-method header. The messages-stream channel already covers it, so skip the nested
  // create to avoid a duplicate span. Only the non-beta helper is on that channel, though:
  // `beta.messages.stream()` and the streaming tool runner send the same header with no span covering
  // them, so the header alone is not enough. Skip only while a stream-helper span of ours is active.
  const requestOptions = args[1] as { headers?: unknown } | undefined;
  if (isStreamHelperRequest(requestOptions?.headers) && isInsideStreamHelperSpan()) {
    return undefined;
  }

  const params = typeof args[0] === 'object' && args[0] !== null ? (args[0] as Record<string, unknown>) : undefined;

  const { recordInputs } = resolveAIRecordingOptions(options);

  const attributes = extractRequestAttributes(args, operation, recordInputs);
  const model = (attributes[GEN_AI_REQUEST_MODEL] as string) || 'unknown';
  attributes[SENTRY_ORIGIN] = ORIGIN;
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

  if (stream === 'message-stream') {
    streamHelperSpans.add(span);
  }

  return span;
}

const STREAM_HELPER_METHOD_HEADER = 'x-stainless-helper-method';

/** The spans opened for the messages-stream channel, i.e. for `messages.stream()` calls. */
const streamHelperSpans = new WeakSet<Span>();

/**
 * Whether the active span is one this integration opened for `messages.stream()`. The helper's
 * internal `create` runs inside that span, so this is what tells it apart from the beta helper and
 * the tool runner, which send the same header but are not on the messages-stream channel.
 */
function isInsideStreamHelperSpan(): boolean {
  const activeSpan = getActiveSpan();
  return !!activeSpan && streamHelperSpans.has(activeSpan);
}

/**
 * Whether request options carry the header the SDK's `messages.stream()` helper puts on its internal
 * `create` call. The SDK sent it as `X-Stainless-Helper-Method` up to 0.105 and lowercase since 0.106, and
 * HTTP header names are case-insensitive either way, so match without regard to case. The headers
 * arrive as a plain object; a `Headers` instance is handled for completeness.
 */
function isStreamHelperRequest(headers: unknown): boolean {
  if (!headers || typeof headers !== 'object') {
    return false;
  }

  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(STREAM_HELPER_METHOD_HEADER) === 'stream';
  }

  return Object.entries(headers as Record<string, unknown>).some(
    ([name, value]) => name.toLowerCase() === STREAM_HELPER_METHOD_HEADER && value === 'stream',
  );
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
  data: OrchestrionChannelContext,
  stream: StreamMode,
  options: AnthropicAiOptions,
): boolean {
  const { recordOutputs } = resolveAIRecordingOptions(options);
  const result = data.result;

  if (stream === 'async-iterable' && isAsyncIterable(result)) {
    const iterate = result[Symbol.asyncIterator].bind(result);
    const instrumented = instrumentAsyncIterableStream({ [Symbol.asyncIterator]: iterate }, span, recordOutputs);
    result[Symbol.asyncIterator] = () => instrumented;
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
