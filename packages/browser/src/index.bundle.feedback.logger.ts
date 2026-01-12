import { browserTracingIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';
import { feedbackAsyncIntegration } from './feedbackAsync';

export * from './index.bundle.base';

export { logger } from '@sentry/core';

export { getFeedback, sendFeedback } from '@sentry-internal/feedback';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackAsyncIntegration as feedbackAsyncIntegration,
  feedbackAsyncIntegration as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
};
