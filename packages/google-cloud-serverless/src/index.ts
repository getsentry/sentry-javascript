export {
  addEventProcessor,
  addBreadcrumb,
  addIntegration,
  captureException,
  captureEvent,
  captureMessage,
  captureCheckIn,
  captureFeedback,
  startSession,
  captureSession,
  endSession,
  withMonitor,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getClient,
  isInitialized,
  generateInstrumentOnce,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getTraceData,
  getTraceMetaTags,
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
  lastEventId,
  flush,
  close,
  getSentryRelease,
  // eslint-disable-next-line deprecation/deprecation
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  // eslint-disable-next-line deprecation/deprecation
  extractRequestData,
  createGetModuleFromFilename,
  anrIntegration,
  disableAnrDetectionForCallback,
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
  fsIntegration,
  functionToStringIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  setMeasurement,
  getActiveSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  startNewTrace,
  suppressTracing,
  withActiveSpan,
  getRootSpan,
  getSpanDescendants,
  continueTrace,
  getAutoPerformanceIntegrations,
  cron,
  // eslint-disable-next-line deprecation/deprecation
  metrics,
  parameterize,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  dataloaderIntegration,
  expressIntegration,
  expressErrorHandler,
  setupExpressErrorHandler,
  koaIntegration,
  setupKoaErrorHandler,
  connectIntegration,
  setupConnectErrorHandler,
  fastifyIntegration,
  genericPoolIntegration,
  graphqlIntegration,
  knexIntegration,
  kafkaIntegration,
  lruMemoizerIntegration,
  mongoIntegration,
  mongooseIntegration,
  mysqlIntegration,
  mysql2Integration,
  redisIntegration,
  tediousIntegration,
  // eslint-disable-next-line deprecation/deprecation
  nestIntegration,
  // eslint-disable-next-line deprecation/deprecation
  setupNestErrorHandler,
  postgresIntegration,
  prismaIntegration,
  hapiIntegration,
  setupHapiErrorHandler,
  spotlightIntegration,
  initOpenTelemetry,
  spanToJSON,
  spanToTraceHeader,
  spanToBaggageHeader,
  trpcMiddleware,
  addOpenTelemetryInstrumentation,
  zodErrorsIntegration,
  profiler,
  amqplibIntegration,
  // eslint-disable-next-line deprecation/deprecation
  processThreadBreadcrumbIntegration,
  childProcessIntegration,
} from '@sentry/node';

export {
  captureConsoleIntegration,
  // eslint-disable-next-line deprecation/deprecation
  debugIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  // eslint-disable-next-line deprecation/deprecation
  sessionTimingIntegration,
} from '@sentry/core';

export { getDefaultIntegrations, init } from './sdk';

export { googleCloudHttpIntegration } from './integrations/google-cloud-http';
export { googleCloudGrpcIntegration } from './integrations/google-cloud-grpc';

export { wrapCloudEventFunction } from './gcpfunction/cloud_events';
export { wrapHttpFunction } from './gcpfunction/http';
export { wrapEventFunction } from './gcpfunction/events';
