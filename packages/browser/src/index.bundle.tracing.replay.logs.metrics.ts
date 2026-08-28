import { registerSpanErrorInstrumentation } from '@sentry/core/browser';
import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

export { logger, consoleLoggingIntegration, metrics } from '@sentry/core/browser';

export {
  getActiveSpan,
  getRootSpan,
  getSpanDescendants,
  setMeasurement,
  startInactiveSpan,
  startNewTrace,
  startSpan,
  startSpanManual,
  withActiveSpan,
} from '@sentry/core/browser';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { isBotUserAgent } from '@sentry/browser-utils';
export { elementTimingIntegration } from '@sentry/browser-utils';
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { spanStreamingIntegration } from './integrations/browserSpanStreaming';
export { fetchStreamPerformanceIntegration } from './integrations/fetchStreamPerformance';
export { webVitalsIntegration } from './integrations/webVitals';

export { feedbackIntegrationShim as feedbackAsyncIntegration, feedbackIntegrationShim as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry/replay';
