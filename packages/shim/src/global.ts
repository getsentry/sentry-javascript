import { Carrier, Layer } from './interfaces';

/** Global interface helper for type safety. */
interface Global {
  __SENTRY__: Carrier;
}

declare var global: Global;

global.__SENTRY__ = global.__SENTRY__ || {
  hub: undefined,
  stack: [],
};

/** Returns the global shim registry. */
export function getGlobalRegistry(): Carrier {
  return global.__SENTRY__;
}

/** Returns the global stack of scope layers. */
export function getGlobalStack(): Layer[] {
  return global.__SENTRY__.stack;
}
