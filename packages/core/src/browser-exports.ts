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

export {
  createCachedRouteProvider,
  createUrlRouteProvider,
  getRouteProvider,
  resolveCurrentRoute,
  resolveRoute,
  setRouteProvider,
} from './routing';
export type { CachedRouteProvider, RouteProvider } from './routing';
export type { XhrBreadcrumbData, XhrBreadcrumbHint } from './types/breadcrumb';
export type { BrowserClientReplayOptions } from './types/browseroptions';
