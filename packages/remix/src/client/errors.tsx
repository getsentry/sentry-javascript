import { captureException } from '@sentry/core';
import { isNodeEnv, isString } from '@sentry/utils';

import { isRouteErrorResponse } from '../utils/vendor/response';
import type { ErrorResponse } from '../utils/vendor/types';

/**
 * Captures an error that is thrown inside a Remix ErrorBoundary.
 *
 * @param error The error to capture.
 * @returns void
 */
export function captureRemixErrorBoundaryError(error: unknown): string | undefined {
  let eventId: string | undefined;
  const isClientSideRuntimeError = !isNodeEnv() && error instanceof Error;
  // We only capture `ErrorResponse`s that are 5xx errors.
  const isRemixErrorResponse = isRouteErrorResponse(error) && error.status >= 500;
  // Server-side errors apart from `ErrorResponse`s also appear here without their stacktraces.
  // So, we only capture:
  //    1. `ErrorResponse`s
  //    2. Client-side runtime errors here,
  //    And other server-side errors captured in `handleError` function where stacktraces are available.
  if (isRemixErrorResponse || isClientSideRuntimeError) {
    const eventData = isRemixErrorResponse
      ? {
          function: 'ErrorResponse',
          ...error.data,
        }
      : {
          function: 'ReactError',
        };

    const actualError = isRemixErrorResponse ? getExceptionToCapture(error) : error;
    eventId = captureException(actualError, {
      mechanism: {
        type: 'instrument',
        handled: false,
        data: eventData,
      },
    });
  }

  return eventId;
}

function getExceptionToCapture(error: ErrorResponse): string | ErrorResponse {
  if (isString(error.data)) {
    return error.data;
  }
  if (error.statusText) {
    return error.statusText;
  }

  return error;
}
