import {
  addGlobalErrorInstrumentationHandler,
  addGlobalUnhandledRejectionInstrumentationHandler,
  logger,
} from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { SPAN_STATUS_ERROR } from './spanstatus';
import { getActiveTransaction } from './utils';

let errorsInstrumented = false;

/**  Only exposed for testing */
export function _resetErrorsInstrumented(): void {
  errorsInstrumented = false;
}

/**
 * Configures global error listeners
 */
export function registerErrorInstrumentation(): void {
  if (errorsInstrumented) {
    return;
  }

  errorsInstrumented = true;
  addGlobalErrorInstrumentationHandler(errorCallback);
  addGlobalUnhandledRejectionInstrumentationHandler(errorCallback);
}

/**
 * If an error or unhandled promise occurs, we mark the active transaction as failed
 */
function errorCallback(): void {
  // eslint-disable-next-line deprecation/deprecation
  const activeTransaction = getActiveTransaction();
  if (activeTransaction) {
    const message = 'internal_error';
    DEBUG_BUILD && logger.log(`[Tracing] Transaction: ${message} -> Global error occured`);
    activeTransaction.setStatus({ code: SPAN_STATUS_ERROR, message });
  }
}

// The function name will be lost when bundling but we need to be able to identify this listener later to maintain the
// node.js default exit behaviour
errorCallback.tag = 'sentry_tracingErrorCallback';
