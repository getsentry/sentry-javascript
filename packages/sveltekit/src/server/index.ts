// Node SDK exports
// Unfortunately, we cannot `export * from '@sentry/node'` because in prod builds,
// Vite puts these exports into a `default` property (Sentry.default) rather than
// on the top - level namespace.
// Hence, we export everything from the Node SDK explicitly:
export {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  // eslint-disable-next-line deprecation/deprecation
  addOpenTelemetryInstrumentation,
  // eslint-disable-next-line deprecation/deprecation
  addRequestDataToEvent,
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
  // eslint-disable-next-line deprecation/deprecation
  debugIntegration,
  dedupeIntegration,
  DEFAULT_USER_INCLUDES,
  defaultStackParser,
  endSession,
  expressErrorHandler,
  expressIntegration,
  // eslint-disable-next-line deprecation/deprecation
  extractRequestData,
  extraErrorDataIntegration,
  fastifyIntegration,
  flush,
  functionToStringIntegration,
  genericPoolIntegration,
  generateInstrumentOnce,
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
  // eslint-disable-next-line deprecation/deprecation
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
  // eslint-disable-next-line deprecation/deprecation
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
  // eslint-disable-next-line deprecation/deprecation
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
  withActiveSpan,
  withIsolationScope,
  withMonitor,
  withScope,
  zodErrorsIntegration,
} from '@sentry/node';

// We can still leave this for the carrier init and type exports
export * from '@sentry/node';

// -------------------------
// SvelteKit SDK exports:
export { init } from './sdk';
export { handleErrorWithSentry } from './handleError';
export { wrapLoadWithSentry, wrapServerLoadWithSentry } from './load';
export { sentryHandle } from './handle';
export { wrapServerRouteWithSentry } from './serverRoute';

/**
 * Tracks the Svelte component's initialization and mounting operation as well as
 * updates and records them as spans. These spans are only recorded on the client-side.
 * Sever-side, during SSR, this function will not record any spans.
 */
export function trackComponent(_options?: unknown): void {
  // no-op on the server side
}
