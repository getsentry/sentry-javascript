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
  loggerShim,
  metricsShim,
  replayIntegrationShim,
  spanStreamingIntegrationShim,
  fetchStreamPerformanceIntegrationShim,
} from '@sentry-internal/integration-shims';
import { feedbackAsyncIntegration } from './feedbackAsync';

export * from './index.bundle.base';

export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger, metricsShim as metrics };

export { getFeedback, sendFeedback } from '@sentry/feedback';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  browserTracingCoreIntegrationShim as browserTracingCoreIntegration,
  longTasksIntegrationShim as longTasksIntegration,
  resourcesIntegrationShim as resourcesIntegration,
  fetchTracingIntegrationShim as fetchTracingIntegration,
  xhrTracingIntegrationShim as xhrTracingIntegration,
  linkedTracesIntegrationShim as linkedTracesIntegration,
  elementTimingIntegrationShim as elementTimingIntegration,
  feedbackAsyncIntegration as feedbackAsyncIntegration,
  feedbackAsyncIntegration as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
  spanStreamingIntegrationShim as spanStreamingIntegration,
  fetchStreamPerformanceIntegrationShim as fetchStreamPerformanceIntegration,
};
