import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { AnthropicAiOptions, AnthropicAiResponse, IntegrationFn, Span, SpanAttributeValue } from '@sentry/core';
import {
  addAnthropicRequestAttributes,
  addAnthropicResponseAttributes,
  debug,
  defineIntegration,
  extractAnthropicRequestAttributes,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
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

// Same name as the OTel integration by design: when enabled, the OTel 'Anthropic_AI'
// integration is dropped from the default set (see the Node opt-in loader).
const INTEGRATION_NAME = 'Anthropic_AI' as const;

// Distinct from the proxy's `auto.ai.anthropic` so spans from the orchestrion path
// are attributable separately from the OTel/proxy one.
const ORIGIN = 'auto.ai.orchestrion.anthropic';

// `stream` selects how the result finishes the span: `async-iterable` for a `messages.create({ stream: true })`
// `Stream`, `message-stream` for the synchronous `MessageStream` from `messages.stream()`, `none` for a plain
// promise. `methodPath` is only consulted by `extractAnthropicRequestAttributes` to read the model id from a
// string first arg (`models.retrieve`); for the object-bodied calls its value is irrelevant.
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

/**
 * The context object orchestrion shares across the tracing-channel lifecycle hooks: `arguments` is the
 * live args array passed to the instrumented method, and Node's `tracingChannel` attaches `result` when
 * the call settles (the resolved value for a promise, or the synchronous return for `messages.stream()`).
 */
interface AnthropicChannelContext {
  arguments: unknown[];
  result?: unknown;
}

let subscribed = false;

const _anthropicChannelIntegration = ((options: AnthropicAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19, and a second `init()` would double-subscribe.
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
              captureError: () => ({ mechanism: { type: ORIGIN, handled: false } }),
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
  const params = typeof args[0] === 'object' && args[0] !== null ? (args[0] as Record<string, unknown>) : undefined;

  const { recordInputs } = resolveAIRecordingOptions(options);
  const enableTruncation = shouldEnableTruncation(options.enableTruncation);

  const attributes = extractAnthropicRequestAttributes(args, methodPath, operation);
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ORIGIN;
  // `models.retrieve` takes the model id as a string first arg, so read the resolved model from the
  // computed attributes rather than `params.model`.
  const model = (attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] as string) || 'unknown';

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
 * Hand span-ending ownership to the streamed result when there is one, returning `true` so the normal
 * `beforeSpanEnd` path is skipped. Returns `false` for non-streaming results, which end via `beforeSpanEnd`.
 *
 * - `async-iterable`: a `messages.create({ stream: true })` resolves to a `Stream` the caller consumes
 *   later. We can't swap what `create` returns, but the `Stream` in `data.result` is the same instance the
 *   caller holds and `asyncEnd` fires before the caller iterates — so we patch its async iterator in place
 *   to run through `instrumentAsyncIterableStream`, which accumulates the streamed attributes and ends the
 *   span when iteration finishes. Only a streaming call resolves to an async-iterable.
 * - `message-stream`: `messages.stream()` returns a synchronous `MessageStream` emitter;
 *   `instrumentMessageStream` attaches `'message'`/`'error'` listeners that finish the span.
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
 * EXPERIMENTAL — orchestrion-driven Anthropic integration. Subscribes to the `orchestrion:@anthropic-ai/sdk:*`
 * diagnostics_channels injected into the SDK's chat (`messages`/`completions`/beta `messages`), `models`, and
 * `messages.stream()` methods, so it requires the orchestrion runtime hook or bundler plugin.
 */
export const anthropicChannelIntegration = defineIntegration(_anthropicChannelIntegration);
