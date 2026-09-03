import type { MiddlewareError } from './types';

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
