export type {
  Breadcrumb,
  BreadcrumbHint,
  PolymorphicRequest,
  RequestEventData,
  SdkInfo,
  Event,
  EventHint,
  ErrorEvent,
  Exception,
  Session,
  SeverityLevel,
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  User,
} from '@sentry/core';

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
  fsIntegration,
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
  fastifyIntegration,
  setupFastifyErrorHandler,
  koaIntegration,
  setupKoaErrorHandler,
  connectIntegration,
  setupConnectErrorHandler,
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

export type { BunOptions } from './types';

// eslint-disable-next-line deprecation/deprecation
export { BunClient } from './client';
export { getDefaultIntegrations, init } from './sdk';
export { bunServerIntegration } from './integrations/bunserver';
export { makeFetchTransport } from './transports';
