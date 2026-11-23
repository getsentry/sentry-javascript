import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn, Span, SpanAttributeValue } from '@sentry/core';
import { defineIntegration, startInactiveSpan } from '@sentry/core';
import { getGenAiSpanOp, markCancelledIfAborted, resolveGenAiCallRecording } from '../ai/core/utils';
import { type GenAiSpanResult, runGenAiSpanEnd, runGenAiSpanStart } from '../ai/core/span-hooks';
import { addRequestAttributes, extractRequestAttributes } from '../ai/mistral';
import { MISTRAL_INTEGRATION_NAME, MISTRAL_ORIGIN } from '../ai/mistral/constants';
import { instrumentEventStream } from '../ai/mistral/streaming';
import type { MistralCallInfo, MistralOptions } from '../ai/mistral/types';
import { addResponseAttributes, getMistralRequestSignal, getSpanName } from '../ai/mistral/utils';
import { shouldSkipAiProviderSpan } from '../ai/pi-ai/providers';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { CHANNELS } from '../orchestrion/channels';
import { mistralModuleNames } from '../orchestrion/config/mistral';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { bindTracingChannelToSpan } from '../tracing-channel';

const INTEGRATION_NAME = MISTRAL_INTEGRATION_NAME;

// The recording decision is made once, when the span starts, in the caller's async context.
type MistralChannelContext = OrchestrionChannelContext & {
  _sentryRecordOutputs?: boolean;
  _sentryOnSpanEnd?: (result: GenAiSpanResult<unknown>) => void;
};

// Each instrumented channel maps to the gen_ai operation its span reports. Streaming methods publish
// on their own channel, so the span knows it is a stream before the result exists.
const INSTRUMENTED_CHANNELS = [
  { channel: CHANNELS.MISTRAL_CHAT, operation: 'chat', streaming: false },
  { channel: CHANNELS.MISTRAL_CHAT_STREAM, operation: 'chat', streaming: true },
  { channel: CHANNELS.MISTRAL_EMBEDDINGS, operation: 'embeddings', streaming: false },
  { channel: CHANNELS.MISTRAL_AGENTS, operation: 'invoke_agent', streaming: false },
  { channel: CHANNELS.MISTRAL_AGENTS_STREAM, operation: 'invoke_agent', streaming: true },
] as const;

const _mistralAIIntegration = ((options: MistralOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, mistralModuleNames, instrumentMistral, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentMistral(options: MistralOptions): void {
  for (const { channel, operation, streaming } of INSTRUMENTED_CHANNELS) {
    bindTracingChannelToSpan(
      diagnosticsChannel.tracingChannel<MistralChannelContext>(channel),
      data => createGenAiSpan(data, operation, streaming, options),
      {
        beforeSpanEnd: (span, data) => {
          if ('error' in data) {
            markCancelledIfAborted(span, getMistralRequestSignal(data.arguments?.[1]));
          }
          addResponseAttributes(span, data.result, !!data._sentryRecordOutputs);
          data._sentryOnSpanEnd?.('error' in data ? { error: data.error } : { response: data.result });
        },
        // Streaming: the result is an `EventStream` consumed later, so instrument it and let it end the span.
        deferSpanEnd: ({ span, data }) =>
          streaming &&
          instrumentEventStream(
            data.result,
            span,
            !!data._sentryRecordOutputs,
            getMistralRequestSignal(data.arguments?.[1]),
            data._sentryOnSpanEnd,
          ),
      },
    );
  }
}

/**
 * Build the span for an instrumented Mistral call.
 * Returning `undefined` opts the payload out so no span is opened.
 */
function createGenAiSpan(
  data: MistralChannelContext,
  operation: string,
  streaming: boolean,
  options: MistralOptions,
): Span | undefined {
  if (shouldSkipAiProviderSpan(INTEGRATION_NAME)) {
    return undefined;
  }

  const args = data.arguments ?? [];
  const params = args[0] as Record<string, unknown> | undefined;

  const call: MistralCallInfo = { operation, request: params };
  const { recordInputs, recordOutputs } = resolveGenAiCallRecording(options, call);
  data._sentryRecordOutputs = recordOutputs;

  const attributes = extractRequestAttributes(args, operation, recordInputs, streaming);
  attributes[SENTRY_ORIGIN] = MISTRAL_ORIGIN;

  const span = startInactiveSpan({
    name: getSpanName(operation, attributes),
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

/**
 * An integration to instrument @mistralai/mistrailai.
 */
export const mistralAIIntegration = defineIntegration(_mistralAIIntegration);
