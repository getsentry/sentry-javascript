import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { GenAiOptions } from '../ai/core/utils';
import { resolveAIRecordingOptions } from '../ai/core/utils';
import { addResponseAttributes, onSystemOneResponse, startEvaluateSpan } from '../ai/typesafe';
import { TYPESAFE_INTEGRATION_NAME } from '../ai/typesafe/constants';
import { CHANNELS } from '../orchestrion/channels';
import { typesafeModuleNames } from '../orchestrion/config/typesafe';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { bindTracingChannelToSpan } from '../tracing-channel';

/**
 * The context orchestrion shares across the tracing-channel lifecycle hooks: `arguments` is the live
 * args array passed to `systemOne(request, options)`, `self` the `TypeSafeClient`, and `result` the
 * returned `APIPromise` (replaced by the parsed response body once it arrives). `Sync` tracing keeps
 * orchestrion from calling `.then()` on it, see `orchestrion/config/typesafe.ts`.
 */
interface TypeSafeChannelContext {
  arguments: unknown[];
  self?: unknown;
  result?: unknown;
}

const _typesafeIntegration = ((options: GenAiOptions = {}) => {
  return {
    name: TYPESAFE_INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, typesafeModuleNames, instrumentTypeSafe, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentTypeSafe(options: GenAiOptions): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<TypeSafeChannelContext>(CHANNELS.TYPESAFE_SYSTEM_ONE),
    data => startEvaluateSpan(data.arguments?.[0], data.self, resolveAIRecordingOptions(options).recordInputs),
    {
      beforeSpanEnd: (span, data) => {
        if (!('error' in data)) {
          addResponseAttributes(span, data.result, resolveAIRecordingOptions(options).recordOutputs);
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
