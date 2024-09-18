import type { SeverityLevel } from '@sentry/types';

/**
 * Determine a breadcrumb's log level based on the response status code
 * @param statusCode
 */
export function getBreadcrumbLogLevel(statusCode: number | undefined): SeverityLevel {
  if (statusCode === undefined) {
    return 'info';
  } else if (statusCode >= 400 && statusCode < 500) {
    return 'warning';
  } else if (statusCode >= 500) {
    return 'error';
  } else {
    return 'info';
  }
}
