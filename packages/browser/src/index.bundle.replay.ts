import {
  browserTracingIntegrationShim,
  browserTracingCoreIntegrationShim,
  longTasksIntegrationShim,
  resourcesIntegrationShim,
  fetchTracingIntegrationShim,
  xhrTracingIntegrationShim,
  linkedTracesIntegrationShim,
  consoleLoggingIntegrationShim,
  elementTimingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  metricsShim,
  spanStreamingIntegrationShim,
  fetchStreamPerformanceIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger, metricsShim as metrics };

export { replayIntegration, getReplay } from '@sentry/replay';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  browserTracingCoreIntegrationShim as browserTracingCoreIntegration,
  longTasksIntegrationShim as longTasksIntegration,
  resourcesIntegrationShim as resourcesIntegration,
  fetchTracingIntegrationShim as fetchTracingIntegration,
  xhrTracingIntegrationShim as xhrTracingIntegration,
  linkedTracesIntegrationShim as linkedTracesIntegration,
  elementTimingIntegrationShim as elementTimingIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  spanStreamingIntegrationShim as spanStreamingIntegration,
  fetchStreamPerformanceIntegrationShim as fetchStreamPerformanceIntegration,
};
