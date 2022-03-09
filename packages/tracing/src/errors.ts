import { addInstrumentationHandler, isDebugBuild, logger } from '@sentry/utils';

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
    isDebugBuild() && logger.log(`[Tracing] Transaction: ${status} -> Global error occured`);
    activeTransaction.setStatus(status);
  }
}
