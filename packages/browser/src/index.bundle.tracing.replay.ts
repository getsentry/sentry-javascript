import { registerSpanErrorInstrumentation } from '@sentry/core';
import { consoleLoggingIntegrationShim, feedbackIntegrationShim, loggerShim } from '@sentry-internal/integration-shims';

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
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { feedbackIntegrationShim as feedbackAsyncIntegration, feedbackIntegrationShim as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry-internal/replay';
