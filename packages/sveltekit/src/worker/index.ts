// For use in cloudflare workers and other edge environments
//
// These are essentially the same as the node server exports, but using imports from @sentry/core
// instead of @sentry/node.
//
// This is expected to be used together with something like the @sentry/cloudflare package, to initialize Sentry
// in the worker.
//
// -------------------------
// SvelteKit SDK exports:
export { handleErrorWithSentry } from './handleError';
export { wrapLoadWithSentry, wrapServerLoadWithSentry } from './load';
export { sentryHandle } from './handle';
export { wrapServerRouteWithSentry } from './serverRoute';

// Re-export some functions from core SDK
export {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  // eslint-disable-next-line deprecation/deprecation
  addRequestDataToEvent,
  captureCheckIn,
  captureConsoleIntegration,
  captureEvent,
  captureException,
  captureFeedback,
  captureMessage,
  captureSession,
  close,
  continueTrace,
  createTransport,
  // eslint-disable-next-line deprecation/deprecation
  debugIntegration,
  dedupeIntegration,
  DEFAULT_USER_INCLUDES,
  endSession,
  // eslint-disable-next-line deprecation/deprecation
  extractRequestData,
  extraErrorDataIntegration,
  flush,
  functionToStringIntegration,
  getActiveSpan,
  getClient,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getRootSpan,
  getSpanDescendants,
  getSpanStatusFromHttpCode,
  getTraceData,
  getTraceMetaTags,
  inboundFiltersIntegration,
  isInitialized,
  lastEventId,
  linkedErrorsIntegration,
  // eslint-disable-next-line deprecation/deprecation
  metrics,
  parameterize,
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
  setUser,
  spanToBaggageHeader,
  spanToJSON,
  spanToTraceHeader,
  startInactiveSpan,
  startNewTrace,
  suppressTracing,
  startSession,
  startSpan,
  startSpanManual,
  trpcMiddleware,
  withActiveSpan,
  withIsolationScope,
  withMonitor,
  withScope,
  zodErrorsIntegration,
} from '@sentry/core';

/**
 * Tracks the Svelte component's initialization and mounting operation as well as
 * updates and records them as spans. These spans are only recorded on the client-side.
 * Sever-side, during SSR, this function will not record any spans.
 */
export function trackComponent(_options?: unknown): void {
  // no-op on the server side
}
