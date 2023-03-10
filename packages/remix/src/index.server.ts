/* eslint-disable import/export */
import { buildMetadata } from '@sentry/core';
import { configureScope, getCurrentHub, init as nodeInit } from '@sentry/node';
import { logger } from '@sentry/utils';

import { instrumentServer } from './utils/instrumentServer';
import type { RemixOptions } from './utils/remixOptions';

export { ErrorBoundary, withErrorBoundary } from '@sentry/react';
export { remixRouterInstrumentation, withSentry } from './performance/client';
export { BrowserTracing, Integrations } from '@sentry/tracing';
export * from '@sentry/node';
export { wrapExpressCreateRequestHandler } from './utils/serverAdapters/express';

function sdkAlreadyInitialized(): boolean {
  const hub = getCurrentHub();
  return !!hub.getClient();
}

/** Initializes Sentry Remix SDK on Node. */
export function init(options: RemixOptions): void {
  buildMetadata(options, 'remix', ['remix', 'node']);

  if (sdkAlreadyInitialized()) {
    __DEBUG_BUILD__ && logger.log('SDK already initialized');

    return;
  }

  instrumentServer();

  nodeInit(options);

  configureScope(scope => {
    scope.setTag('runtime', 'node');
  });
}
