import { addTracingExtensions } from '@sentry/core';

// We are patching the global object with our hub extension methods
addTracingExtensions();

export * from './index.bundle.base';

export {
  getActiveSpan,
  getRootSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  getSpanDescendants,
  setMeasurement,
  addTracingExtensions,
} from '@sentry/core';

export {
  feedbackIntegration,
  feedbackModalIntegration,
  feedbackScreenshotIntegration,
  getFeedback,
} from '@sentry-internal/feedback';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry-internal/browser-utils';

export { replayIntegration } from '@sentry-internal/replay';
