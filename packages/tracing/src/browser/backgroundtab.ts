import { getGlobalObject, logger } from '@sentry/utils';

import { IdleTransaction } from '../idletransaction';
import { SpanStatus } from '../spanstatus';

import { getActiveTransaction } from './utils';

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
        logger.log(`[Tracing] Transaction: ${SpanStatus.Cancelled} -> since tab moved to the background`);
        activeTransaction.setStatus(SpanStatus.Cancelled);
        activeTransaction.setTag('visibilitychange', 'document.hidden');
        activeTransaction.finish();
      }
    });
  } else {
    logger.warn('[Tracing] Could not set up background tab detection due to lack of global document');
  }
}
