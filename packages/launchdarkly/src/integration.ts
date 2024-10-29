import type { IntegrationFn } from '@sentry/types';
import type { LDInspectionFlagUsedHandler } from 'launchdarkly-js-client-sdk';
import type { LaunchDarklyOptions } from './types';

/**
 * Sentry integration for capturing feature flags from LaunchDarkly.
 *
 * See the [feature flag documentation](TODO:) for more information.
 *
 * @example
 *
 * ```
 * Sentry.init({
 *   dsn: '__DSN__',
 *   integrations: [Sentry.replayIntegration()],
 * });
 * ```
 */
export const launchDarklyIntegration = ((options?: LaunchDarklyOptions) => {
  const { ldClient } = options;

  return {
    name: 'launchdarkly',

    setup(client) {
      // type is Sentry SDK client

      // pseudo-code
      ldClient.addHandler(FlagUsedHandler());
    },
  };
}) satisfies IntegrationFn;

// https://launchdarkly.github.io/js-client-sdk/interfaces/LDInspectionFlagUsedHandler.html //TODO: rm this link
class FlagUsedHandler implements LDInspectionFlagUsedHandler {
  public name = 'sentry-feature-flag-monitor'; // eslint-disable-line @sentry-internal/sdk/no-class-field-initializers
  public synchronous?: boolean;
  public type = 'flag-used' as const; // eslint-disable-line @sentry-internal/sdk/no-class-field-initializers
  public method(flagKey, flagDetail, context) {
    //TODO:
    return;
  }
}
