import { registerSpanErrorInstrumentation } from '@sentry/core';
import { feedbackAsyncIntegration } from './feedbackAsync';

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
} from '@sentry/core';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { reportPageLoaded } from './tracing/reportPageLoaded';

export { getFeedback, sendFeedback } from '@sentry-internal/feedback';

export { feedbackAsyncIntegration as feedbackAsyncIntegration, feedbackAsyncIntegration as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry-internal/replay';
