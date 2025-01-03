// Node SDK exports
// Unfortunately, we cannot `export * from '@sentry/node'` because in prod builds,
// Vite puts these exports into a `default` property (Sentry.default) rather than
// on the top - level namespace.

import { sentryAstro } from './integration';
import { handleRequest } from './server/middleware';

// Hence, we export everything from the Node SDK explicitly:
export {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  amqplibIntegration,
  anrIntegration,
  disableAnrDetectionForCallback,
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
  dataloaderIntegration,
  dedupeIntegration,
  DEFAULT_USER_INCLUDES,
  defaultStackParser,
  endSession,
  expressErrorHandler,
  expressIntegration,
  extraErrorDataIntegration,
  fastifyIntegration,
  flush,
  fsIntegration,
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
  getTraceData,
  getTraceMetaTags,
  graphqlIntegration,
  hapiIntegration,
  httpIntegration,
  inboundFiltersIntegration,
  initOpenTelemetry,
  isInitialized,
  kafkaIntegration,
  koaIntegration,
  knexIntegration,
  lastEventId,
  linkedErrorsIntegration,
  localVariablesIntegration,
  lruMemoizerIntegration,
  makeNodeTransport,
  modulesIntegration,
  mongoIntegration,
  mongooseIntegration,
  mysql2Integration,
  mysqlIntegration,
  nativeNodeFetchIntegration,
  NodeClient,
  nodeContextIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  parameterize,
  postgresIntegration,
  prismaIntegration,
  childProcessIntegration,
  redisIntegration,
  requestDataIntegration,
  rewriteFramesIntegration,
  Scope,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
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
  profiler,
} from '@sentry/node';

export { init } from './server/sdk';

export default sentryAstro;

// This exports the `handleRequest` middleware for manual usage
export { handleRequest };
