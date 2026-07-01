import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, getClient, hasSpansEnabled } from '@sentry/core';
import type { NodeClient } from '@sentry/node-core';
import type { NodeClientOptions } from '../../types';
import type { NodeFetchOptions } from './types';
import { instrumentUndici } from './undici-instrumentation';

const _nativeNodeFetchIntegration = ((options: NodeFetchOptions = {}) => {
  return {
    name: 'NodeFetch' as const,
    setupOnce() {
      const spans = _shouldInstrumentSpans(options, getClient<NodeClient>()?.getOptions());

      // This single instrumentation emits spans (when `spans` is enabled), records breadcrumbs, and
      // propagates traces for outgoing fetch/undici requests.
      instrumentUndici({ ...options, spans });
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
