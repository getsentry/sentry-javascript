import { createFetchIntegration } from '@sentry/core';

/**
 * Creates spans and attaches tracing headers to fetch requests on WinterCG runtimes.
 */
export const winterCGFetchIntegration = createFetchIntegration({
  name: 'WinterCGFetch',
  spanOrigin: 'auto.http.wintercg_fetch',
});
