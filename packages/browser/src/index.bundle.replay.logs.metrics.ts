import {
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  spanStreamingIntegrationShim,
  fetchStreamPerformanceIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export { logger, consoleLoggingIntegration, metrics } from '@sentry/core/browser';

export { replayIntegration, getReplay } from '@sentry/replay';

export { elementTimingIntegration } from '@sentry/browser-utils';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  spanStreamingIntegrationShim as spanStreamingIntegration,
  fetchStreamPerformanceIntegrationShim as fetchStreamPerformanceIntegration,
};
