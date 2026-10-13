import {
  browserTracingIntegrationShim,
  consoleLoggingIntegrationShim,
  elementTimingIntegrationShim,
  loggerShim,
  metricsShim,
  spanStreamingIntegrationShim,
  fetchStreamPerformanceIntegrationShim,
} from '@sentry-internal/integration-shims';
import { feedbackAsyncIntegration } from './feedbackAsync';

export * from './index.bundle.base';

export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger, metricsShim as metrics };

export { getFeedback, sendFeedback } from '@sentry/feedback';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  elementTimingIntegrationShim as elementTimingIntegration,
  feedbackAsyncIntegration as feedbackAsyncIntegration,
  feedbackAsyncIntegration as feedbackIntegration,
  spanStreamingIntegrationShim as spanStreamingIntegration,
  fetchStreamPerformanceIntegrationShim as fetchStreamPerformanceIntegration,
};

export { replayIntegration, getReplay } from '@sentry/replay';
