import { getCurrentHub } from '@sentry/hub';

import { IdleTransaction } from '../../idletransaction';
import { Transaction } from '../../transaction';

/**
 *  Grabs active transaction off scope
 */
export function getActiveTransaction(): Transaction | IdleTransaction | undefined {
  const hub = getCurrentHub();
  if (hub) {
    const scope = hub.getScope();
    if (scope) {
      return scope.getTransaction() as Transaction | IdleTransaction | undefined;
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
