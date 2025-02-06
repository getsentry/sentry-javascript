import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';

import { defineIntegration, logger } from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
import { copyFlagsFromScopeToEvent, insertFlagToScope } from '../../../utils/featureFlags';
import type { StatsigClient, FeatureGate } from './types';

/**
 * Sentry integration for capturing feature flag evaluations from the Statsig js-client SDK.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import { StatsigClient } from '';
 * import * as Sentry from '@sentry/browser';
 *
 * const statsigClient = new StatsigClient();
 *
 * Sentry.init({
 *   dsn: '___PUBLIC_DSN___',
 *   integrations: [Sentry.statsigIntegration({statsigClient})],
 * });
 *
 * await statsigClient.initializeAsync();  // or statsigClient.initializeSync();
 *
 * const result = statsigClient.checkGate('my-feature-gate');
 * Sentry.captureException(new Error('something went wrong'));
 * ```
 */
export const statsigIntegration = defineIntegration(
  ({ statsigClient }: { statsigClient: StatsigClient }) => {
    return {
      name: 'Statsig',

      processEvent(event: Event, _hint: EventHint, _client: Client): Event {
        return copyFlagsFromScopeToEvent(event);
      },

      setupOnce() {
        statsigClient.on('gate_evaluation', (event: { gate: FeatureGate }) => {
          try {
            insertFlagToScope(event.gate.name, event.gate.value);
          } catch (error) {
            if (!(error instanceof TypeError)) {
              throw error;
            }

            if (DEBUG_BUILD) {
              logger.error(`[Feature Flags] Error reading Statsig gate evaluation: ${error.message}`);
            }
          }
        });
      },
    };
  },
) satisfies IntegrationFn;
