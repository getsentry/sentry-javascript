import type { SeverityLevel } from '../types-hoist/severity';

/**
 * Determine a breadcrumb's log level (only `warning` or `error`) based on an HTTP status code.
 */
export function getBreadcrumbLogLevelFromHttpStatusCode(statusCode: number | undefined): SeverityLevel | undefined {
  // NOTE: undefined defaults to 'info' in Sentry
  if (statusCode === undefined) {
    return undefined;
  } else if (statusCode >= 400 && statusCode < 500) {
    return 'warning';
  } else if (statusCode >= 500) {
    return 'error';
  } else {
    return undefined;
  }
}
