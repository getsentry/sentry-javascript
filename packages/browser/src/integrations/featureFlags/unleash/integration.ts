import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';

import { defineIntegration } from '@sentry/core';
import { copyFlagsFromScopeToEvent, insertFlagToScope } from '../../../utils/featureFlags';
import type { IVariant, UnleashClient, UnleashClientClass } from './types';

/**
 * Sentry integration for capturing feature flag evaluations from the Unleash SDK.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import { UnleashClient } from 'unleash-proxy-client';
 * import * as Sentry from '@sentry/browser';
 *
 * const unleashIntegration = Sentry.unleashIntegration(UnleashClient);
 *
 * Sentry.init({
 *   dsn: '___PUBLIC_DSN___',
 *   integrations: [unleashIntegration],
 * });
 *
 * const unleash = new UnleashClient(...);
 * unleash.start();
 *
 * unleash.isEnabled('my-feature');
 * unleash.getVariant('other-feature');
 * Sentry.captureException(new Error('something went wrong'));
 * ```
 */
export const unleashIntegration = defineIntegration((unleashClientClass: UnleashClientClass) => {
  return {
    name: 'Unleash',

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return copyFlagsFromScopeToEvent(event);
    },

    setupOnce() {
      const unleashClientPrototype = unleashClientClass.prototype as UnleashClient;

      const sentryIsEnabled = {
        apply: (
          target: (this: UnleashClient, toggleName: string) => boolean,
          thisArg: UnleashClient,
          args: [toggleName: string],
        ) => {
          const result = Reflect.apply(target, thisArg, args);
          insertFlagToScope(args[0], result);
          return result;
        },
      };
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalIsEnabled = unleashClientPrototype.isEnabled;
      unleashClientPrototype.isEnabled = new Proxy(originalIsEnabled, sentryIsEnabled);

      const sentryGetVariant = {
        apply: (
          target: (this: UnleashClient, toggleName: string) => IVariant,
          thisArg: UnleashClient,
          args: [toggleName: string],
        ) => {
          const variant = Reflect.apply(target, thisArg, args);
          const result = variant.feature_enabled || false; // undefined means the feature does not exist.
          insertFlagToScope(args[0], result);
          return variant;
        },
      };
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalGetVariant = unleashClientPrototype.getVariant;
      unleashClientPrototype.getVariant = new Proxy(originalGetVariant, sentryGetVariant);
    },
  };
}) satisfies IntegrationFn;
