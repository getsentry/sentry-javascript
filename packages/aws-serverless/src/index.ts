export {
  addEventProcessor,
  addBreadcrumb,
  addIntegration,
  captureException,
  captureEvent,
  captureMessage,
  captureCheckIn,
  startSession,
  captureSession,
  endSession,
  withMonitor,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getClient,
  isInitialized,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  Hub,
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
  NodeClient,
  defaultStackParser,
  flush,
  close,
  getSentryRelease,
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  createGetModuleFromFilename,
  anrIntegration,
  consoleIntegration,
  httpIntegration,
  nativeNodeFetchIntegration,
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
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  getRootSpan,
  getSpanDescendants,
  continueTrace,
  getAutoPerformanceIntegrations,
  cron,
  metrics,
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
  initOpenTelemetry,
  spanToJSON,
} from '@sentry/node';

export {
  captureConsoleIntegration,
  debugIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  sessionTimingIntegration,
} from '@sentry/core';

export { getDefaultIntegrations, init, tryPatchHandler, wrapHandler } from './awslambda';
export type { WrapperOptions } from './awslambda';

export { awsServicesIntegration } from './awsservices';
