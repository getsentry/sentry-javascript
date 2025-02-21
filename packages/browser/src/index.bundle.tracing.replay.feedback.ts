import { registerSpanErrorInstrumentation } from '@sentry/core';

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
  captureFeedback,
} from '@sentry/core';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';

import { feedbackAsyncIntegration } from './feedbackAsync';
export { getFeedback } from '@sentry-internal/feedback';
export { feedbackAsyncIntegration as feedbackAsyncIntegration, feedbackAsyncIntegration as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry-internal/replay';
