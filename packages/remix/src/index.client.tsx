import { applySdkMetadata } from '@sentry/core';
import { getCurrentScope, init as reactInit } from '@sentry/react';

import type { RemixOptions } from './utils/remixOptions';
export { remixRouterInstrumentation, withSentry } from './client/performance';
export { captureRemixErrorBoundaryError } from './client/errors';
export * from '@sentry/react';

export function init(options: RemixOptions): void {
  applySdkMetadata(options, 'remix', ['remix', 'react']);
  options.environment = options.environment || process.env.NODE_ENV;

  reactInit(options);

  getCurrentScope().setTag('runtime', 'browser');
}
