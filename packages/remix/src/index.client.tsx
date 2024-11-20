import { applySdkMetadata } from '@sentry/core';
import { logger } from '@sentry/core';
import { init as reactInit } from '@sentry/react';
import type { Client } from '@sentry/types';
import { DEBUG_BUILD } from './utils/debug-build';
import type { RemixOptions } from './utils/remixOptions';
export { captureRemixErrorBoundaryError } from './client/errors';
export { withSentry } from './client/performance';

export { browserTracingIntegration } from './client/browserTracingIntegration';

// This is a no-op function that does nothing. It's here to make sure that the
// function signature is the same as in the server SDK.
// See issue: https://github.com/getsentry/sentry-javascript/issues/9594
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function captureRemixServerException(
  err: unknown,
  name: string,
  request: Request,
  isRemixV2?: boolean,
): Promise<void> {
  DEBUG_BUILD &&
    logger.warn(
      '`captureRemixServerException` is a server-only function and should not be called in the browser. ' +
        'This function is a no-op in the browser environment.',
    );
}
/* eslint-enable @typescript-eslint/no-unused-vars */

export * from '@sentry/react';

export function init(options: RemixOptions): Client | undefined {
  const opts = {
    ...options,
    environment: options.environment || process.env.NODE_ENV,
  };

  applySdkMetadata(opts, 'remix', ['remix', 'react']);

  return reactInit(opts);
}
