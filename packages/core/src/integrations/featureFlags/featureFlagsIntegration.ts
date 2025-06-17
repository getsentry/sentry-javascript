import { type Client } from '../../client';
import { defineIntegration } from '../../integration';
import { type Event, type EventHint } from '../../types-hoist/event';
import { type Integration, type IntegrationFn } from '../../types-hoist/integration';
import {
  _INTERNAL_addFeatureFlagToActiveSpan,
  _INTERNAL_copyFlagsFromScopeToEvent,
  _INTERNAL_insertFlagToScope,
} from '../../utils/featureFlags';

export interface FeatureFlagsIntegration extends Integration {
  addFeatureFlag: (name: string, value: unknown) => void;
}

/**
 * Sentry integration for buffering feature flag evaluations manually with an API, and
 * capturing them on error events and spans.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import * as Sentry from '@sentry/browser';
 * import { type FeatureFlagsIntegration } from '@sentry/browser';
 *
 * // Setup
 * Sentry.init(..., integrations: [Sentry.featureFlagsIntegration()])
 *
 * // Verify
 * const flagsIntegration = Sentry.getClient()?.getIntegrationByName<FeatureFlagsIntegration>('FeatureFlags');
 * if (flagsIntegration) {
 *   flagsIntegration.addFeatureFlag('my-flag', true);
 * } else {
 *   // check your setup
 * }
 * Sentry.captureException(Exception('broke')); // 'my-flag' should be captured to this Sentry event.
 * ```
 */
export const featureFlagsIntegration = defineIntegration(() => {
  return {
    name: 'FeatureFlags',

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return _INTERNAL_copyFlagsFromScopeToEvent(event);
    },

    addFeatureFlag(name: string, value: unknown): void {
      _INTERNAL_insertFlagToScope(name, value);
      _INTERNAL_addFeatureFlagToActiveSpan(name, value);
    },
  };
}) as IntegrationFn<FeatureFlagsIntegration>;
