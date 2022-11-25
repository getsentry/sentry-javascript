import { captureException } from '@sentry/core';

import { isInternal } from './isInternal';

/**
 * Captures exceptions to Sentry only when it occurs on sentry.io
 */
export function captureInternalException(err: Error): void {
  if (!isInternal()) {
    return;
  }

  captureException(err);
}
