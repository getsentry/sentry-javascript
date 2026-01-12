import { browserTracingIntegrationShim } from '@sentry-internal/integration-shims';
import { feedbackAsyncIntegration } from './feedbackAsync';

export * from './index.bundle.base';

export { logger } from '@sentry/core';

export { getFeedback, sendFeedback } from '@sentry-internal/feedback';

export { replayIntegration, getReplay } from '@sentry-internal/replay';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackAsyncIntegration as feedbackAsyncIntegration,
  feedbackAsyncIntegration as feedbackIntegration,
};
