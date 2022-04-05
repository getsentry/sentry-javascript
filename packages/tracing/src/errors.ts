import { addInstrumentationHandler, logger } from '@sentry/utils';

import { IS_DEBUG_BUILD } from './flags';
import { SpanStatusType } from './span';
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
    const status: SpanStatusType = 'internal_error';
    IS_DEBUG_BUILD && logger.log(`[Tracing] Transaction: ${status} -> Global error occured`);
    activeTransaction.setStatus(status);
  }
}
