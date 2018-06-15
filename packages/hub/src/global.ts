import { Hub } from './hub';
import { Carrier } from './interfaces';

/**
 * API compatibility version of this hub.
 *
 * WARNING: This number should only be incresed when the global interface
 * changes a and new methods are introduced.
 */
export const API_VERSION = 2;

/** Global interface helper for type safety. */
interface Global {
  __SENTRY__: Carrier;
}

declare var global: Global;

global.__SENTRY__ = global.__SENTRY__ || {
  hub: undefined,
};

/** Returns the global shim registry. */
export function getGlobalCarrier(): Carrier {
  return global.__SENTRY__;
}

/**
 * Returns the latest global hum instance.
 *
 * If a hub is already registered in the global carrier but this module
 * contains a more recent version, it replaces the registered version.
 * Otherwise, the currently registered hub will be returned.
 */
export function getGlobalHub(): Hub {
  const registry = getGlobalCarrier();

  if (!registry.hub || registry.hub.isOlderThan(API_VERSION)) {
    registry.hub = new Hub();
  }

  return registry.hub;
}

/**
 * This will create a new {@link Hub} and add to the passed object on
 * __SENTRY__.hub.
 * @param carrier object
 */
export function getHubFromCarrier(carrier: any): Hub {
  if (carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub) {
    return carrier.__SENTRY__.hub;
  } else {
    carrier.__SENTRY__ = {};
    carrier.__SENTRY__.hub = new Hub();
    return carrier.__SENTRY__.hub;
  }
}
