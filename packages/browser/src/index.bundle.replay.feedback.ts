import { browserTracingIntegrationShim } from '@sentry-internal/integration-shims';
import { feedbackAsyncIntegration } from './feedbackAsync';

export * from './index.bundle.base';

export { getFeedback, sendFeedback } from '@sentry-internal/feedback';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackAsyncIntegration as feedbackAsyncIntegration,
  feedbackAsyncIntegration as feedbackIntegration,
};

export { replayIntegration, getReplay } from '@sentry-internal/replay';
