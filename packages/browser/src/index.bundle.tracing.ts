import { registerSpanErrorInstrumentation } from '@sentry/core';
import {
  consoleLoggingIntegrationShim,
  elementTimingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  metricsShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger, metricsShim as metrics };

export {
  getActiveSpan,
  getRootSpan,
  startNewTrace,
  withActiveSpan,
  getSpanDescendants,
  setMeasurement,
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
export { elementTimingIntegrationShim as elementTimingIntegration };
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';

export { reportPageLoaded } from './tracing/reportPageLoaded';

export { fetchStreamPerformanceIntegration } from './integrations/fetchStreamPerformance';
export { webVitalsIntegration } from './integrations/webVitals';
export { longTasksIntegration } from './integrations/longTasks';
export { resourcesIntegration } from './integrations/resources';
export { fetchTracingIntegration } from './integrations/fetchTracing';
export { xhrTracingIntegration } from './integrations/xhrTracing';
export { linkedTracesIntegration } from './integrations/linkedTraces';

export {
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
};
