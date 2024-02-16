import { getMainCarrier } from '@sentry/core';
import type { Hub } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';

/**
 * Calls global extension method and binding current instance to the function call
 */
// @ts-expect-error Function lacks ending return statement and return type does not include 'undefined'. ts(2366)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function callExtensionMethod<T>(hub: Hub, method: string, ...args: any[]): T {
  const carrier = getMainCarrier();
  const sentry = carrier.__SENTRY__ || {};

  if (sentry.extensions && typeof sentry.extensions[method] === 'function') {
    return sentry.extensions[method].apply(hub, args);
  }
  DEBUG_BUILD && logger.warn(`Extension method ${method} couldn't be found, doing nothing.`);
}
