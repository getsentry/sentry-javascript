import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as nodeInit, isInitialized } from '@sentry/node';
import type { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from './utils/debug-build';
import { instrumentServer } from './utils/instrumentServer';
import { httpIntegration } from './utils/integrations/http';
import { remixIntegration } from './utils/integrations/opentelemetry';
import type { RemixOptions } from './utils/remixOptions';

// We need to explicitly export @sentry/node as they end up under `default` in ESM builds
// See: https://github.com/getsentry/sentry-javascript/issues/8474
export {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  addOpenTelemetryInstrumentation,
  addRequestDataToEvent,
  amqplibIntegration,
  anrIntegration,
  captureCheckIn,
  captureConsoleIntegration,
  captureEvent,
  captureException,
  captureFeedback,
  captureMessage,
  captureSession,
  close,
  connectIntegration,
  consoleIntegration,
  contextLinesIntegration,
  continueTrace,
  createGetModuleFromFilename,
  createTransport,
  cron,
  debugIntegration,
  dedupeIntegration,
  DEFAULT_USER_INCLUDES,
  defaultStackParser,
  endSession,
  expressErrorHandler,
  expressIntegration,
  extractRequestData,
  extraErrorDataIntegration,
  fastifyIntegration,
  flush,
  functionToStringIntegration,
  generateInstrumentOnce,
  genericPoolIntegration,
  getActiveSpan,
  getAutoPerformanceIntegrations,
  getClient,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getCurrentScope,
  getDefaultIntegrations,
  getGlobalScope,
  getIsolationScope,
  getRootSpan,
  getSentryRelease,
  getSpanDescendants,
  getSpanStatusFromHttpCode,
  graphqlIntegration,
  hapiIntegration,
  httpIntegration,
  inboundFiltersIntegration,
  initOpenTelemetry,
  isInitialized,
  knexIntegration,
  kafkaIntegration,
  koaIntegration,
  lastEventId,
  linkedErrorsIntegration,
  localVariablesIntegration,
  makeNodeTransport,
  // eslint-disable-next-line deprecation/deprecation
  metrics,
  modulesIntegration,
  mongoIntegration,
  mongooseIntegration,
  mysql2Integration,
  mysqlIntegration,
  nativeNodeFetchIntegration,
  nestIntegration,
  NodeClient,
  nodeContextIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  parameterize,
  postgresIntegration,
  prismaIntegration,
  redisIntegration,
  requestDataIntegration,
  rewriteFramesIntegration,
  Scope,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  sessionTimingIntegration,
  setContext,
  setCurrentClient,
  setExtra,
  setExtras,
  setHttpStatus,
  setMeasurement,
  setTag,
  setTags,
  setupConnectErrorHandler,
  setupExpressErrorHandler,
  setupHapiErrorHandler,
  setupKoaErrorHandler,
  setupNestErrorHandler,
  setUser,
  spanToBaggageHeader,
  spanToJSON,
  spanToTraceHeader,
  spotlightIntegration,
  startInactiveSpan,
  startNewTrace,
  suppressTracing,
  startSession,
  startSpan,
  startSpanManual,
  tediousIntegration,
  trpcMiddleware,
  updateSpanName,
  withActiveSpan,
  withIsolationScope,
  withMonitor,
  withScope,
  zodErrorsIntegration,
} from '@sentry/node';

// Keeping the `*` exports for backwards compatibility and types
export * from '@sentry/node';

export {
  // eslint-disable-next-line deprecation/deprecation
  wrapRemixHandleError,
  sentryHandleError,
  wrapHandleErrorWithSentry,
} from './utils/instrumentServer';

export { captureRemixServerException } from './utils/errors';

export { ErrorBoundary, withErrorBoundary } from '@sentry/react';
export { withSentry } from './client/performance';
export { captureRemixErrorBoundaryError } from './client/errors';
export { browserTracingIntegration } from './client/browserTracingIntegration';

export type { SentryMetaArgs } from './utils/types';

/**
 * Returns the default Remix integrations.
 *
 * @param options The options for the SDK.
 */
export function getRemixDefaultIntegrations(options: RemixOptions): Integration[] {
  return [
    ...getDefaultNodeIntegrations(options as NodeOptions).filter(integration => integration.name !== 'Http'),
    httpIntegration(),
    options.autoInstrumentRemix ? remixIntegration() : undefined,
  ].filter(int => int) as Integration[];
}

/**
 * Returns the given Express createRequestHandler function.
 * This function is no-op and only returns the given function.
 *
 * @deprecated No need to wrap the Express request handler.
 * @param createRequestHandlerFn The Remix Express `createRequestHandler`.
 * @returns `createRequestHandler` function.
 */
export function wrapExpressCreateRequestHandler(createRequestHandlerFn: unknown): unknown {
  DEBUG_BUILD && logger.warn('wrapExpressCreateRequestHandler is deprecated and no longer needed.');

  return createRequestHandlerFn;
}

/** Initializes Sentry Remix SDK on Node. */
export function init(options: RemixOptions): NodeClient | undefined {
  applySdkMetadata(options, 'remix', ['remix', 'node']);

  if (isInitialized()) {
    DEBUG_BUILD && logger.log('SDK already initialized');

    return;
  }

  options.defaultIntegrations = getRemixDefaultIntegrations(options as NodeOptions);

  const client = nodeInit(options as NodeOptions);

  instrumentServer(options);

  return client;
}
