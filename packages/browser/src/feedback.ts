import {
  buildFeedbackIntegration,
  feedbackModalIntegration,
  feedbackScreenshotIntegration,
} from '@sentry-internal/feedback';
import { lazyLoadIntegration } from './utils/lazyLoadIntegration';

// The full feedback widget, with everything pre-loaded
export const feedbackIntegration = buildFeedbackIntegration({
  lazyLoadIntegration,
  getModalIntegration: () => feedbackModalIntegration,
  getScreenshotIntegration: () => feedbackScreenshotIntegration,
});

// This is for users who want to have a lazy-loaded feedback widget
export const feedbackAsyncIntegration = buildFeedbackIntegration({
  lazyLoadIntegration,
  getModalIntegration: null,
  getScreenshotIntegration: null,
});
