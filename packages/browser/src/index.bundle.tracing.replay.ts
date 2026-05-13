import { registerSpanErrorInstrumentation } from '@sentry/core';
import {
  consoleLoggingIntegrationShim,
  elementTimingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
} from '@sentry-internal/integration-shims';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

// TODO(v11): Export metricsShim here once we remove metrics from the base bundle.
export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger };

export {
  getActiveSpan,
  getRootSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  startNewTrace,
  withActiveSpan,
  getSpanDescendants,
  setMeasurement,
} from '@sentry/core';

export {
  browserTracingIntegration,
  isBotUserAgent,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { elementTimingIntegrationShim as elementTimingIntegration };
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { spanStreamingIntegration } from './integrations/spanstreaming';
export { fetchStreamPerformanceIntegration } from './integrations/fetchStreamPerformance';

export { feedbackIntegrationShim as feedbackAsyncIntegration, feedbackIntegrationShim as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry-internal/replay';
