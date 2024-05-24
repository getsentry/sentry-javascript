import type { Integration, Scope, VersionString } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';
import type { AsyncContextStack } from './asyncContext/stackStrategy';
import type { AsyncContextStrategy } from './asyncContext/types';
import { SDK_VERSION } from './version';

/**
 * An object that contains globally accessible properties and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: VersionedCarrier;
}

type VersionedCarrier = {
  [key: VersionString]: SentryCarrier;
  version?: VersionString;
};

interface SentryCarrier {
  acs?: AsyncContextStrategy;
  /**
   * Extra Hub properties injected by various SDKs
   */
  integrations?: Integration[];
  extensions?: {
    /** Extension methods for the hub, which are bound to the current Hub instance */
    // eslint-disable-next-line @typescript-eslint/ban-types
    [key: string]: Function;
  };
  stack?: AsyncContextStack;

  globalScope?: Scope;
  defaultIsolationScope?: Scope;
  defaultCurrentScope?: Scope;
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
  if (!carrier.__SENTRY__) {
    carrier.__SENTRY__ = {};
  }

  // For now: First SDK that sets the .version property wins
  if (!carrier.__SENTRY__.version) {
    carrier.__SENTRY__.version = SDK_VERSION;
  }

  // Intentionally populating and returning the version of "this" SDK instance
  // rather than what's set in .version so that "this" SDK always gets its carrier
  if (!carrier.__SENTRY__[SDK_VERSION]) {
    carrier.__SENTRY__[SDK_VERSION] = {
      extensions: {},
    };
  }
  return carrier.__SENTRY__[SDK_VERSION];
}
