import { URL_PATH } from '@sentry/conventions/attributes';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';

const LOW_QUALITY_TRANSACTIONS_FILTERS = [
  /GET \/node_modules\//,
  /GET \/favicon\.ico/,
  /GET \/@id\//,
  // The span description for the `__manifest` endpoint is `GET *` (`http.route` resolves to `*`).
  // Filter by `url.path` instead, which carries the raw request path.
  { attributes: { [URL_PATH]: /\/__manifest/ } },
];

const _lowQualityTransactionsFilterIntegration = (() => ({
  name: 'LowQualityTransactionsFilter' as const,
  beforeSetup(client) {
    const opts = client.getOptions();
    opts.ignoreSpans = [...(opts.ignoreSpans || []), ...LOW_QUALITY_TRANSACTIONS_FILTERS];
  },
})) satisfies IntegrationFn;

/**
 * Integration that filters out noisy http transactions such as requests to node_modules, favicon.ico, @id/, __manifest.
 * Adds entries to `ignoreSpans` so the filter applies in both static and streaming trace lifecycles.
 */
export const lowQualityTransactionsFilterIntegration = defineIntegration(_lowQualityTransactionsFilterIntegration);
