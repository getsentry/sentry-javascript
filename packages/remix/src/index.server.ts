/* eslint-disable import/export */
import type { NodeOptions } from '@sentry/node';
import { configureScope, getCurrentHub, init as nodeInit } from '@sentry/node';
import { logger } from '@sentry/utils';

import { instrumentServer } from './utils/instrumentServer';
import { buildMetadata } from './utils/metadata';
import type { RemixOptions } from './utils/remixOptions';

// We need to explicitly export @sentry/node as they end up under `default` in ESM builds
// See: https://github.com/getsentry/sentry-javascript/issues/8474
export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureCheckIn,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  createTransport,
  extractTraceparentData,
  getActiveTransaction,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  makeMain,
  Scope,
  startTransaction,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  spanStatusfromHttpCode,
  trace,
  withScope,
  autoDiscoverNodePerformanceMonitoringIntegrations,
  makeNodeTransport,
  defaultIntegrations,
  defaultStackParser,
  lastEventId,
  flush,
  close,
  getSentryRelease,
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  deepReadDirSync,
  Integrations,
  Handlers,
} from '@sentry/node';

// Keeping the `*` exports for backwards compatibility and types
export * from '@sentry/node';

export { captureRemixServerException } from './utils/instrumentServer';
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';
export { remixRouterInstrumentation, withSentry } from './client/performance';
export { captureRemixErrorBoundaryError } from './client/errors';
export { wrapExpressCreateRequestHandler } from './utils/serverAdapters/express';

function sdkAlreadyInitialized(): boolean {
  const hub = getCurrentHub();
  return !!hub.getClient();
}

/** Initializes Sentry Remix SDK on Node. */
export function init(options: RemixOptions): void {
  buildMetadata(options, ['remix', 'node']);

  if (sdkAlreadyInitialized()) {
    __DEBUG_BUILD__ && logger.log('SDK already initialized');

    return;
  }

  instrumentServer(options.isRemixV2);

  nodeInit(options as NodeOptions);

  configureScope(scope => {
    scope.setTag('runtime', 'node');
  });
}
