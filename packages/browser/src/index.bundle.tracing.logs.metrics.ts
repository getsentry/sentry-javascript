import { registerSpanErrorInstrumentation } from '@sentry/core';
import { feedbackIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

export { logger, consoleLoggingIntegration, metrics } from '@sentry/core';

export {
  getActiveSpan,
  getRootSpan,
  getSpanDescendants,
  setMeasurement,
  startNewTrace,
  withActiveSpan,
  spanStreamingIntegration,
} from '@sentry/core';

export { startSpan, startInactiveSpan, startSpanManual } from '@sentry/core/browser';
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

export {
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
};
