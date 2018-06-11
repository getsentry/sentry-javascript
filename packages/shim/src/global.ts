import { Carrier, Layer } from './interfaces';

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
