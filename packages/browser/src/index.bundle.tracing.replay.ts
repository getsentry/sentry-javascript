import { registerSpanErrorInstrumentation } from '@sentry/core/browser';
import {
  consoleLoggingIntegrationShim,
  elementTimingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  metricsShim,
} from '@sentry-internal/integration-shims';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger, metricsShim as metrics };

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
} from '@sentry/core/browser';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { isBotUserAgent } from '@sentry/browser-utils';
export { elementTimingIntegrationShim as elementTimingIntegration };
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { spanStreamingIntegration } from '@sentry/core/browser';
export { fetchStreamPerformanceIntegration } from './integrations/fetchStreamPerformance';
export { webVitalsIntegration } from './integrations/webVitals';

export { feedbackIntegrationShim as feedbackAsyncIntegration, feedbackIntegrationShim as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry/replay';
