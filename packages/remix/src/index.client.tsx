import { applySdkMetadata, setTag } from '@sentry/core';
import { init as reactInit } from '@sentry/react';
import type { RemixOptions } from './utils/remixOptions';
export { captureRemixErrorBoundaryError } from './client/errors';
export { withSentry } from './client/performance';

export { browserTracingIntegration } from './client/browserTracingIntegration';

export * from '@sentry/react';

export function init(options: RemixOptions): void {
  const opts = {
    ...options,
    environment: options.environment || process.env.NODE_ENV,
  };

  applySdkMetadata(opts, 'remix', ['remix', 'react']);

  reactInit(opts);

  setTag('runtime', 'browser');
}
