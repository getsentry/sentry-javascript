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
 * const unleashClient = new UnleashClient(...);
 * unleashClient.isEnabled('my-feature');
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
      const originalIsEnabled = unleashClientPrototype.isEnabled.bind(unleashClientPrototype);
      unleashClientPrototype.isEnabled = new Proxy(originalIsEnabled, sentryIsEnabled);

      const sentryGetVariant = {
        apply: (
          target: (this: UnleashClient, toggleName: string) => IVariant,
          thisArg: UnleashClient,
          args: [toggleName: string],
        ) => {
          const variant = Reflect.apply(target, thisArg, args);
          const result = variant.enabled;
          insertFlagToScope(args[0], result);
          return variant;
        },
      };
      const originalGetVariant = unleashClientPrototype.getVariant.bind(unleashClientPrototype);
      unleashClientPrototype.getVariant = new Proxy(originalGetVariant, sentryGetVariant);
    },
  };
}) satisfies IntegrationFn;
