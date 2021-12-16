import { getGlobalObject, logger } from '@sentry/utils';

import { FINISH_REASON_TAG, IDLE_TRANSACTION_FINISH_REASONS } from '../constants';
import { IdleTransaction } from '../idletransaction';
import { SpanStatusType } from '../span';
import { getActiveTransaction } from '../utils';

const global = getGlobalObject<Window>();

/**
 * Add a listener that cancels and finishes a transaction when the global
 * document is hidden.
 */
export function registerBackgroundTabDetection(): void {
  if (global && global.document) {
    global.document.addEventListener('visibilitychange', () => {
      const activeTransaction = getActiveTransaction() as IdleTransaction;
      if (global.document.hidden && activeTransaction) {
        const statusType: SpanStatusType = 'cancelled';

        logger.log(
          `[Tracing] Transaction: ${statusType} -> since tab moved to the background, op: ${activeTransaction.op}`,
        );
        // We should not set status if it is already set, this prevent important statuses like
        // error or data loss from being overwritten on transaction.
        if (!activeTransaction.status) {
          activeTransaction.setStatus(statusType);
        }
        activeTransaction.setTag('visibilitychange', 'document.hidden');
        activeTransaction.setTag(FINISH_REASON_TAG, IDLE_TRANSACTION_FINISH_REASONS[2]);
        activeTransaction.finish();
      }
    });
  } else {
    logger.warn('[Tracing] Could not set up background tab detection due to lack of global document');
  }
}
