import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { type GenAiSpanResult, runGenAiSpanEnd, runGenAiSpanStart } from '../ai/core/span-hooks';
import { resolveGenAiCallRecording } from '../ai/core/utils';
import type { TypeSafeCallInfo, TypeSafeOptions } from '../ai/typesafe';
import { addResponseAttributes, onSystemOneResponse, startDecideSpan } from '../ai/typesafe';
import { TYPESAFE_INTEGRATION_NAME } from '../ai/typesafe/constants';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { CHANNELS } from '../orchestrion/channels';
import { typesafeModuleNames } from '../orchestrion/config/typesafe';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { bindTracingChannelToSpan } from '../tracing-channel';

// The recording decision is made once, when the span starts, in the caller's async context.
type TypeSafeChannelContext = OrchestrionChannelContext & {
  _sentryRecordOutputs?: boolean;
  _sentryOnSpanEnd?: (result: GenAiSpanResult<unknown>) => void;
};

const _typesafeIntegration = ((options: TypeSafeOptions = {}) => {
  return {
    name: TYPESAFE_INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, typesafeModuleNames, instrumentTypeSafe, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentTypeSafe(options: TypeSafeOptions): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<TypeSafeChannelContext>(CHANNELS.TYPESAFE_SYSTEM_ONE),
    data => {
      const request = data.arguments?.[0];
      const call: TypeSafeCallInfo = { request };
      const { recordInputs, recordOutputs } = resolveGenAiCallRecording(options, call);
      data._sentryRecordOutputs = recordOutputs;
      const span = startDecideSpan(request, data.self, recordInputs);
      runGenAiSpanStart(options, span, call);
      data._sentryOnSpanEnd = result => runGenAiSpanEnd(options, span, call, result);
      return span;
    },
    {
      beforeSpanEnd: (span, data) => {
        if ('error' in data) {
          data._sentryOnSpanEnd?.({ error: data.error });
        } else {
          addResponseAttributes(span, data.result, !!data._sentryRecordOutputs);
          data._sentryOnSpanEnd?.({ response: data.result });
        }
      },
      deferSpanEnd: ({ data, end }) =>
        onSystemOneResponse(
          data.result,
          body => {
            data.result = body;
            end();
          },
          error => end(error),
        ),
    },
  );
}

/**
 * Diagnostics-channel-based integration for the TypeSafe SDK (`@typesafe-ai/sdk` >= 0.5.0 < 1).
 * Subscribes to the `orchestrion:@typesafe-ai/sdk:system-one` channel injected into
 * `TypeSafeClient.systemOne`, so it requires the Sentry runtime hook or bundler plugin.
 */
export const typesafeIntegration = defineIntegration(_typesafeIntegration);
