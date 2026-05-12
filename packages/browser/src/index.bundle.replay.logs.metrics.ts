import {
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  spanStreamingIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

// TODO(v11): Export metrics here once we remove it from the base bundle.
export { logger, consoleLoggingIntegration } from '@sentry/core/browser';

export { replayIntegration, getReplay } from '@sentry-internal/replay';

export { elementTimingIntegration } from '@sentry-internal/browser-utils';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  spanStreamingIntegrationShim as spanStreamingIntegration,
};
