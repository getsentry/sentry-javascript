import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';

import { defineIntegration } from '@sentry/core';
import { copyFlagsFromScopeToEvent, insertFlagToScope } from '../../../utils/featureFlags';
import type { UnleashClient, UnleashClientClass } from './types';

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
export const unleashIntegration = defineIntegration((unleashClientClass: UnleashClientClass) => {
  return {
    name: 'Unleash',

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return copyFlagsFromScopeToEvent(event);
    },

    setupOnce() {
      const sentryIsEnabled = {
        apply: (
          target: (this: UnleashClient, toggleName: string) => boolean,
          thisArg: UnleashClient,
          args: [toggleName: string]
        ) => {
          const result = Reflect.apply(target, thisArg, args);
          insertFlagToScope(args[0], result);
          return result;
        }
      };
      const unleashClientPrototype = unleashClientClass.prototype as UnleashClient;
      const originalIsEnabled = unleashClientPrototype.isEnabled.bind(unleashClientPrototype);
      unleashClientPrototype.isEnabled = new Proxy(
        originalIsEnabled,
        sentryIsEnabled
      );
    },
  };
}) satisfies IntegrationFn;

