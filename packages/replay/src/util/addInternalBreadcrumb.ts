import { addBreadcrumb } from '@sentry/core';

import { isInternal } from './isInternal';

/**
 * Wrapper for core SDK's `addBreadcrumb` only when used on `sentry.io`
 */
export function addInternalBreadcrumb(arg: Parameters<typeof addBreadcrumb>[0]): void {
  if (!isInternal()) {
    return;
  }

  const { category, level, message, ...rest } = arg;

  addBreadcrumb({
    category: category || 'console',
    level: level || 'debug',
    message: `[debug]: ${message}`,
    ...rest,
  });
}
