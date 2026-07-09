/**
 * Tree-shakeable core browser SDK surface (`@sentry/browser/core`).
 *
 * Includes error monitoring, default integrations, and the tracing APIs that
 * almost every production app needs — but **not** optional heavy features
 * (Session Replay, Feedback UI, AI instrumenters, feature-flag integrations,
 * profiling, etc.).
 *
 * Framework SDKs re-export from this entry so that bundlers which materialize
 * a full dynamic-import namespace (e.g. Rolldown when destructuring
 * `await import('@sentry/react')`) cannot pull optional packages into the
 * critical path.
 */
export * from './exports';

export { cultureContextIntegration } from './integrations/culturecontext';
export { normalizeStringifyValue } from './normalizeStringifyValue';

// --- Tracing (commonly used; still tree-shakeable if unused) ---
export { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './tracing/request';
export type { RequestInstrumentationOptions } from './tracing/request';
export {
  browserTracingIntegration,
  isBotUserAgent,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

// --- Filtering / enrichment used by most production setups ---
export {
  registerSpanErrorInstrumentation,
  getActiveSpan,
  getRootSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  startNewTrace,
  bindScopeToEmitter,
  getSpanDescendants,
  setMeasurement,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  makeMultiplexedTransport,
  MULTIPLEXED_TRANSPORT_EXTRA_KEY,
  moduleMetadataIntegration,
  thirdPartyErrorFilterIntegration,
  captureConsoleIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  consoleLoggingIntegration,
  logger,
} from '@sentry/core/browser';
export type { Span } from '@sentry/core/browser';
