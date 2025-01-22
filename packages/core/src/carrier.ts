import type { AsyncContextStack } from './asyncContext/stackStrategy';
import type { AsyncContextStrategy } from './asyncContext/types';
import type { Scope } from './scope';
import type { Logger } from './utils-hoist/logger';
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

/**
 * IMPORTANT - This must be updated if any breaking changes are made to the 'SentryCarrier' interface.
 */
const CARRIER_VERSION = '9';

export interface SentryCarrier {
  acs?: AsyncContextStrategy;
  stack?: AsyncContextStack;

  globalScope?: Scope;
  defaultIsolationScope?: Scope;
  defaultCurrentScope?: Scope;
  logger?: Logger;

  /** Overwrites TextEncoder used in `@sentry/core`, need for `react-native@0.73` and older */
  encodePolyfill?: (input: string) => Uint8Array;
  /** Overwrites TextDecoder used in `@sentry/core`, need for `react-native@0.73` and older */
  decodePolyfill?: (input: Uint8Array) => string;
}

/**
 * Returns the global shim registry.
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
  __SENTRY__.version = __SENTRY__.version || CARRIER_VERSION;

  // Intentionally populating and returning the version of "this" SDK instance
  // rather than what's set in .version so that "this" SDK always gets its carrier
  return (__SENTRY__[CARRIER_VERSION] = __SENTRY__[CARRIER_VERSION] || {});
}

/**
 * Returns a global singleton contained in the global `__SENTRY__[]` object.
 *
 * If the singleton doesn't already exist in `__SENTRY__`, it will be created using the given factory
 * function and added to the `__SENTRY__` object.
 *
 * @param name name of the global singleton on __SENTRY__
 * @param creator creator Factory function to create the singleton if it doesn't already exist on `__SENTRY__`
 * @param obj (Optional) The global object on which to look for `__SENTRY__`, if not `GLOBAL_OBJ`'s return value
 * @returns the singleton
 */
export function getGlobalSingleton<Prop extends keyof SentryCarrier>(
  name: Prop,
  creator: () => NonNullable<SentryCarrier[Prop]>,
  obj = GLOBAL_OBJ,
): NonNullable<SentryCarrier[Prop]> {
  const __SENTRY__ = (obj.__SENTRY__ = obj.__SENTRY__ || {});
  const carrier = (__SENTRY__[CARRIER_VERSION] = __SENTRY__[CARRIER_VERSION] || {});
  // Note: We do not want to set `carrier.version` here, as this may be called before any `init` is called, e.g. for the default scopes
  return carrier[name] || (carrier[name] = creator());
}
