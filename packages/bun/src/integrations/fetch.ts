import { createFetchIntegration } from '@sentry/core';

/**
 * Instruments outgoing `fetch` requests in Bun: creates spans, records breadcrumbs and
 * attaches trace propagation headers.
 */
export const fetchIntegration = createFetchIntegration({
  name: 'Fetch',
  spanOrigin: 'auto.http.fetch',
});
