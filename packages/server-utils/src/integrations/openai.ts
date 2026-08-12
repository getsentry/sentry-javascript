import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span, SpanAttributeValue } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../ai/core/utils';
import { addRequestAttributes, extractRequestAttributes } from '../ai/openai';
import { instrumentStream } from '../ai/openai/streaming';
import type { OpenAiOptions } from '../ai/openai/types';
import { addResponseAttributes } from '../ai/openai/utils';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { openaiModuleNames } from '../orchestrion/config/openai';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

// Same name as the OTel integration by design, so the OTel 'OpenAI'
// integration is deduplicated out of the default set.
const INTEGRATION_NAME = 'OpenAI' as const;

const ORIGIN = 'auto.ai.openai';

// Each instrumented `create` method maps to the gen_ai operation its span reports.
const INSTRUMENTED_CHANNELS = [
  { channel: CHANNELS.OPENAI_CHAT, operation: 'chat' },
  { channel: CHANNELS.OPENAI_EMBEDDINGS, operation: 'embeddings' },
] as const;

/**
 * The context object orchestrion shares across the tracing-channel lifecycle hooks: `arguments` is the
 * live args array passed to `Completions.create(body, options)`, and Node's `tracingChannel` attaches
 * `result` when the returned promise settles.
 */
interface OpenAiChatChannelContext {
  arguments: unknown[];
  result?: unknown;
}

const _openaiIntegration = ((options: OpenAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, openaiModuleNames, instrumentOpenai, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentOpenai(options: OpenAiOptions): void {
  for (const { channel, operation } of INSTRUMENTED_CHANNELS) {
    bindTracingChannelToSpan(
      diagnosticsChannel.tracingChannel<OpenAiChatChannelContext>(channel),
      data => createGenAiSpan(data, operation, options),
      {
        beforeSpanEnd: (span, data) => {
          addResponseAttributes(span, data.result, resolveAIRecordingOptions(options).recordOutputs);
        },
        // Streaming: the result is a `Stream` consumed later, so instrument it and let it end the span.
        deferSpanEnd: ({ span, data }) => wrapStreamResult(span, data, options),
      },
    );
  }
}

/**
 * Build the span for an instrumented `create` call.
 * Returning `undefined` opts the payload out so no span is opened.
 */
function createGenAiSpan(data: OpenAiChatChannelContext, operation: string, options: OpenAiOptions): Span | undefined {
  // When another provider (e.g. LangChain) is driving the SDK, it records the spans itself and marks this
  // provider as skipped; skip here to avoid double spans.
  if (_INTERNAL_shouldSkipAiProviderWrapping(INTEGRATION_NAME)) {
    return undefined;
  }

  const args = data.arguments ?? [];
  const params = args[0] as Record<string, unknown> | undefined;

  const { recordInputs } = resolveAIRecordingOptions(options);

  const attributes = extractRequestAttributes(args, operation);
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ORIGIN;
  const model = (params?.model as string) || 'unknown';

  const span = startInactiveSpan({
    name: `${operation} ${model}`,
    op: getGenAiSpanOp(operation),
    attributes: attributes as Record<string, SpanAttributeValue>,
  });

  if (recordInputs && params) {
    addRequestAttributes(span, params, operation);
  }

  return span;
}

type AsyncIterableStream = { [Symbol.asyncIterator]: () => AsyncIterator<unknown> };

function isAsyncIterable(value: unknown): value is AsyncIterableStream {
  return !!value && typeof (value as AsyncIterableStream)[Symbol.asyncIterator] === 'function';
}

/**
 * For a streaming `create({ stream: true })` the result is a `Stream` the caller consumes later. We can't
 * swap what `create` returns, but the `Stream` in `data.result` is the same instance the caller holds and
 * `asyncEnd` fires before the caller iterates — so we patch its async iterator in place to run through
 * `instrumentStream`, which accumulates the streamed attributes and ends the span when iteration finishes.
 * Only a streaming call resolves to an async-iterable, so that check alone distinguishes it. Returns `true`
 * to hand span-ending ownership to `instrumentStream`; `false` for non-streaming/errored results, which end
 * via the normal `beforeSpanEnd` path.
 */
function wrapStreamResult(span: Span, data: OpenAiChatChannelContext, options: OpenAiOptions): boolean {
  const result = data.result;
  if (!isAsyncIterable(result)) {
    return false;
  }

  const { recordOutputs } = resolveAIRecordingOptions(options);
  const iterate = result[Symbol.asyncIterator].bind(result);
  const instrumented = instrumentStream({ [Symbol.asyncIterator]: iterate }, span, recordOutputs ?? false);
  result[Symbol.asyncIterator] = () => instrumented;

  return true;
}

/**
 * Orchestrion-driven OpenAI integration. Subscribes to the `orchestrion:openai:*`
 * diagnostics_channels injected into `openai`'s `create` methods (chat completions, responses, embeddings,
 * conversations), so it requires the orchestrion runtime hook or bundler plugin.
 */
export const openaiIntegration = defineIntegration(_openaiIntegration);
