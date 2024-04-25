import {
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  replayIntegrationShim as replayIntegration,
};
