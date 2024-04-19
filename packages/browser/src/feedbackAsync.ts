import { buildFeedbackIntegration } from '@sentry-internal/feedback';
import { lazyLoadIntegration } from './utils/lazyLoadIntegration';

// This is for users who want to have a lazy-loaded feedback widget
export const feedbackAsyncIntegration = buildFeedbackIntegration({
  lazyLoadIntegration,
  getModalIntegration: null,
  getScreenshotIntegration: null,
});
