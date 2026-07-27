import { GEN_AI_REQUEST_MODEL } from '@sentry/conventions/attributes';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { AnthropicAiOptions, AnthropicAiResponse, IntegrationFn, Span, SpanAttributeValue } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  addAnthropicRequestAttributes,
  addAnthropicResponseAttributes,
  debug,
  defineIntegration,
  extractAnthropicRequestAttributes,
  instrumentAsyncIterableStream,
  instrumentMessageStream,
  resolveAIRecordingOptions,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  shouldEnableTruncation,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// Same name as the OTel integration by design, so the OTel 'Anthropic_AI'
// integration is deduplicated out of the default set.
const INTEGRATION_NAME = 'Anthropic_AI' as const;

// Distinct from the proxy's `auto.ai.anthropic` so spans from the orchestrion path
// are attributable separately from the OTel/proxy one.
const ORIGIN = 'auto.ai.orchestrion.anthropic';

// `stream` determines how the span is ended
const INSTRUMENTED_CHANNELS = [
  { channel: CHANNELS.ANTHROPIC_CHAT, operation: 'chat', methodPath: 'messages.create', stream: 'async-iterable' },
  { channel: CHANNELS.ANTHROPIC_MODELS, operation: 'models', methodPath: 'models.retrieve', stream: 'none' },
  {
    channel: CHANNELS.ANTHROPIC_MESSAGES_STREAM,
    operation: 'chat',
    methodPath: 'messages.stream',
    stream: 'message-stream',
  },
] as const;

type StreamMode = (typeof INSTRUMENTED_CHANNELS)[number]['stream'];

interface AnthropicChannelContext {
  arguments: unknown[];
  result?: unknown;
}

let subscribed = false;

const _anthropicIntegration = ((options: AnthropicAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // tracingChannel is unavailable before Node 18.19 and prevent double-subscribe
      if (!diagnosticsChannel.tracingChannel || subscribed) {
        return;
      }
      subscribed = true;

      // `bindTracingChannelToSpan` needs the async-context binding that `initOpenTelemetry()` registers
      // after `setupOnce` runs, so wait for it before subscribing.
      waitForTracingChannelBinding(() => {
        for (const { channel, operation, methodPath, stream } of INSTRUMENTED_CHANNELS) {
          DEBUG_BUILD && debug.log(`[orchestrion:anthropic] subscribing to channel "${channel}"`);
          bindTracingChannelToSpan(
            diagnosticsChannel.tracingChannel<AnthropicChannelContext>(channel),
            data => createGenAiSpan(data, operation, methodPath, options),
            {
              beforeSpanEnd: (span, data) => {
                addAnthropicResponseAttributes(
                  span,
                  data.result as AnthropicAiResponse,
                  resolveAIRecordingOptions(options).recordOutputs,
                );
              },
              deferSpanEnd: ({ span, data }) => wrapStreamResult(span, data, stream, options),
            },
          );
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Build the span for an instrumented call.
 * Returning `undefined` opts the payload out so no span is opened.
 */
function createGenAiSpan(
  data: AnthropicChannelContext,
  operation: string,
  methodPath: string,
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
  const enableTruncation = shouldEnableTruncation(options.enableTruncation);

  const attributes = extractAnthropicRequestAttributes(args, methodPath, operation);
  const model = (attributes[GEN_AI_REQUEST_MODEL] as string) || 'unknown';
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ORIGIN;

  const span = startInactiveSpan({
    name: `${operation} ${model}`,
    op: `gen_ai.${operation}`,
    attributes: attributes as Record<string, SpanAttributeValue>,
  });

  if (recordInputs && params) {
    addAnthropicRequestAttributes(span, params, enableTruncation);
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
 * Orchestrion-driven Anthropic integration. Subscribes to the `orchestrion:@anthropic-ai/sdk:*`
 * diagnostics_channels injected into the SDK's chat (`messages`/`completions`/beta `messages`), `models`, and
 * `messages.stream()` methods, so it requires the orchestrion runtime hook or bundler plugin.
 */
export const anthropicIntegration = defineIntegration(_anthropicIntegration);
