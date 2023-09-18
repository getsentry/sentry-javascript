import { captureException, withScope } from '@sentry/core';
import { addExceptionMechanism, isNodeEnv, isString } from '@sentry/utils';

import { isRouteErrorResponse } from '../utils/vendor/response';

/**
 * Captures an error that is thrown inside a Remix ErrorBoundary.
 *
 * @param error The error to capture.
 * @returns void
 */
export function captureRemixErrorBoundaryError(error: unknown): string | undefined {
  let eventId: string | undefined;
  const isClientSideRuntimeError = !isNodeEnv() && error instanceof Error;
  const isRemixErrorResponse = isRouteErrorResponse(error);
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
          handled: false,
          data: eventData,
        });
        return event;
      });

      if (isRemixErrorResponse) {
        if (isString(error.data)) {
          eventId = captureException(error.data);
        } else if (error.statusText) {
          eventId = captureException(error.statusText);
        } else {
          eventId = captureException(error);
        }
      } else {
        eventId = captureException(error);
      }
    });
  }

  return eventId;
}
