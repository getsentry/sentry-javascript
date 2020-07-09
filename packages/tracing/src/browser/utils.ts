import { getCurrentHub, Hub } from '@sentry/hub';
import { Transaction } from '@sentry/types';

/** Grabs active transaction off scope */
export function getActiveTransaction<T extends Transaction>(hub: Hub = getCurrentHub()): T | undefined {
  if (hub) {
    const scope = hub.getScope();
    if (scope) {
      return scope.getTransaction() as T | undefined;
    }
  }

  return undefined;
}

/**
 * Converts from milliseconds to seconds
 * @param time time in ms
 */
export function msToSec(time: number): number {
  return time / 1000;
}

/**
 * Converts from seconds to milliseconds
 * @param time time in seconds
 */
export function secToMs(time: number): number {
  return time * 1000;
}
