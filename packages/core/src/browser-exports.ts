/**
 * Browser-specific utilities for Sentry SDKs
 *
 * @module
 */

export {
  startSpan,
  startInactiveSpan,
  startSpanManual,
  _INTERNAL_ensureBrowserSpanStreaming,
} from './tracing/browserSpanApi';

export { startIdleSpan } from './tracing/idleSpan';

export { spanStreamingIntegration } from './integrations/browserSpanStreaming';

export { getComponentName, getLocationHref } from './utils/browser';
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
