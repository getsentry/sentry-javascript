import { registerSpanErrorInstrumentation } from '@sentry/core/browser';
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
} from '@sentry/core/browser';

export {
  browserTracingIntegration,
  isBotUserAgent,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { elementTimingIntegration } from '@sentry-internal/browser-utils';
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { spanStreamingIntegration } from './integrations/spanstreaming';

export { getFeedback, sendFeedback } from '@sentry-internal/feedback';

export { feedbackAsyncIntegration as feedbackAsyncIntegration, feedbackAsyncIntegration as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry-internal/replay';
