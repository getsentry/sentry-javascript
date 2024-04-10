// Node SDK exports
// Unfortunately, we cannot `export * from '@sentry/node'` because in prod builds,
// Vite puts these exports into a `default` property (Sentry.default) rather than
// on the top - level namespace.

import { sentryAstro } from './integration';
import { handleRequest } from './server/middleware';

// Hence, we export everything from the Node SDK explicitly:
export {
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
  addEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  captureCheckIn,
  withMonitor,
  // eslint-disable-next-line deprecation/deprecation
  configureScope,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  extractTraceparentData,
  // eslint-disable-next-line deprecation/deprecation
  getActiveTransaction,
  getHubFromCarrier,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getClient,
  isInitialized,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  // eslint-disable-next-line deprecation/deprecation
  Hub,
  // eslint-disable-next-line deprecation/deprecation
  makeMain,
  setCurrentClient,
  Scope,
  // eslint-disable-next-line deprecation/deprecation
  startTransaction,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  // eslint-disable-next-line deprecation/deprecation
  spanStatusfromHttpCode,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  // eslint-disable-next-line deprecation/deprecation
  trace,
  withScope,
  withIsolationScope,
  autoDiscoverNodePerformanceMonitoringIntegrations,
  makeNodeTransport,
  // eslint-disable-next-line deprecation/deprecation
  defaultIntegrations,
  getDefaultIntegrations,
  defaultStackParser,
  // eslint-disable-next-line deprecation/deprecation
  lastEventId,
  flush,
  close,
  getSentryRelease,
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  // eslint-disable-next-line deprecation/deprecation
  deepReadDirSync,
  Integrations,
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
  Handlers,
  trpcMiddleware,
  setMeasurement,
  getActiveSpan,
  startSpan,
  // eslint-disable-next-line deprecation/deprecation
  startActiveSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  continueTrace,
  cron,
  parameterize,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/node';

// We can still leave this for the carrier init and type exports
export * from '@sentry/node';

export { init } from './server/sdk';

export default sentryAstro;

// This exports the `handleRequest` middleware for manual usage
export { handleRequest };
