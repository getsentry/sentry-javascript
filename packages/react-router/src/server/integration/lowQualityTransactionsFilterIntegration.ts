import type { Client, IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';

const LOW_QUALITY_TRANSACTIONS_REGEXES = [
  /GET \/node_modules\//,
  /GET \/favicon\.ico/,
  /GET \/@id\//,
  /GET \/__manifest\?/,
];

// TODO(v11): Remove the `_options` parameter (unused and only kept for back-compat with the previous signature)
const _lowQualityTransactionsFilterIntegration = ((_options?: NodeOptions) => ({
  name: 'LowQualityTransactionsFilter',
  beforeSetup(client) {
    const opts = client.getOptions();
    opts.ignoreSpans = [...(opts.ignoreSpans || []), ...LOW_QUALITY_TRANSACTIONS_REGEXES];
  },
})) satisfies IntegrationFn;

/**
 * Integration that filters out noisy http transactions such as requests to node_modules, favicon.ico, @id/, __manifest.
 * Adds regex entries to `ignoreSpans` so the filter applies in both static and streaming trace lifecycles.
 */
export const lowQualityTransactionsFilterIntegration = defineIntegration(_lowQualityTransactionsFilterIntegration);
