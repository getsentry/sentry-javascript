import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { NodeFetchOptions } from './types';
import { instrumentUndici } from './undici-instrumentation';

const _nativeNodeFetchIntegration = ((options: NodeFetchOptions = {}) => {
  return {
    name: 'NodeFetch' as const,
    setupOnce() {
      instrumentUndici(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrument outgoing fetch requests made through the native node `fetch` API.
 * This emits (depending on the integration options) spans and breadcrumbs, as well as injecting trace propagation headers into the request.
 */
export const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);
