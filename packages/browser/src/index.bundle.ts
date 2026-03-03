import {
  browserTracingIntegrationShim,
  consoleLoggingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

// TODO(v11): Export metricsShim here once we remove metrics from the base bundle.
export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger };

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
};
