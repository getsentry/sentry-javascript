import { captureException, isNodeEnv } from '@sentry/core';
import { isResponse } from '../utils/vendor/response';

/**
 * Captures an error that is thrown inside a Remix ErrorBoundary.
 *
 * @param error The error to capture.
 * @returns void
 */
export function captureRemixErrorBoundaryError(error: unknown): string | undefined {
  // Server-side errors also appear here without their stacktraces.
  // So, we only capture client-side runtime errors here.
  // ErrorResponses that are 5xx errors captured at loader / action level by `captureRemixRouteError` function,
  // And other server-side errors captured in `handleError` function where stacktraces are available.
  //
  // We don't want to capture:
  // - Response Errors / Objects [They are originated and handled on the server-side]
  // - SSR Errors [They are originated and handled on the server-side]
  // - Anything without a stacktrace [Remix trims the stacktrace of the errors that are thrown on the server-side]
  if (isResponse(error) || isNodeEnv() || !(error instanceof Error)) {
    return;
  }

  return captureException(error, {
    mechanism: {
      type: 'instrument',
      handled: false,
      data: {
        function: 'ReactError',
      },
    },
  });
}
