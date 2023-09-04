/* eslint-disable import/export */
import type { BrowserOptions } from '@sentry/react';
import { configureScope, init as reactInit } from '@sentry/react';

import { buildMetadata } from './utils/metadata';
import type { RemixOptions } from './utils/remixOptions';
export { remixRouterInstrumentation, withSentry } from './client/performance';
export { captureRemixErrorBoundaryError } from './client/errors';
export * from '@sentry/react';

export function init(options: RemixOptions): void {
  buildMetadata(options, ['remix', 'react']);
  options.environment = options.environment || process.env.NODE_ENV;

  reactInit(options as BrowserOptions);

  configureScope(scope => {
    scope.setTag('runtime', 'browser');
  });
}
