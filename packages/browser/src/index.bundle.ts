import {
  browserTracingIntegrationShim,
  consoleLoggingIntegrationShim,
  elementTimingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  replayIntegrationShim,
  spanStreamingIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

// TODO(v11): Export metricsShim here once we remove metrics from the base bundle.
export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger };

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  elementTimingIntegrationShim as elementTimingIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
  spanStreamingIntegrationShim as spanStreamingIntegration,
};
