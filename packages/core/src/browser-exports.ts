/**
 * Browser-specific utilities for Sentry SDKs
 *
 * @module
 */
export { getComponentName, getLocationHref, htmlTreeAsString } from './utils/browser';
export { supportsDOMError, supportsHistory, supportsNativeFetch, supportsReportingObserver } from './utils/supports';
export type { XhrBreadcrumbData, XhrBreadcrumbHint } from './types-hoist/breadcrumb';
export type {
  HandlerDataXhr,
  HandlerDataDom,
  HandlerDataHistory,
  SentryXhrData,
  SentryWrappedXMLHttpRequest,
} from './types-hoist/instrument';
export type { BrowserClientReplayOptions, BrowserClientProfilingOptions } from './types-hoist/browseroptions';
