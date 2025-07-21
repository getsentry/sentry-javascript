import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';
import {
  _INTERNAL_addFeatureFlagToActiveSpan,
  _INTERNAL_copyFlagsFromScopeToEvent,
  _INTERNAL_insertFlagToScope,
  debug,
  defineIntegration,
  fill,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
import type { UnleashClient, UnleashClientClass } from './types';

type UnleashIntegrationOptions = {
  featureFlagClientClass: UnleashClientClass;
};

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
 * Sentry.init({
 *   dsn: '___PUBLIC_DSN___',
 *   integrations: [Sentry.unleashIntegration({featureFlagClientClass: UnleashClient})],
 * });
 *
 * const unleash = new UnleashClient(...);
 * unleash.start();
 *
 * unleash.isEnabled('my-feature');
 * Sentry.captureException(new Error('something went wrong'));
 * ```
 */
export const unleashIntegration = defineIntegration(
  ({ featureFlagClientClass: unleashClientClass }: UnleashIntegrationOptions) => {
    return {
      name: 'Unleash',

      setupOnce() {
        const unleashClientPrototype = unleashClientClass.prototype as UnleashClient;
        fill(unleashClientPrototype, 'isEnabled', _wrappedIsEnabled);
      },

      processEvent(event: Event, _hint: EventHint, _client: Client): Event {
        return _INTERNAL_copyFlagsFromScopeToEvent(event);
      },
    };
  },
) satisfies IntegrationFn;

/**
 * Wraps the UnleashClient.isEnabled method to capture feature flag evaluations. Its only side effect is writing to Sentry scope.
 *
 * This wrapper is safe for all isEnabled signatures. If the signature does not match (this: UnleashClient, toggleName: string, ...args: unknown[]) => boolean,
 * we log an error and return the original result.
 *
 * @param original - The original method.
 * @returns Wrapped method. Results should match the original.
 */
function _wrappedIsEnabled(
  original: (this: UnleashClient, ...args: unknown[]) => unknown,
): (this: UnleashClient, ...args: unknown[]) => unknown {
  return function (this: UnleashClient, ...args: unknown[]): unknown {
    const toggleName = args[0];
    const result = original.apply(this, args);

    if (typeof toggleName === 'string' && typeof result === 'boolean') {
      _INTERNAL_insertFlagToScope(toggleName, result);
      _INTERNAL_addFeatureFlagToActiveSpan(toggleName, result);
    } else if (DEBUG_BUILD) {
      debug.error(
        `[Feature Flags] UnleashClient.isEnabled does not match expected signature. arg0: ${toggleName} (${typeof toggleName}), result: ${result} (${typeof result})`,
      );
    }
    return result;
  };
}
