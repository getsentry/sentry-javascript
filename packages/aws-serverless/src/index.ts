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
  fsIntegration,
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
  // eslint-disable-next-line deprecation/deprecation
  processThreadBreadcrumbIntegration,
  childProcessIntegration,
  hapiIntegration,
  setupHapiErrorHandler,
  spotlightIntegration,
  initOpenTelemetry,
  spanToJSON,
  spanToTraceHeader,
  spanToBaggageHeader,
  trpcMiddleware,
  // eslint-disable-next-line deprecation/deprecation
  addOpenTelemetryInstrumentation,
  zodErrorsIntegration,
  profiler,
  amqplibIntegration,
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

export { awsIntegration } from './integration/aws';
export { awsLambdaIntegration } from './integration/awslambda';

export { getDefaultIntegrations, init, tryPatchHandler, wrapHandler } from './sdk';
export type { WrapperOptions } from './sdk';
