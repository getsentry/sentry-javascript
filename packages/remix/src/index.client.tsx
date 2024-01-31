import { applySdkMetadata } from '@sentry/core';
import { getCurrentScope, init as reactInit } from '@sentry/react';
import type { RemixOptions } from './utils/remixOptions';
export { captureRemixErrorBoundaryError } from './client/errors';
export {
  remixRouterInstrumentation,
  withSentry,
} from './client/performance';

export { browserTracingIntegration } from './client/browserTracingIntegration';

export * from '@sentry/react';

export function init(options: RemixOptions): void {
  const opts = {
    ...options,
    environment: options.environment || process.env.NODE_ENV,
  };

  applySdkMetadata(opts, 'remix', ['remix', 'react']);

  reactInit(opts);

  getCurrentScope().setTag('runtime', 'browser');
}
