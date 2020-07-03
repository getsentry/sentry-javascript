import { getGlobalObject, isInstanceOf, logger, timestampWithMs } from '@sentry/utils';

import { IdleTransaction } from '../../idletransaction';
import { SpanStatus } from '../../spanstatus';

import { getActiveTransaction } from './utils';

const global = getGlobalObject<Window>();

/**
 * Add a listener that cancels and finishes a transaction when the global
 * document is hidden.
 */
export function registerBackgroundTabDetection(): void {
  if (global && global.document) {
    document.addEventListener('visibilitychange', () => {
      const activeTransaction = getActiveTransaction() as IdleTransaction;
      if (document.hidden && activeTransaction) {
        logger.log(`[Tracing] Transaction: ${SpanStatus.Cancelled} -> since tab moved to the background`);
        activeTransaction.setStatus(SpanStatus.Cancelled);
        activeTransaction.setTag('visibilitychange', 'document.hidden');
        if (isInstanceOf(activeTransaction, IdleTransaction)) {
          activeTransaction.finishIdleTransaction(timestampWithMs());
        } else {
          activeTransaction.finish();
        }
      }
    });
  }
}
