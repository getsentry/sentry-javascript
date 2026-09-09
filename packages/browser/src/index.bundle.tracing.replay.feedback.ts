import { registerSpanErrorInstrumentation } from '@sentry/core';
import {
  consoleLoggingIntegrationShim,
  elementTimingIntegrationShim,
  loggerShim,
  metricsShim,
} from '@sentry-internal/integration-shims';
import { feedbackAsyncIntegration } from './feedbackAsync';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger, metricsShim as metrics };

export {
  getActiveSpan,
  getRootSpan,
  startNewTrace,
  withActiveSpan,
  getSpanDescendants,
  setMeasurement,
  spanStreamingIntegration,
} from '@sentry/core';
export { startSpan, startInactiveSpan, startSpanManual } from '@sentry/browser-utils';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { isBotUserAgent } from '@sentry/browser-utils';
export { elementTimingIntegrationShim as elementTimingIntegration };
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { reportPageLoaded } from './tracing/reportPageLoaded';

export { fetchStreamPerformanceIntegration } from './integrations/fetchStreamPerformance';
export { webVitalsIntegration } from './integrations/webVitals';

export { getFeedback, sendFeedback } from '@sentry/feedback';

export { feedbackAsyncIntegration as feedbackAsyncIntegration, feedbackAsyncIntegration as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry/replay';
