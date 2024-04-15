// Node SDK exports
// Unfortunately, we cannot `export * from '@sentry/node'` because in prod builds,
// Vite puts these exports into a `default` property (Sentry.default) rather than
// on the top - level namespace.
// Hence, we export everything from the Node SDK explicitly:
export {
  addEventProcessor,
  addBreadcrumb,
  addIntegration,
  captureException,
  captureEvent,
  captureMessage,
  captureCheckIn,
  withMonitor,
  createTransport,
  getClient,
  isInitialized,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  NodeClient,
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
  continueTrace,
  cron,
  parameterize,
  createGetModuleFromFilename,
  metrics,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  trpcMiddleware,
  spanToJSON,
  spanToTraceHeader,
} from '@sentry/node';

// We can still leave this for the carrier init and type exports
export * from '@sentry/node';

// -------------------------
// SvelteKit SDK exports:
export { init } from './sdk';
export { handleErrorWithSentry } from './handleError';
export { wrapLoadWithSentry, wrapServerLoadWithSentry } from './load';
export { sentryHandle } from './handle';
