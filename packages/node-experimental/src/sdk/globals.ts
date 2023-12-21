import type { Hub } from '@sentry/types';
import { GLOBAL_OBJ, logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';

import type { AsyncContextStrategy, SentryCarrier } from './types';

/** Update the async context strategy */
export function setAsyncContextStrategy(strategy: AsyncContextStrategy | undefined): void {
  const carrier = getGlobalCarrier();
  carrier.acs = strategy;
}

/**
 * Returns the global shim registry.
 **/
export function getGlobalCarrier(): SentryCarrier {
  GLOBAL_OBJ.__SENTRY__ = GLOBAL_OBJ.__SENTRY__ || {
    extensions: {},
    // For legacy reasons...
    globalEventProcessors: [],
  };

  return GLOBAL_OBJ.__SENTRY__;
}

/**
 * Calls global extension method and binding current instance to the function call
 */
// @ts-expect-error Function lacks ending return statement and return type does not include 'undefined'. ts(2366)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function callExtensionMethod<T>(hub: Hub, method: string, ...args: any[]): T {
  const carrier = getGlobalCarrier();

  if (carrier.extensions && typeof carrier.extensions[method] === 'function') {
    return carrier.extensions[method].apply(hub, args);
  }
  DEBUG_BUILD && logger.warn(`Extension method ${method} couldn't be found, doing nothing.`);
}
