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
export { handleErrorWithSentry } from '../server-common/handleError';
export { wrapLoadWithSentry, wrapServerLoadWithSentry } from '../server-common/load';
export { sentryHandle } from '../server-common/handle';
export { initCloudflareSentryHandle } from './cloudflare';
export { wrapServerRouteWithSentry } from '../server-common/serverRoute';

// Re-export some functions from Cloudflare SDK
export {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  captureCheckIn,
  captureConsoleIntegration,
  captureEvent,
  captureException,
  captureFeedback,
  captureMessage,
  close,
  continueTrace,
  createTransport,
  dedupeIntegration,
  extraErrorDataIntegration,
  flush,
  functionToStringIntegration,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getDefaultIntegrations,
  getGlobalScope,
  getIsolationScope,
  getRootSpan,
  getSpanDescendants,
  getSpanStatusFromHttpCode,
  getTraceData,
  getTraceMetaTags,
  // eslint-disable-next-line deprecation/deprecation
  inboundFiltersIntegration,
  isInitialized,
  isEnabled,
  lastEventId,
  linkedErrorsIntegration,
  logger,
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
  setUser,
  spanToBaggageHeader,
  spanToJSON,
  spanToTraceHeader,
  startInactiveSpan,
  startNewTrace,
  suppressTracing,
  startSpan,
  startSpanManual,
  trpcMiddleware,
  withActiveSpan,
  withIsolationScope,
  withMonitor,
  withScope,
  supabaseIntegration,
  instrumentSupabaseClient,
  zodErrorsIntegration,
  featureFlagsIntegration,
  vercelAIIntegration,
  type FeatureFlagsIntegration,
} from '@sentry/cloudflare';

/**
 * Tracks the Svelte component's initialization and mounting operation as well as
 * updates and records them as spans. These spans are only recorded on the client-side.
 * Sever-side, during SSR, this function will not record any spans.
 */
export function trackComponent(_options?: unknown): void {
  // no-op on the server side
}
