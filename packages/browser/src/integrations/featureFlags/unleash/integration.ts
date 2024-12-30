import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';

import { defineIntegration } from '@sentry/core';
import { copyFlagsFromScopeToEvent, insertFlagToScope } from '../../../utils/featureFlags';
import type { UnleashClient } from './types';

/**
 * Sentry integration for capturing feature flags from the Unleash SDK.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import * as Sentry from '@sentry/browser';
 * TODO:
 *
 * Sentry.init({
 *   dsn: '___PUBLIC_DSN___',
 *   integrations: [TODO:]
 * });
 * ```
 */
export const unleashIntegration = defineIntegration((openFeatureClient: UnleashClient ) => {
  return {
    name: 'Unleash',

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return copyFlagsFromScopeToEvent(event);
    },

    setupOnce() {
      openFeatureClient.isEnabled = Proxy();
      openFeatureClient.getVariant = Proxy();
    },
  };
}) satisfies IntegrationFn;
