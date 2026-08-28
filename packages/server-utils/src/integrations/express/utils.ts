import type { ExpressShouldHandleError, MiddlewareError } from './types';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, the OTel 'Express' integration is omitted from the default set.
export const INTEGRATION_NAME = 'Express' as const;

function getStatusCodeFromResponse(error: MiddlewareError): number {
  const statusCode = error.status || error.statusCode || error.status_code || error.output?.statusCode;
  return statusCode ? parseInt(statusCode as string, 10) : 500;
}

/**
 * Default function deciding whether an error should be sent to Sentry: captures
 * 5xx errors, and treats an error without a resolvable status as a 500. Errors
 * carrying a 3xx/4xx status are skipped (client errors / redirects).
 */
export function defaultShouldHandleError(error: MiddlewareError): boolean {
  return getStatusCodeFromResponse(error) >= 500;
}

/**
 * Apply the configured `shouldHandleError`: `false` turns capture off entirely, a function replaces
 * the gate, and `undefined` falls back to {@link defaultShouldHandleError}. Both the integration and
 * the deprecated middleware go through here, so they always agree.
 */
export function shouldCaptureError(
  shouldHandleError: ExpressShouldHandleError | undefined,
  error: MiddlewareError,
): boolean {
  if (shouldHandleError === false) {
    return false;
  }

  return (shouldHandleError ?? defaultShouldHandleError)(error);
}
