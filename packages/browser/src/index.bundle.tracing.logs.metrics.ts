import { registerSpanErrorInstrumentation } from '@sentry/core/browser';
import { feedbackIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

export { logger, consoleLoggingIntegration, metrics } from '@sentry/core/browser';

export {
  getActiveSpan,
  getRootSpan,
  getSpanDescendants,
  startInactiveSpan,
  startNewTrace,
  startSpan,
  startSpanManual,
  withActiveSpan,
} from '@sentry/core/browser';

export {
  browserTracingIntegration,
  isBotUserAgent,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { elementTimingIntegration } from '@sentry/browser-utils';
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { spanStreamingIntegration } from './integrations/spanstreaming';
export { fetchStreamPerformanceIntegration } from './integrations/fetchStreamPerformance';
export { webVitalsIntegration } from './integrations/webVitals';

export {
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
};
