import { logger } from '@sentry/utils';

import type { IdleTransaction } from '../idletransaction';
import type { SpanStatusType } from '../span';
import { getActiveTransaction } from '../utils';
import { WINDOW } from './types';

/**
 * Add a listener that cancels and finishes a transaction when the global
 * document is hidden.
 */
export function registerBackgroundTabDetection(): void {
  if (WINDOW && WINDOW.document) {
    WINDOW.document.addEventListener('visibilitychange', () => {
      const activeTransaction = getActiveTransaction() as IdleTransaction;
      if (WINDOW.document.hidden && activeTransaction) {
        const statusType: SpanStatusType = 'cancelled';

        __DEBUG_BUILD__ &&
          logger.log(
            `[Tracing] Transaction: ${statusType} -> since tab moved to the background, op: ${activeTransaction.op}`,
          );
        // We should not set status if it is already set, this prevent important statuses like
        // error or data loss from being overwritten on transaction.
        if (!activeTransaction.status) {
          activeTransaction.setStatus(statusType);
        }
        activeTransaction.setTag('visibilitychange', 'document.hidden');
        activeTransaction.finish();
      }
    });
  } else {
    __DEBUG_BUILD__ &&
      logger.warn('[Tracing] Could not set up background tab detection due to lack of global document');
  }
}
