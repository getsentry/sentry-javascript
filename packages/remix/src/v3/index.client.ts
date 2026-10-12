// A named list rather than `export * from '@sentry/browser'`.
//
// Remix 3 has no bundler, so this list is what gets tree shaken. A wildcard re-export would reach every
// export of `@sentry/browser`, including Replay, Feedback and the full attribute tables, and none of it
// could be dropped. Add whatever is needed, but keep it a named list. The size limit budget for
// `client-bundle.js` is what enforces that.
//
// Everything comes from `@sentry/browser`, never `@sentry/core`, even where `@sentry/browser` only
// passes a symbol through. The two packages export different `startSpan`, `startInactiveSpan` and
// `startSpanManual`, and only `@sentry/browser`'s installs span streaming on first use.
export {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  BrowserClient,
  captureEvent,
  captureException,
  captureFeedback,
  captureMessage,
  captureSession,
  close,
  continueTrace,
  dedupeIntegration,
  defaultStackParser,
  endSession,
  eventFiltersIntegration,
  flush,
  functionToStringIntegration,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getRootSpan,
  getTraceData,
  globalHandlersIntegration,
  httpContextIntegration,
  isEnabled,
  isInitialized,
  lastEventId,
  linkedErrorsIntegration,
  logger,
  makeFetchTransport,
  metrics,
  parameterize,
  Scope,
  SDK_VERSION,
  setAttribute,
  setAttributes,
  setContext,
  setCurrentClient,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  spanToJSON,
  spanToTraceHeader,
  startInactiveSpan,
  startSession,
  startSpan,
  startSpanManual,
  suppressTracing,
  updateSpanName,
  WINDOW,
  withActiveSpan,
  withIsolationScope,
  withScope,
} from '@sentry/browser';

export type { BrowserOptions } from '@sentry/browser';

export { getDefaultIntegrations, init } from './client/sdk';
export { browserTracingIntegration } from './client/browserTracingIntegration';
export { createRemixV3RouteProvider } from './client/routeProvider';
export { captureRuntimeErrors, instrumentClientRuntime } from './client/errors';
