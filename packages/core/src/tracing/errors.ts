/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  addGlobalErrorInstrumentationHandler,
  addGlobalUnhandledRejectionInstrumentationHandler,
  logger,
  stringMatchesSomePattern,
} from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { getActiveSpan, getRootSpan } from '../utils/spanUtils';
import { getClient } from '../currentScopes';
import { SPAN_STATUS_ERROR } from './spanstatus';
import { HandlerDataError } from '@sentry/types';

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
function errorCallback(error: any): void {
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan && getRootSpan(activeSpan);
  if (rootSpan) {
    if (_isIgnoredError(error)) {
      DEBUG_BUILD && logger.log('[Tracing] Root span: Global error occured then ignored');
      return;
    }

    const message = 'internal_error';
    DEBUG_BUILD && logger.log(`[Tracing] Root span: ${message} -> Global error occured`);
    rootSpan.setStatus({ code: SPAN_STATUS_ERROR, message });
  }
}

function _isIgnoredError(error: any): boolean {
  if (!error) {
    return false;
  }

  const errorMessage = _errorMessage(error);

  const client = getClient();
  if (!client) {
    return false;
  }

  const options = client.getOptions();
  if (!options) {
    return false;
  }

  return stringMatchesSomePattern(errorMessage, options.ignoreErrors);
}

function _errorMessage(error: any): string {
  return String((error as HandlerDataError).msg || (error as Error).message || error);
}

// The function name will be lost when bundling but we need to be able to identify this listener later to maintain the
// node.js default exit behaviour
errorCallback.tag = 'sentry_tracingErrorCallback';
