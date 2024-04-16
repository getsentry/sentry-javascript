import type { Integration } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';
import type { AsyncContextStrategy } from './asyncContext/types';

/**
 * An object that contains a hub and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: SentryCarrier;
}

interface SentryCarrier {
  acs?: AsyncContextStrategy;
}

/**
 * An object that contains a hub and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: SentryCarrier;
}

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
    carrier.__SENTRY__ = {
      extensions: {},
    };
  }
  return carrier.__SENTRY__;
}
