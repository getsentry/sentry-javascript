import {
  addGlobalErrorInstrumentationHandler,
  addGlobalUnhandledRejectionInstrumentationHandler,
  logger,
} from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { getActiveSpan, getRootSpan } from '../utils/spanUtils';
import { SPAN_STATUS_ERROR } from './spanstatus';

let errorsInstrumented = false;

/**  Only exposed for testing */
export function _resetErrorsInstrumented(): void {
  errorsInstrumented = false;
}

/**
 * Ensure that global errors automatically set the active span status.
 */
export function registerSpanErrorInstrumentation(): void {
  if (errorsInstrumented) {
    return;
  }

  errorsInstrumented = true;
  addGlobalErrorInstrumentationHandler(errorCallback);
  addGlobalUnhandledRejectionInstrumentationHandler(errorCallback);
}

/**
 * If an error or unhandled promise occurs, we mark the active root span as failed
 */
function errorCallback(): void {
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan && getRootSpan(activeSpan);
  if (rootSpan) {
    const message = 'internal_error';
    DEBUG_BUILD && logger.log(`[Tracing] Root span: ${message} -> Global error occured`);
    rootSpan.setStatus({ code: SPAN_STATUS_ERROR, message });
  }
}

// The function name will be lost when bundling but we need to be able to identify this listener later to maintain the
// node.js default exit behaviour
errorCallback.tag = 'sentry_tracingErrorCallback';
