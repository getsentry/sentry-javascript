// Node SDK exports
// Unfortunately, we cannot `export * from '@sentry/node'` because in prod builds,
// Vite puts these exports into a `default` property (Sentry.default) rather than
// on the top - level namespace.

import { sentryAstro } from './integration';
import { handleRequest } from './server/middleware';

// Hence, we export everything from the Node SDK explicitly:
export {
  addEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  captureCheckIn,
  withMonitor,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getClient,
  isInitialized,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
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
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  getSpanDescendants,
  continueTrace,
  cron,
  parameterize,
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
} from '@sentry/node';

// We can still leave this for the carrier init and type exports
export * from '@sentry/node';

export { init } from './server/sdk';

export default sentryAstro;

// This exports the `handleRequest` middleware for manual usage
export { handleRequest };
