import type { Client, ClientOptions, Integration, IntegrationClass, IntegrationFn } from '@sentry/types';
import type { BaseClient } from '../baseclient';
import { convertIntegrationFnToClass } from '../integration';
import { BrowserMetricsAggregator } from './browser-aggregator';

const INTEGRATION_NAME = 'MetricsAggregator';

const metricsAggregatorIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    // TODO v8: Remove this
    setupOnce() {}, // eslint-disable-line @typescript-eslint/no-empty-function
    setup(client: BaseClient<ClientOptions>) {
      client.metricsAggregator = new BrowserMetricsAggregator(client);
    },
  };
}) satisfies IntegrationFn;

/**
 * Enables Sentry metrics monitoring.
 *
 * @experimental This API is experimental and might having breaking changes in the future.
 */
// eslint-disable-next-line deprecation/deprecation
export const MetricsAggregator = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  metricsAggregatorIntegration,
) as IntegrationClass<Integration & { setup: (client: Client) => void }>;
