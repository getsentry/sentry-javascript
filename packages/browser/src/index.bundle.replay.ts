import {
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  metricsShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export { replayIntegration, getReplay } from '@sentry-internal/replay';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackIntegrationShim as feedbackAsyncIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  metricsShim as metrics,
};
