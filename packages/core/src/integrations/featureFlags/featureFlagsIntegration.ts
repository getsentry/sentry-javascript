import { type Client } from '../../client';
import { defineIntegration } from '../../integration';
import { type Event, type EventHint } from '../../types-hoist/event';
import { type Integration, type IntegrationFn } from '../../types-hoist/integration';
import { type Span } from '../../types-hoist/span';
import {
  bufferSpanFeatureFlag,
  copyFlagsFromScopeToEvent,
  freezeSpanFeatureFlags,
  insertFlagToScope,
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
 * import * as Sentry from '@sentry/*'; //TODO:
 * import { type FeatureFlagsIntegration } from '@sentry/*';
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

    setup(client: Client) {
      client.on('spanEnd', (span: Span) => {
        freezeSpanFeatureFlags(span);
      });
    },

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return copyFlagsFromScopeToEvent(event);
    },

    addFeatureFlag(name: string, value: unknown): void {
      insertFlagToScope(name, value);
      bufferSpanFeatureFlag(name, value);
    },
  };
}) as IntegrationFn<FeatureFlagsIntegration>;
