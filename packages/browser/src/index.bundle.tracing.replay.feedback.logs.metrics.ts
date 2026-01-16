import { registerSpanErrorInstrumentation } from '@sentry/core';
import { feedbackAsyncIntegration } from './feedbackAsync';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

// TODO(v11): Export metrics here once we remove it from the base bundle.
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
  logger,
  consoleLoggingIntegration,
} from '@sentry/core';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { getFeedback, sendFeedback } from '@sentry-internal/feedback';

export { feedbackAsyncIntegration as feedbackAsyncIntegration, feedbackAsyncIntegration as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry-internal/replay';
