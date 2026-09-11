import { createFetchIntegration } from '@sentry/core';

/**
 * Creates spans and attaches tracing headers to fetch requests.
 */
export const fetchIntegration = createFetchIntegration({
  name: 'Fetch',
  spanOrigin: 'auto.http.fetch',
});
