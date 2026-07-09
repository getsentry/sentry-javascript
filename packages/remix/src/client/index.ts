// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../utils/debug-build';

export * from '@sentry/react';
// Optional browser features and Redux are no longer star-exported through
// `@sentry/react`. Re-export them so `import * as Sentry from '@sentry/remix'`
// keeps the historical surface.
export * from '@sentry/react/optional-browser-api';
// `uiProfiler` is on both `@sentry/react` and `optional-browser-api`; dual
// `export *` would omit the name under ESM rules, so re-export it explicitly.
export { uiProfiler } from '@sentry/react';
export { createReduxEnhancer } from '@sentry/react/redux';

export { init } from './sdk';
export { captureRemixErrorBoundaryError } from './errors';
export { withSentry } from './performance';
export { browserTracingIntegration } from './browserTracingIntegration';

// This is a no-op function that does nothing. It's here to make sure that the
// function signature is the same as in the server SDK.
// See issue: https://github.com/getsentry/sentry-javascript/issues/9594
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 *
 */
export async function captureRemixServerException(err: unknown, name: string, request: Request): Promise<void> {
  DEBUG_BUILD &&
    debug.warn(
      '`captureRemixServerException` is a server-only function and should not be called in the browser. ' +
        'This function is a no-op in the browser environment.',
    );
}
