import type { Carrier } from './../carrier';
import { getMainCarrier, getSentryCarrier } from './../carrier';
import { getStackAsyncContextStrategy } from './stackStrategy';
import type { AsyncContextStrategy } from './types';

/**
 * @private Private API with no semver guarantees!
 *
 * Sets the global async context strategy
 */
export function setAsyncContextStrategy(strategy: AsyncContextStrategy | undefined): void {
  // Get main carrier (global for every environment)
  const registry = getMainCarrier();
  const sentry = getSentryCarrier(registry);
  sentry.acs = strategy;
}

/**
 * Get the current async context strategy.
 * If none has been setup, the default will be used.
 */
export function getAsyncContextStrategy(carrier: Carrier): AsyncContextStrategy {
  const sentry = getSentryCarrier(carrier);

  if (sentry.acs) {
    return sentry.acs;
  }

  // Otherwise, use the default one (stack)
  return getStackAsyncContextStrategy();
}
