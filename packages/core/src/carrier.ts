import type { AsyncContextStack } from './asyncContext/stackStrategy';
import type { AsyncContextStrategy } from './asyncContext/types';
import type { Client, Integration, MetricsAggregator, Scope } from './types-hoist';
import { SDK_VERSION } from './utils-hoist/version';
import { GLOBAL_OBJ } from './utils-hoist/worldwide';

/**
 * An object that contains globally accessible properties and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: VersionedCarrier;
}

type VersionedCarrier = {
  version?: string;
} & Record<Exclude<string, 'version'>, SentryCarrier>;

interface SentryCarrier {
  acs?: AsyncContextStrategy;
  stack?: AsyncContextStack;

  globalScope?: Scope;
  defaultIsolationScope?: Scope;
  defaultCurrentScope?: Scope;
  globalMetricsAggregators?: WeakMap<Client, MetricsAggregator> | undefined;

  // TODO(v9): Remove these properties - they are no longer used and were left over in v8
  integrations?: Integration[];
  extensions?: {
    // eslint-disable-next-line @typescript-eslint/ban-types
    [key: string]: Function;
  };
}

/**
 * Returns the global shim registry.
 *
 * FIXME: This function is problematic, because despite always returning a valid Carrier,
 * it has an optional `__SENTRY__` property, which then in turn requires us to always perform an unnecessary check
 * at the call-site. We always access the carrier through this function, so we can guarantee that `__SENTRY__` is there.
 **/
export function getMainCarrier(): Carrier {
  // This ensures a Sentry carrier exists
  getSentryCarrier(GLOBAL_OBJ);
  return GLOBAL_OBJ;
}

/** Will either get the existing sentry carrier, or create a new one. */
export function getSentryCarrier(carrier: Carrier): SentryCarrier {
  const __SENTRY__ = (carrier.__SENTRY__ = carrier.__SENTRY__ || {});

  // For now: First SDK that sets the .version property wins
  __SENTRY__.version = __SENTRY__.version || SDK_VERSION;

  // Intentionally populating and returning the version of "this" SDK instance
  // rather than what's set in .version so that "this" SDK always gets its carrier
  return (__SENTRY__[SDK_VERSION] = __SENTRY__[SDK_VERSION] || {});
}
