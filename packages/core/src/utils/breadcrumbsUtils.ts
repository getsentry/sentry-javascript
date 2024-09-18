import type { Breadcrumb } from '@sentry/types';

/**
 * Set a Fetch/XHR breadcrumb's log level based on the returned status code
 * @param breadcrumb
 */
export function assignBreadcrumbLogLevel(breadcrumb: Breadcrumb): Breadcrumb {
  const statusCode = breadcrumb.data?.status_code;
  if (typeof statusCode !== 'number') {
    return breadcrumb;
  }

  if (statusCode >= 400 && statusCode < 500) {
    breadcrumb.level = 'warning';
  } else if (statusCode >= 500) {
    breadcrumb.level = 'error';
  }

  return breadcrumb;
}
