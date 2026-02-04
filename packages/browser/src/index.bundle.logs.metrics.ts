import {
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

// TODO(v11): Export metrics here once we remove it from the base bundle.
export { logger, consoleLoggingIntegration } from '@sentry/core';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
};
