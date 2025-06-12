import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';
import {
  _INTERNAL_addFeatureFlagToActiveSpan,
  _INTERNAL_copyFlagsFromScopeToEvent,
  _INTERNAL_insertFlagToScope,
  defineIntegration,
} from '@sentry/core';
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

      setup(_client: Client) {
        statsigClient.on('gate_evaluation', (event: { gate: FeatureGate }) => {
          _INTERNAL_insertFlagToScope(event.gate.name, event.gate.value);
          _INTERNAL_addFeatureFlagToActiveSpan(event.gate.name, event.gate.value);
        });
      },

      processEvent(event: Event, _hint: EventHint, _client: Client): Event {
        return _INTERNAL_copyFlagsFromScopeToEvent(event);
      },
    };
  },
) satisfies IntegrationFn;
