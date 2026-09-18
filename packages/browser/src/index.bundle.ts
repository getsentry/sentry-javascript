import {
  browserTracingIntegrationShim,
  consoleLoggingIntegrationShim,
  elementTimingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  metricsShim,
  replayIntegrationShim,
  spanStreamingIntegrationShim,
  fetchStreamPerformanceIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger, metricsShim as metrics };

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  elementTimingIntegrationShim as elementTimingIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
  spanStreamingIntegrationShim as spanStreamingIntegration,
  fetchStreamPerformanceIntegrationShim as fetchStreamPerformanceIntegration,
};
