import { registerSpanErrorInstrumentation } from '@sentry/core';
import {
  consoleLoggingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  replayIntegrationShim,
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
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { reportPageLoaded } from './tracing/reportPageLoaded';

export {
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
};
