import { registerSpanErrorInstrumentation } from '@sentry/core';
import { feedbackIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

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
  logger,
} from '@sentry/core';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export {
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
};
