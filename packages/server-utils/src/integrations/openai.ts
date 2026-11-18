import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn, Span, SpanAttributeValue } from '@sentry/core';
import { defineIntegration, getClient, hasSpanStreamingEnabled, startInactiveSpan } from '@sentry/core';
import { getGenAiSpanOp, getRequestSignal, markCancelledIfAborted, resolveGenAiCallRecording } from '../ai/core/utils';
import { addRequestAttributes, extractRequestAttributes } from '../ai/openai';
import { wrapApiPromiseResponse } from '../ai/core/apiPromise';
import { type GenAiSpanResult, runGenAiSpanEnd, runGenAiSpanStart } from '../ai/core/span-hooks';
import { instrumentStream } from '../ai/openai/streaming';
import type { OpenAiCallInfo, OpenAiOptions } from '../ai/openai/types';
import { addResponseAttributes } from '../ai/openai/utils';
import { shouldSkipAiProviderSpan } from '../ai/pi-ai/providers';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { openaiModuleNames } from '../orchestrion/config/openai';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

// The recording decision is made once, when the span starts, in the caller's async context.
type OpenAiChannelContext = OrchestrionChannelContext & {
  _sentryRecordOutputs?: boolean;
  _sentryOnSpanEnd?: (result: GenAiSpanResult<unknown>) => void;
};

// Same name as the OTel integration by design, so the OTel 'OpenAI'
// integration is deduplicated out of the default set.
const INTEGRATION_NAME = 'OpenAI' as const;

const ORIGIN = 'auto.ai.openai';

// Each instrumented `create` method maps to the gen_ai operation its span reports.
const INSTRUMENTED_CHANNELS = [
  { channel: CHANNELS.OPENAI_CHAT, operation: 'chat' },
  { channel: CHANNELS.OPENAI_EMBEDDINGS, operation: 'embeddings' },
  { channel: CHANNELS.OPENAI_DECIDE, operation: 'decide' },
] as const;

const _openAIIntegration = ((options: OpenAiOptions = {}) => {
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
      diagnosticsChannel.tracingChannel<OpenAiChannelContext>(channel),
      data => createGenAiSpan(data, operation, options),
      {
        beforeSpanEnd: (span, data) => {
          if ('error' in data) {
            markCancelledIfAborted(span, getRequestSignal(data.arguments?.[1]));
          }
          addResponseAttributes(span, data.result, !!data._sentryRecordOutputs, operation);
          data._sentryOnSpanEnd?.('error' in data ? { error: data.error } : { response: data.result });
        },
        deferSpanEnd: ({ span, data, end }) =>
          wrapApiPromiseResponse(
            data.result,
            response => {
              data.result = response;
              // stream responses should end only after iteration is completed
              if (!wrapStreamResult(span, data)) {
                end();
              }
            },
            end,
          ) || wrapStreamResult(span, data),
      },
    );
  }
}

/**
 * Build the span for an instrumented `create` call.
 * Returning `undefined` opts the payload out so no span is opened.
 */
function createGenAiSpan(data: OpenAiChannelContext, operation: string, options: OpenAiOptions): Span | undefined {
  if (shouldSkipAiProviderSpan(INTEGRATION_NAME)) {
    return undefined;
  }

  const args = data.arguments ?? [];
  const params = args[0] as Record<string, unknown> | undefined;

  const call: OpenAiCallInfo = { operation, request: params };
  const { recordInputs, recordOutputs } = resolveGenAiCallRecording(options, call);
  data._sentryRecordOutputs = recordOutputs;

  const attributes = extractRequestAttributes(args, operation, recordInputs);
  attributes[SENTRY_ORIGIN] = ORIGIN;
  const model = (params?.model as string) || 'unknown';
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

  runGenAiSpanStart(options, span, call);
  data._sentryOnSpanEnd = result => runGenAiSpanEnd(options, span, call, result);

  return span;
}

type AsyncIterableStream = { [Symbol.asyncIterator]: () => AsyncIterator<unknown> };

function isAsyncIterable(value: unknown): value is AsyncIterableStream {
  return !!value && typeof (value as AsyncIterableStream)[Symbol.asyncIterator] === 'function';
}

/**
 * For a streaming `create({ stream: true })` the result is a `Stream` the caller consumes later. We can't
 * swap what `create` returns, but the `Stream` in `data.result` is the same instance the caller holds and
 * we observe it before the caller iterates — so we patch its async iterator in place to run through
 * `instrumentStream`, which accumulates the streamed attributes and ends the span when iteration finishes.
 * Only a streaming call resolves to an async-iterable, so that check alone distinguishes it. Returns `true`
 * to hand span-ending ownership to `instrumentStream`; `false` for non-streaming/errored results, which end
 * via the normal `beforeSpanEnd` path.
 */
function wrapStreamResult(span: Span, data: OpenAiChannelContext): boolean {
  const result = data.result;
  if (!isAsyncIterable(result)) {
    return false;
  }

  const iterate = result[Symbol.asyncIterator].bind(result);
  const instrumented = instrumentStream(
    { [Symbol.asyncIterator]: iterate },
    span,
    !!data._sentryRecordOutputs,
    data._sentryOnSpanEnd,
  );
  result[Symbol.asyncIterator] = () => instrumented;

  return true;
}

/**
 * Diagnostics-channel-based OpenAI integration. Subscribes to the `orchestrion:openai:*`
 * diagnostics_channels injected into `openai`'s `create` methods (chat completions, responses, embeddings,
 * conversations, decisions), so it requires the Sentry runtime hook or bundler plugin.
 */
export const openAIIntegration = defineIntegration(_openAIIntegration);
