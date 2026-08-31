import { registerSpanErrorInstrumentation } from '@sentry/core';
import { feedbackAsyncIntegration } from './feedbackAsync';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

export {
  getActiveSpan,
  getRootSpan,
  getSpanDescendants,
  setMeasurement,
  startNewTrace,
  withActiveSpan,
  logger,
  consoleLoggingIntegration,
  metrics,
  spanStreamingIntegration,
} from '@sentry/core';
export { startSpan, startInactiveSpan, startSpanManual } from '@sentry/browser-utils';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { isBotUserAgent } from '@sentry/browser-utils';
export { elementTimingIntegration } from '@sentry/browser-utils';
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { fetchStreamPerformanceIntegration } from './integrations/fetchStreamPerformance';
export { webVitalsIntegration } from './integrations/webVitals';

export { getFeedback, sendFeedback } from '@sentry/feedback';

export { feedbackAsyncIntegration as feedbackAsyncIntegration, feedbackAsyncIntegration as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry/replay';
