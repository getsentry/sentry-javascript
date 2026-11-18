import {
  browserTracingIntegrationShim,
  browserTracingCoreIntegrationShim,
  longTasksIntegrationShim,
  resourcesIntegrationShim,
  fetchTracingIntegrationShim,
  xhrTracingIntegrationShim,
  linkedTracesIntegrationShim,
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
  browserTracingCoreIntegrationShim as browserTracingCoreIntegration,
  longTasksIntegrationShim as longTasksIntegration,
  resourcesIntegrationShim as resourcesIntegration,
  fetchTracingIntegrationShim as fetchTracingIntegration,
  xhrTracingIntegrationShim as xhrTracingIntegration,
  linkedTracesIntegrationShim as linkedTracesIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
  spanStreamingIntegrationShim as spanStreamingIntegration,
  fetchStreamPerformanceIntegrationShim as fetchStreamPerformanceIntegration,
};
