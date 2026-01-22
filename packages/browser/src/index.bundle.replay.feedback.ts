import {
  browserTracingIntegrationShim,
  consoleLoggingIntegrationShim,
  loggerShim,
} from '@sentry-internal/integration-shims';
import { feedbackAsyncIntegration } from './feedbackAsync';

export * from './index.bundle.base';

// TODO(v11): Export metricsShim here once we remove metrics from the base bundle.
export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger };

export { getFeedback, sendFeedback } from '@sentry-internal/feedback';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackAsyncIntegration as feedbackAsyncIntegration,
  feedbackAsyncIntegration as feedbackIntegration,
};

export { replayIntegration, getReplay } from '@sentry-internal/replay';
