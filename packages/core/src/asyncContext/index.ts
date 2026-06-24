import type { Carrier } from './../carrier';
import { getMainCarrier, getSentryCarrier } from './../carrier';
import type { Scope } from './../scope';
import { _setSpanForScope } from './../utils/spanOnScope';
import { getStackAsyncContextStrategy } from './stackStrategy';
import type { AsyncContextStrategy, TracingChannelBinding } from './types';

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

/**
 * Get the runtime binding needed to connect tracing channels to async context.
 */
export function getTracingChannelBinding(): TracingChannelBinding | undefined {
  return getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.();
}

/**
 * Build the default {@link TracingChannelBinding} shared by AsyncLocalStorage-based strategies.
 *
 * The ALS instance is supplied by the caller (kept as `unknown`).
 * The binding clones the current scope, plants the span on it, and reuses the existing isolation scope.
 *
 * The OpenTelemetry strategy does not use this: its store value is an OTel context, not a
 * `{ scope, isolationScope }` pair.
 */
export function _INTERNAL_createTracingChannelBinding(
  asyncLocalStorage: unknown,
  getScopes: () => { scope: Scope; isolationScope: Scope },
): TracingChannelBinding {
  return {
    asyncLocalStorage,
    getStoreWithActiveSpan: span => {
      const { scope, isolationScope } = getScopes();
      const activeScope = scope.clone();
      _setSpanForScope(activeScope, span);

      return { scope: activeScope, isolationScope };
    },
  };
}
