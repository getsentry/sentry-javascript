/* eslint-disable import/export */
import { configureScope, getCurrentHub, init as nodeInit } from '@sentry/node';

import { instrumentServer } from './utils/instrumentServer';
import { buildMetadata } from './utils/metadata';
import { RemixOptions } from './utils/remixOptions';

function sdkAlreadyInitialized(): boolean {
  const hub = getCurrentHub();
  return !!hub.getClient();
}

/** Initializes Sentry Remix SDK on Node. */
export function init(options: RemixOptions): void {
  buildMetadata(options, ['remix', 'node']);

  if (sdkAlreadyInitialized()) {
    // TODO: Log something
    return;
  }

  instrumentServer();

  nodeInit(options);

  configureScope(scope => {
    scope.setTag('runtime', 'node');
  });
}

export { ErrorBoundary, withErrorBoundary } from '@sentry/react';
export { remixRouterInstrumentation, withSentryRouteTracing } from './performance/client';
export { BrowserTracing, Integrations } from '@sentry/tracing';
export * from '@sentry/node';
