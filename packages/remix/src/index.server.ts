import { applySdkMetadata, isInitialized } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import { init as nodeInit, setTag } from '@sentry/node';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from './utils/debug-build';
import { instrumentServer } from './utils/instrumentServer';
import type { RemixOptions } from './utils/remixOptions';

// We need to explicitly export @sentry/node as they end up under `default` in ESM builds
// See: https://github.com/getsentry/sentry-javascript/issues/8474
export {
  addEventProcessor,
  addBreadcrumb,
  addIntegration,
  captureCheckIn,
  withMonitor,
  captureException,
  captureEvent,
  captureMessage,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  Hub,
  setCurrentClient,
  NodeClient,
  Scope,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  withScope,
  withIsolationScope,
  makeNodeTransport,
  getDefaultIntegrations,
  defaultStackParser,
  flush,
  close,
  getSentryRelease,
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  consoleIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  modulesIntegration,
  contextLinesIntegration,
  nodeContextIntegration,
  localVariablesIntegration,
  requestDataIntegration,
  functionToStringIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  setMeasurement,
  getActiveSpan,
  getRootSpan,
  startSpan,
  startSpanManual,
  startInactiveSpan,
  withActiveSpan,
  getSpanDescendants,
  continueTrace,
  isInitialized,
  cron,
  parameterize,
  metrics,
  createGetModuleFromFilename,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  expressIntegration,
  expressErrorHandler,
  setupExpressErrorHandler,
  fastifyIntegration,
  graphqlIntegration,
  mongoIntegration,
  mongooseIntegration,
  mysqlIntegration,
  mysql2Integration,
  nestIntegration,
  setupNestErrorHandler,
  postgresIntegration,
  prismaIntegration,
  hapiIntegration,
  setupHapiErrorHandler,
  spotlightIntegration,
  setupFastifyErrorHandler,
  trpcMiddleware,
  spanToJSON,
  spanToTraceHeader,
} from '@sentry/node';

// Keeping the `*` exports for backwards compatibility and types
export * from '@sentry/node';

export { captureRemixServerException, wrapRemixHandleError } from './utils/instrumentServer';
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';
export { withSentry } from './client/performance';
export { captureRemixErrorBoundaryError } from './client/errors';
export { browserTracingIntegration } from './client/browserTracingIntegration';
export { wrapExpressCreateRequestHandler } from './utils/serverAdapters/express';

export type { SentryMetaArgs } from './utils/types';

/** Initializes Sentry Remix SDK on Node. */
export function init(options: RemixOptions): void {
  applySdkMetadata(options, 'remix', ['remix', 'node']);

  if (isInitialized()) {
    DEBUG_BUILD && logger.log('SDK already initialized');

    return;
  }

  instrumentServer();

  nodeInit(options as NodeOptions);

  setTag('runtime', 'node');
}
