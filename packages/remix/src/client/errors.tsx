import { captureException, withScope } from '@sentry/core';
import { addExceptionMechanism, isNodeEnv, isString } from '@sentry/utils';

import type { ErrorResponse } from '../utils/types';

/**
 * Checks whether the given error is an ErrorResponse.
 * ErrorResponse is when users throw a response from their loader or action functions.
 * This is in fact a server-side error that we capture on the client.
 *
 * @param error The error to check.
 * @returns boolean
 */
function isErrorResponse(error: unknown): error is ErrorResponse {
  return typeof error === 'object' && error !== null && 'status' in error && 'statusText' in error;
}

/**
 * Captures an error that is thrown inside a Remix ErrorBoundary.
 *
 * @param error The error to capture.
 * @returns void
 */
export function captureRemixErrorBoundaryError(error: unknown): void {
  const isClientSideRuntimeError = !isNodeEnv() && error instanceof Error;
  const isRemixErrorResponse = isErrorResponse(error);
  // Server-side errors apart from `ErrorResponse`s also appear here without their stacktraces.
  // So, we only capture:
  //    1. `ErrorResponse`s
  //    2. Client-side runtime errors here,
  //    And other server - side errors in `handleError` function where stacktraces are available.
  if (isRemixErrorResponse || isClientSideRuntimeError) {
    const eventData = isRemixErrorResponse
      ? {
          function: 'ErrorResponse',
          ...error.data,
        }
      : {
          function: 'ReactError',
        };

    withScope(scope => {
      scope.addEventProcessor(event => {
        addExceptionMechanism(event, {
          type: 'instrument',
          handled: true,
          data: eventData,
        });
        return event;
      });

      if (isRemixErrorResponse) {
        if (isString(error.data)) {
          captureException(error.data);
        } else if (error.statusText) {
          captureException(error.statusText);
        } else {
          captureException(error);
        }
      } else {
        captureException(error);
      }
    });
  }
}
