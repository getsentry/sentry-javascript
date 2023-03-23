/* eslint-disable import/export */
import { configureScope, init as reactInit, Integrations } from '@sentry/react';

import { buildMetadata } from './utils/metadata';
import type { RemixOptions } from './utils/remixOptions';
export { remixRouterInstrumentation, withSentry } from './performance/client';
export { BrowserTracing } from '@sentry/tracing';
export * from '@sentry/react';

export { Integrations };

export function init(options: RemixOptions): void {
  buildMetadata(options, ['remix', 'react']);
  options.environment = options.environment || process.env.NODE_ENV;

  reactInit(options);

  configureScope(scope => {
    scope.setTag('runtime', 'browser');
  });
}
