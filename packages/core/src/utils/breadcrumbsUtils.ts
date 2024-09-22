import type { SeverityLevel } from '@sentry/types';

/**
 * Determine a breadcrumb's log level (only `warning` or `error`) based on the response status code
 * @param statusCode
 */
export function getBreadcrumbLogLevel(statusCode: number | undefined): { level?: SeverityLevel } {
  if (statusCode === undefined) {
    return {};
  } else if (statusCode >= 400 && statusCode < 500) {
    return { level: 'warning' };
  } else if (statusCode >= 500) {
    return { level: 'error' };
  } else {
    return {};
  }
}
