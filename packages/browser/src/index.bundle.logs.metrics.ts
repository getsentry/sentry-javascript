import {
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  replayIntegrationShim,
  spanStreamingIntegrationShim,
  fetchStreamPerformanceIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export { logger, consoleLoggingIntegration, metrics } from '@sentry/core';

export { elementTimingIntegration } from '@sentry/browser-utils';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
  spanStreamingIntegrationShim as spanStreamingIntegration,
  fetchStreamPerformanceIntegrationShim as fetchStreamPerformanceIntegration,
};
