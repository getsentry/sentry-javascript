import { captureException } from '@sentry/core';

import { isInternal } from './isInternal';

/**
 * Captures exceptions to Sentry only when it occurs on sentry.io
 */
export function captureInternalException(err: Error): string | undefined {
  if (!isInternal()) {
    return;
  }

  captureException(err);
}
