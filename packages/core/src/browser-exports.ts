/**
 * Browser-specific utilities for Sentry SDKs
 *
 * @module
 */
// These share their names with the plain variants in `server-exports`, but additionally make sure
// the browser span streaming integration is installed on the client before the span starts. That
// indirection is what lets error-only browser bundles tree-shake span streaming away entirely:
// `init()` never references the integration, so it's only retained when span-creating code is.
//
// `@sentry/core` pins these names to the plain variants (see `index.ts`); `@sentry/core/browser`
// serves the guarded ones. Browser-facing packages therefore upgrade by importing from
// `@sentry/core/browser` — no call site changes.
export {
  startSpan,
  startInactiveSpan,
  startSpanManual,
  startIdleSpan,
  _INTERNAL_ensureBrowserSpanStreaming,
} from './tracing/browserSpanApi';
export { spanStreamingIntegration } from './integrations/browserSpanStreaming';

export {
  getComponentName,
  getLocationHref,
  // eslint-disable-next-line typescript/no-deprecated
  htmlTreeAsString,
} from './utils/browser';
export { supportsDOMError, supportsHistory, supportsNativeFetch, supportsReportingObserver } from './utils/supports';
export type { XhrBreadcrumbData, XhrBreadcrumbHint } from './types/breadcrumb';
export type {
  HandlerDataXhr,
  HandlerDataDom,
  HandlerDataHistory,
  SentryXhrData,
  SentryWrappedXMLHttpRequest,
} from './types/instrument';
export type { BrowserClientReplayOptions, BrowserClientProfilingOptions } from './types/browseroptions';
