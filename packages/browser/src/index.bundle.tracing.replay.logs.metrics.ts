import { registerSpanErrorInstrumentation } from '@sentry/core';
import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

export { logger, consoleLoggingIntegration, metrics } from '@sentry/core';

export {
  getActiveSpan,
  getRootSpan,
  getSpanDescendants,
  setMeasurement,
  startNewTrace,
  withActiveSpan,
  spanStreamingIntegration,
} from '@sentry/core';
export { startSpan, startInactiveSpan, startSpanManual } from '@sentry/core/browser';

export {
  browserTracingCoreIntegration,
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { isBotUserAgent } from '@sentry/browser-utils';
export { elementTimingIntegration } from '@sentry/browser-utils';
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { fetchStreamPerformanceIntegration } from './integrations/fetchStreamPerformance';
export { webVitalsIntegration } from './integrations/webVitals';
export { longTasksIntegration } from './integrations/longTasks';
export { resourcesIntegration } from './integrations/resources';
export { fetchTracingIntegration } from './integrations/fetchTracing';
export { xhrTracingIntegration } from './integrations/xhrTracing';
export { linkedTracesIntegration } from './integrations/linkedTraces';

export { feedbackIntegrationShim as feedbackAsyncIntegration, feedbackIntegrationShim as feedbackIntegration };

export { replayIntegration, getReplay } from '@sentry/replay';
