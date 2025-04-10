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
  // eslint-disable-next-line deprecation/deprecation
  inboundFiltersIntegration,
  eventFiltersIntegration,
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
  postgresIntegration,
  prismaIntegration,
  childProcessIntegration,
  hapiIntegration,
  setupHapiErrorHandler,
  spotlightIntegration,
  initOpenTelemetry,
  spanToJSON,
  spanToTraceHeader,
  spanToBaggageHeader,
  trpcMiddleware,
  updateSpanName,
  supabaseIntegration,
  instrumentSupabase,
  zodErrorsIntegration,
  profiler,
  amqplibIntegration,
  vercelAIIntegration,
  logger,
  consoleLoggingIntegration,
} from '@sentry/node';

export {
  captureConsoleIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
} from '@sentry/core';

export { awsIntegration } from './integration/aws';
export { awsLambdaIntegration } from './integration/awslambda';

export { getDefaultIntegrations, init, tryPatchHandler, wrapHandler } from './sdk';
export type { WrapperOptions } from './sdk';
