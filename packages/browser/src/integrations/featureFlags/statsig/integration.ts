import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';

import { defineIntegration } from '@sentry/core';
import { copyFlagsFromScopeToEvent, insertFlagToScope } from '../../../utils/featureFlags';
import type { FeatureGate, StatsigClient } from './types';

/**
 * Sentry integration for capturing feature flag evaluations from the Statsig js-client SDK.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import { StatsigClient } from '@statsig/js-client';
 * import * as Sentry from '@sentry/browser';
 *
 * const statsigClient = new StatsigClient();
 *
 * Sentry.init({
 *   dsn: '___PUBLIC_DSN___',
 *   integrations: [Sentry.statsigIntegration({featureFlagClient: statsigClient})],
 * });
 *
 * await statsigClient.initializeAsync();  // or statsigClient.initializeSync();
 *
 * const result = statsigClient.checkGate('my-feature-gate');
 * Sentry.captureException(new Error('something went wrong'));
 * ```
 */
export const statsigIntegration = defineIntegration(
  ({ featureFlagClient: statsigClient }: { featureFlagClient: StatsigClient }) => {
    return {
      name: 'Statsig',

      processEvent(event: Event, _hint: EventHint, _client: Client): Event {
        return copyFlagsFromScopeToEvent(event);
      },

      setup() {
        statsigClient.on('gate_evaluation', (event: { gate: FeatureGate }) => {
          insertFlagToScope(event.gate.name, event.gate.value);
        });
      },
    };
  },
) satisfies IntegrationFn;
