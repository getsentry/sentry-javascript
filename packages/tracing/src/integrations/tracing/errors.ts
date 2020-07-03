import { addInstrumentationHandler } from '@sentry/utils';

import { SpanStatus } from '../../spanstatus';

import { getActiveTransaction } from './utils';

/**
 * Configures global error listeners
 */
export function registerErrorHandlers(): void {
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
    activeTransaction.setStatus(SpanStatus.InternalError);
  }
}
