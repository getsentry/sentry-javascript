import type { SpanStatusType } from '@sentry/core';
import { getActiveTransaction } from '@sentry/core';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';
import { WINDOW } from './types';

/**
 * Add a listener that cancels and finishes a transaction when the global
 * document is hidden.
 */
export function registerBackgroundTabDetection(): void {
  if (WINDOW && WINDOW.document) {
    WINDOW.document.addEventListener('visibilitychange', () => {
      const activeTransaction = getActiveTransaction();
      if (WINDOW.document.hidden && activeTransaction) {
        const statusType: SpanStatusType = 'cancelled';

        DEBUG_BUILD &&
          logger.log(
            `[Tracing] Transaction: ${statusType} -> since tab moved to the background, op: ${activeTransaction.op}`,
          );
        // We should not set status if it is already set, this prevent important statuses like
        // error or data loss from being overwritten on transaction.
        if (!activeTransaction.status) {
          activeTransaction.setStatus(statusType);
        }
        activeTransaction.setTag('visibilitychange', 'document.hidden');
        activeTransaction.end();
      }
    });
  } else {
    DEBUG_BUILD && logger.warn('[Tracing] Could not set up background tab detection due to lack of global document');
  }
}
