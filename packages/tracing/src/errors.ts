import { addInstrumentationHandler, logger } from '@sentry/utils';

import { SpanStatusType } from './span';
import { getActiveTransaction } from './utils';

/**
 * Configures global error listeners
 */
export function registerErrorInstrumentation(): void {
  addInstrumentationHandler({
    callback: errorCallback,
    type: 'error',
  });
  addInstrumentationHandler({
    callback: errorCallback,
    type: 'unhandledrejection',
  });
}

/**
 * If an error or unhandled promise occurs, we mark the active transaction as failed
 */
function errorCallback(): void {
  const activeTransaction = getActiveTransaction();
  if (activeTransaction) {
    const status: SpanStatusType = 'internal_error';
    logger.log(`[Tracing] Transaction: ${status} -> Global error occured`);
    activeTransaction.setStatus(status);
  }
}
