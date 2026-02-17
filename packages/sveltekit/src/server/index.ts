/* eslint-disable import/export */
// Node SDK exports
// Unfortunately, we cannot `export * from '@sentry/node'` because in prod builds,
// Vite puts these exports into a `default` property (Sentry.default) rather than
// on the top - level namespace.
// Hence, we export everything from the Node SDK explicitly:
export {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  amqplibIntegration,
  // eslint-disable-next-line deprecation/deprecation
  anrIntegration,
  // eslint-disable-next-line deprecation/deprecation
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
  dedupeIntegration,
  defaultStackParser,
  endSession,
  expressErrorHandler,
  expressIntegration,
  extraErrorDataIntegration,
  fastifyIntegration,
  flush,
  functionToStringIntegration,
  genericPoolIntegration,
  generateInstrumentOnce,
  getActiveSpan,
  getAutoPerformanceIntegrations,
  getClient,
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
  // eslint-disable-next-line deprecation/deprecation
  inboundFiltersIntegration,
  eventFiltersIntegration,
  initOpenTelemetry,
  isInitialized,
  isEnabled,
  knexIntegration,
  kafkaIntegration,
  koaIntegration,
  lastEventId,
  linkedErrorsIntegration,
  localVariablesIntegration,
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
  postgresJsIntegration,
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
  systemErrorIntegration,
  tediousIntegration,
  trpcMiddleware,
  updateSpanName,
  withActiveSpan,
  withIsolationScope,
  withMonitor,
  withScope,
  supabaseIntegration,
  instrumentSupabaseClient,
  instrumentOpenAiClient,
  instrumentAnthropicAiClient,
  instrumentGoogleGenAIClient,
  instrumentLangGraph,
  instrumentStateGraphCompile,
  zodErrorsIntegration,
  logger,
  consoleLoggingIntegration,
  createConsolaReporter,
  createSentryWinstonTransport,
  vercelAIIntegration,
  metrics,
} from '@sentry/node';

// We can still leave this for the carrier init and type exports
export * from '@sentry/node';

// -------------------------
// SvelteKit SDK exports:
export { init } from './sdk';
export { handleErrorWithSentry } from '../server-common/handleError';
export { wrapLoadWithSentry, wrapServerLoadWithSentry } from '../server-common/load';
export { sentryHandle } from '../server-common/handle';
export { initCloudflareSentryHandle } from './handle';
export { wrapServerRouteWithSentry } from '../server-common/serverRoute';
export { httpIntegration } from './integrations/http';

/**
 * Tracks the Svelte component's initialization and mounting operation as well as
 * updates and records them as spans. These spans are only recorded on the client-side.
 * Sever-side, during SSR, this function will not record any spans.
 */
export function trackComponent(_options?: unknown): void {
  // no-op on the server side
}
