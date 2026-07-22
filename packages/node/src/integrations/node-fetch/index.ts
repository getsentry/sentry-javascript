import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, getClient, hasSpansEnabled } from '@sentry/core';
import type { NodeClientOptions } from '../../types';
import type { NodeFetchOptions } from './types';
import { instrumentUndici } from './undici-instrumentation';

const _nativeNodeFetchIntegration = ((options: NodeFetchOptions = {}) => {
  return {
    name: 'NodeFetch' as const,
    setupOnce() {
      const clientOptions = getClient()?.getOptions();
      instrumentUndici({
        ...options,
        spans: _shouldInstrumentSpans(options, clientOptions),
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrument outgoing fetch requests made through the native node `fetch` API.
 * This emits (depending on the integration options) spans and breadcrumbs, as well as injecting trace propagation headers into the request.
 */
export const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);

function _shouldInstrumentSpans(options: NodeFetchOptions, clientOptions: Partial<NodeClientOptions> = {}): boolean {
  // If `spans` is passed in, it takes precedence
  // Else, we by default emit spans, unless `skipOpenTelemetrySetup` is set to `true` or spans are not enabled
  return options.spans ?? (!clientOptions.skipOpenTelemetrySetup && hasSpansEnabled(clientOptions));
}
