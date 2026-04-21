import { registerSpanErrorInstrumentation } from '@sentry/core';
import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

// TODO(v11): Export metrics here once we remove it from the base bundle.
export { logger, consoleLoggingIntegration } from '@sentry/core';

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
} from '@sentry/core';

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

export { feedbackIntegrationShim as feedbackAsyncIntegration, feedbackIntegrationShim as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry-internal/replay';
