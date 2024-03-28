export * from './exports';

import { WINDOW } from './helpers';

let windowIntegrations = {};

// This block is needed to add compatibility with the integrations packages when used with a CDN
if (WINDOW.Sentry && WINDOW.Sentry.Integrations) {
  windowIntegrations = WINDOW.Sentry.Integrations;
}

/** @deprecated Import the integration function directly, e.g. `inboundFiltersIntegration()` instead of `new Integrations.InboundFilter(). */
const INTEGRATIONS = {
  ...windowIntegrations,
};

// eslint-disable-next-line deprecation/deprecation
export { INTEGRATIONS as Integrations };

export { reportingObserverIntegration } from './integrations/reportingobserver';
export { httpClientIntegration } from './integrations/httpclient';
export { contextLinesIntegration } from './integrations/contextlines';

export {
  captureConsoleIntegration,
  debugIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  sessionTimingIntegration,
} from '@sentry/core';

export {
  replayIntegration,
  getReplay,
} from '@sentry-internal/replay';
export type {
  ReplayEventType,
  ReplayEventWithTime,
  ReplayBreadcrumbFrame,
  ReplayBreadcrumbFrameEvent,
  ReplayOptionFrameEvent,
  ReplayFrame,
  ReplayFrameEvent,
  ReplaySpanFrame,
  ReplaySpanFrameEvent,
} from '@sentry-internal/replay';

export { replayCanvasIntegration } from '@sentry-internal/replay-canvas';

export {
  feedbackIntegration,
  getFeedback,
  sendFeedback,
} from '@sentry-internal/feedback';
export { feedbackModalIntegration } from '@sentry-internal/feedback-modal';
export { feedbackScreenshotIntegration } from '@sentry-internal/feedback-screenshot';

export {
  defaultRequestInstrumentationOptions,
  instrumentOutgoingRequests,
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry-internal/tracing';
export type { RequestInstrumentationOptions } from '@sentry-internal/tracing';
export {
  addTracingExtensions,
  getActiveSpan,
  getRootSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  getSpanDescendants,
  setMeasurement,
  getSpanStatusFromHttpCode,
  setHttpStatus,
  makeMultiplexedTransport,
  moduleMetadataIntegration,
} from '@sentry/core';
export type { Span } from '@sentry/types';
export { makeBrowserOfflineTransport } from './transports/offline';
export { browserProfilingIntegration } from './profiling/integration';
