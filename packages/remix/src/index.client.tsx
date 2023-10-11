/* eslint-disable import/export */
import { init as reactInit } from '@sentry/react';

import { buildMetadata } from './utils/metadata';
import type { RemixOptions } from './utils/remixOptions';
export { remixRouterInstrumentation, withSentry } from './client/performance';
export { captureRemixErrorBoundaryError } from './client/errors';
export * from '@sentry/react';
import type { ServerRuntimeClientOptions } from '@sentry/core';
import {
  configureScope,
  getCurrentHub,
  getIntegrationsToSetup,
  initAndBind,
  ServerRuntimeClient,
  startTransaction,
} from '@sentry/core';
import { createStackParser, logger, nodeStackLineParser, stackParserFromStackParserOptions } from '@sentry/utils';

import { makeEdgeTransport } from './worker/transport';

export { captureRemixServerException } from './utils/instrumentServer';
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';
// export { wrapExpressCreateRequestHandler } from './utils/serverAdapters/express';
export { wrapWorkerCreateRequestHandler } from './utils/serverAdapters/worker';

export function init(options: RemixOptions): void {
  buildMetadata(options, ['remix', 'react']);
  options.environment = options.environment || process.env.NODE_ENV;

  reactInit(options);

  configureScope(scope => {
    scope.setTag('runtime', 'browser');
  });
}

const nodeStackParser = createStackParser(nodeStackLineParser());

function sdkAlreadyInitialized(): boolean {
  const hub = getCurrentHub();
  return !!hub.getClient();
}

/** Initializes Sentry Remix SDK on Node. */
export function workerInit(options: RemixOptions): void {
  buildMetadata(options, ['remix', 'node']);

  if (sdkAlreadyInitialized()) {
    __DEBUG_BUILD__ && logger.log('SDK already initialized');

    return;
  }

  const clientOptions: ServerRuntimeClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || nodeStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeEdgeTransport,
  };

  initAndBind(ServerRuntimeClient, clientOptions);

  configureScope(scope => {
    scope.setTag('runtime', 'worker');
  });

  const transaction = startTransaction({
    name: 'remix-main',
    op: 'init',
  });

  transaction.finish();
}
