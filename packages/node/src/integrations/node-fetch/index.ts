import { instrumentUndici } from './undici-instrumentation';
import type { NodeFetchOptions } from './types';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, getClient, hasSpansEnabled } from '@sentry/core';
import type { NodeClient } from '@sentry/node-core';
import { generateInstrumentOnce, SentryNodeFetchInstrumentation } from '@sentry/node-core';
import type { NodeClientOptions } from '../../types';

const INTEGRATION_NAME = 'NodeFetch';

const instrumentSentryNodeFetch = generateInstrumentOnce(
  `${INTEGRATION_NAME}.sentry`,
  SentryNodeFetchInstrumentation,
  (options: NodeFetchOptions) => {
    return options;
  },
);

const _nativeNodeFetchIntegration = ((options: NodeFetchOptions = {}) => {
  return {
    name: 'NodeFetch' as const,
    setupOnce() {
      const instrumentSpans = _shouldInstrumentSpans(options, getClient<NodeClient>()?.getOptions());

      // This is the instrumentation that emits spans & propagates traces for outgoing fetch requests
      if (instrumentSpans) {
        instrumentUndici({
          ignoreOutgoingRequests: options.ignoreOutgoingRequests,
          requestHook: options.requestHook,
          responseHook: options.responseHook,
          headersToSpanAttributes: options.headersToSpanAttributes,
        });
      }

      // This is the Sentry-specific instrumentation that creates breadcrumbs & propagates traces.
      // It must subscribe to the diagnostics channels after the span instrumentation above, so the core
      // trace propagation logic takes precedence. Otherwise, the sentry-trace header may be set multiple times.
      instrumentSentryNodeFetch(options);
    },
  };
}) satisfies IntegrationFn;

export const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);

function _shouldInstrumentSpans(options: NodeFetchOptions, clientOptions: Partial<NodeClientOptions> = {}): boolean {
  // If `spans` is passed in, it takes precedence
  // Else, we by default emit spans, unless `skipOpenTelemetrySetup` is set to `true` or spans are not enabled
  return typeof options.spans === 'boolean'
    ? options.spans
    : !clientOptions.skipOpenTelemetrySetup && hasSpansEnabled(clientOptions);
}
