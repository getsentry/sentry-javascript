import { logger } from '@sentry/core';
import { DEBUG_BUILD } from '../utils/debug-build';

export * from '@sentry/react';

export { init } from './sdk';
export { captureRemixErrorBoundaryError } from './errors';
export { withSentry } from './performance';

// This is a no-op function that does nothing. It's here to make sure that the
// function signature is the same as in the server SDK.
// See issue: https://github.com/getsentry/sentry-javascript/issues/9594
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 *
 */
export async function captureRemixServerException(err: unknown, name: string, request: Request): Promise<void> {
  DEBUG_BUILD &&
    logger.warn(
      '`captureRemixServerException` is a server-only function and should not be called in the browser. ' +
        'This function is a no-op in the browser environment.',
    );
}
