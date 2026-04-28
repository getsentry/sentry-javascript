import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';

const LOW_QUALITY_TRANSACTIONS_FILTERS = [
  /GET \/node_modules\//,
  /GET \/favicon\.ico/,
  /GET \/@id\//,
  // The span description for the `__manifest` endpoint is `GET *` (`http.route` resolves to `*`).
  // Filter by `http.target` instead, which carries the raw request path.
  { attributes: { 'http.target': /\/__manifest/ } },
];

// TODO(v11): Remove the `_options` parameter (unused and only kept for back-compat with the previous signature)
const _lowQualityTransactionsFilterIntegration = ((_options?: NodeOptions) => ({
  name: 'LowQualityTransactionsFilter',
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
