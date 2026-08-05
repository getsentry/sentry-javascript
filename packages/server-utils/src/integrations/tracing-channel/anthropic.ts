import { GEN_AI_REQUEST_MODEL } from '@sentry/conventions/attributes';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span, SpanAttributeValue } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';
import { resolveAIRecordingOptions } from '../../ai/core/utils';
import { addPrivateRequestAttributes, addResponseAttributes, extractRequestAttributes } from '../../ai/anthropic-ai';
import { instrumentAsyncIterableStream, instrumentMessageStream } from '../../ai/anthropic-ai/streaming';
import type { AnthropicAiOptions, AnthropicAiResponse } from '../../ai/anthropic-ai/types';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import { anthropicAiModuleNames } from '../../orchestrion/config/anthropic-ai';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';

// Same name as the OTel integration by design, so the OTel 'Anthropic_AI'
// integration is deduplicated out of the default set.
const INTEGRATION_NAME = 'Anthropic_AI' as const;

const ORIGIN = 'auto.ai.anthropic';

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

const _anthropicIntegration = ((options: AnthropicAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, anthropicAiModuleNames, instrumentAnthropic, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentAnthropic(options: AnthropicAiOptions): void {
  for (const { channel, operation, methodPath, stream } of INSTRUMENTED_CHANNELS) {
    bindTracingChannelToSpan(
      diagnosticsChannel.tracingChannel<AnthropicChannelContext>(channel),
      data => createGenAiSpan(data, operation, methodPath, options),
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
}

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

  const attributes = extractRequestAttributes(args, methodPath, operation);
  const model = (attributes[GEN_AI_REQUEST_MODEL] as string) || 'unknown';
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ORIGIN;

  const span = startInactiveSpan({
    name: `${operation} ${model}`,
    op: `gen_ai.${operation}`,
    attributes: attributes as Record<string, SpanAttributeValue>,
  });

  if (recordInputs && params) {
    addPrivateRequestAttributes(span, params);
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
