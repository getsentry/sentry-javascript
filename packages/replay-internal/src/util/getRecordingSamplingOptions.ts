import { GLOBAL_OBJ } from '@sentry/core';

const NAVIGATOR = GLOBAL_OBJ.navigator;

/**
 *  Disable sampling mousemove events on iOS browsers as this can cause blocking the main thread
 *  https://github.com/getsentry/sentry-javascript/issues/14534
 */
export function getRecordingSamplingOptions(): Partial<{ sampling: { mousemove: boolean } }> {
  if (
    /iPhone|iPad|iPod/i.test((NAVIGATOR && NAVIGATOR.userAgent) || '') ||
    (/Macintosh/i.test((NAVIGATOR && NAVIGATOR.userAgent) || '') &&
      NAVIGATOR &&
      NAVIGATOR.maxTouchPoints &&
      NAVIGATOR.maxTouchPoints > 1)
  ) {
    return {
      sampling: {
        mousemove: false,
      },
    };
  }

  return {};
}
