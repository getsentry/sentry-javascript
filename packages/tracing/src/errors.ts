import { addInstrumentationHandler, logger } from '@sentry/utils';

import { SpanStatus } from './spanstatus';
import { getActiveTransaction } from './utils';

/**
 * Configures global error listeners
 */
export function registerErrorInstrumentation(): void {
  addInstrumentationHandler('error', errorCallback);
  addInstrumentationHandler('unhandledrejection', errorCallback);
}

/**
 * If an error or unhandled promise occurs, we mark the active transaction as failed
 */
function errorCallback(): void {
  const activeTransaction = getActiveTransaction();
  if (activeTransaction) {
    logger.log(`[Tracing] Transaction: ${SpanStatus.InternalError} -> Global error occured`);
    activeTransaction.setStatus(SpanStatus.InternalError);
  }
}
