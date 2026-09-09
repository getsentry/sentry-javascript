import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span, SpanAttributeValue } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  defineIntegration,
  getClient,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../ai/core/utils';
import { addRequestAttributes, extractRequestAttributes } from '../ai/mistral';
import { instrumentStream } from '../ai/mistral/streaming';
import type { MistralOptions } from '../ai/mistral/types';
import { addResponseAttributes, getModelForSpanName } from '../ai/mistral/utils';
import { CHANNELS } from '../orchestrion/channels';
import { mistralModuleNames } from '../orchestrion/config/mistral';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { bindTracingChannelToSpan } from '../tracing-channel';

const INTEGRATION_NAME = 'Mistral' as const;

const ORIGIN = 'auto.ai.mistral';

// Each instrumented channel maps to the gen_ai operation its span reports.
const INSTRUMENTED_CHANNELS = [
  { channel: CHANNELS.MISTRAL_CHAT, operation: 'chat' },
  { channel: CHANNELS.MISTRAL_EMBEDDINGS, operation: 'embeddings' },
  { channel: CHANNELS.MISTRAL_AGENTS, operation: 'invoke_agent' },
] as const;

/**
 * The context orchestrion shares across the tracing-channel lifecycle hooks: `arguments` is the live
 * args array passed to the SDK method, and Node's `tracingChannel` attaches `result` when it settles.
 */
interface MistralChannelContext {
  arguments: unknown[];
  result?: unknown;
}

const _mistralAIIntegration = ((options: MistralOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, mistralModuleNames, instrumentMistral, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentMistral(options: MistralOptions): void {
  for (const { channel, operation } of INSTRUMENTED_CHANNELS) {
    bindTracingChannelToSpan(
      diagnosticsChannel.tracingChannel<MistralChannelContext>(channel),
      data => createGenAiSpan(data, operation, options),
      {
        beforeSpanEnd: (span, data) => {
          addResponseAttributes(span, data.result, resolveAIRecordingOptions(options).recordOutputs);
        },
        // Streaming: the result is an async-iterable consumed later, so instrument it and let it end the span.
        deferSpanEnd: ({ span, data }) => wrapStreamResult(span, data, options),
      },
    );
  }
}

/**
 * Build the span for an instrumented Mistral call.
 * Returning `undefined` opts the payload out so no span is opened.
 */
function createGenAiSpan(data: MistralChannelContext, operation: string, options: MistralOptions): Span | undefined {
  // When another provider (e.g. LangChain) is driving the SDK, it records the spans itself and marks
  // this provider as skipped; skip here to avoid double spans.
  if (_INTERNAL_shouldSkipAiProviderWrapping(INTEGRATION_NAME)) {
    return undefined;
  }

  const args = data.arguments ?? [];
  const params = args[0] as Record<string, unknown> | undefined;

  const { recordInputs } = resolveAIRecordingOptions(options);

  const attributes = extractRequestAttributes(args, operation);
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ORIGIN;
  const model = getModelForSpanName(params, operation);
  const client = getClient();

  const span = startInactiveSpan({
    // With span streaming, omit the `'unknown'` model sentinel so the name stays low-cardinality.
    name: model !== 'unknown' || !(client && hasSpanStreamingEnabled(client)) ? `${operation} ${model}` : operation,
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
 * For a streaming call the result is an `EventStream` the caller consumes later. We can't swap what the
 * method returns, but the stream in `data.result` is the same instance the caller holds and `asyncEnd`
 * fires before iteration — so we patch its async iterator in place to run through `instrumentStream`,
 * which accumulates streamed attributes and ends the span when iteration finishes. Only a streaming call
 * resolves to an async-iterable, so that check alone distinguishes it. Returns `true` to hand
 * span-ending ownership to `instrumentStream`; `false` for non-streaming/errored results.
 */
function wrapStreamResult(span: Span, data: MistralChannelContext, options: MistralOptions): boolean {
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
 * Diagnostics-channel-based Mistral integration. Subscribes to the `orchestrion:@mistralai/mistralai:*`
 * diagnostics_channels injected into the SDK's chat, embeddings and agents methods, so it requires
 * the Sentry runtime hook or bundler plugin.
 */
export const mistralAIIntegration = defineIntegration(_mistralAIIntegration);
