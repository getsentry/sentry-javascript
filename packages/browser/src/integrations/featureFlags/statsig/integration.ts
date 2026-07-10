import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core/browser';
import {
  _INTERNAL_addFeatureFlagToActiveSpan,
  _INTERNAL_copyFlagsFromScopeToEvent,
  _INTERNAL_insertFlagToScope,
  _INTERNAL_insertExperimentsToScope,
  _INTERNAL_addExperimentToActiveSpan,
  _INTERNAL_copyExperimentsFromScopeToEvent,
  defineIntegration,
} from '@sentry/core/browser';
import type { Experiment, FeatureGate, StatsigClient } from './types';

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
  ({
    featureFlagClient: statsigClient,
    includeExperiments = false,
  }: {
    featureFlagClient: StatsigClient;
    includeExperiments?: boolean;
  }) => {
    return {
      name: 'Statsig' as const,

      setup(_client: Client) {
        statsigClient.on('gate_evaluation', (event: { gate: FeatureGate }) => {
          _INTERNAL_insertFlagToScope(event.gate.name, event.gate.value);
          _INTERNAL_addFeatureFlagToActiveSpan(event.gate.name, event.gate.value);
        });
        if (includeExperiments) {
          statsigClient.on('experiment_evaluation', (event: { experiment: Experiment }) => {
            _INTERNAL_insertExperimentsToScope(event.experiment.name, event.experiment.groupName);
            _INTERNAL_addExperimentToActiveSpan(event.experiment.name, event.experiment.groupName);
          });
        }
      },

      processEvent(event: Event, _hint: EventHint, _client: Client): Event {
        const withFlags = _INTERNAL_copyFlagsFromScopeToEvent(event);
        return includeExperiments ? _INTERNAL_copyExperimentsFromScopeToEvent(withFlags) : withFlags;
      },
    };
  },
) satisfies IntegrationFn;
