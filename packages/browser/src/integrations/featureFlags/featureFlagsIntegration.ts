import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';

import { defineIntegration, getClient, logger } from '@sentry/core';
import { copyFlagsFromScopeToEvent, insertFlagToScope } from '../../utils/featureFlags';
import { DEBUG_BUILD } from '../../debug-build';

/**
 * Sentry integration for buffering feature flags manually with an API, and
 * capturing them on error events. We recommend you do this on each flag
 * evaluation. Flags are buffered per Sentry scope and limited to 100 per event.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import * as Sentry from '@sentry/browser';
 *
 * Sentry.init(..., integrations: [Sentry.featureFlagsIntegration()]);
 *
 * Sentry.addFlag('my-flag', true);
 * Sentry.captureException(Exception('broke')); // 'my-flag' should be captured on this Sentry event.
 * ```
 */
export const featureFlagsIntegration = defineIntegration(() => {
  return {
    name: 'FeatureFlags',

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return copyFlagsFromScopeToEvent(event);
    }
  };
}) as IntegrationFn;


/**
 * Records a flag and its value to be sent on subsequent error events. We
 * recommend you do this on flag evaluations. Flags are buffered per Sentry
 * scope and limited to 100 per event.
 */
export function addFlag(name: string, value: unknown): void {
  const client = getClient();
  if (!client || !client.getIntegrationByName('FeatureFlags')) {
    DEBUG_BUILD && logger.error('Must enable the Feature Flags Integration to use the addFlag function.');
    return;
  }
  insertFlagToScope(name, value);
}
