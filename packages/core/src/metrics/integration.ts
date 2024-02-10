import type { Client, ClientOptions, Integration, IntegrationClass, IntegrationFn } from '@sentry/types';
import type { BaseClient } from '../baseclient';
import { convertIntegrationFnToClass, defineIntegration } from '../integration';

// TODO (v8): Remove this entire file

const INTEGRATION_NAME = 'MetricsAggregator';

const _metricsAggregatorIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    // TODO v8: Remove this
    setupOnce() {}, // eslint-disable-line @typescript-eslint/no-empty-function
    setup(_client: BaseClient<ClientOptions>) {
      //
    },
  };
}) satisfies IntegrationFn;

/**
 * @deprecated An integration is no longer required to use the metrics feature
 */
export const metricsAggregatorIntegration = defineIntegration(_metricsAggregatorIntegration);

/**
 * Enables Sentry metrics monitoring.
 *
 * @experimental This API is experimental and might having breaking changes in the future.
 * @deprecated An integration is no longer required to use the metrics feature
 */
// eslint-disable-next-line deprecation/deprecation
export const MetricsAggregator = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  // eslint-disable-next-line deprecation/deprecation
  metricsAggregatorIntegration,
) as IntegrationClass<Integration & { setup: (client: Client) => void }>;
