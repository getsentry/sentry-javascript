import {
  buildFeedbackIntegration,
  feedbackModalIntegration,
  feedbackScreenshotIntegration,
} from '@sentry-internal/feedback';
import { lazyLoadIntegration } from './utils/lazyLoadIntegration';

// The full feedback widget, with everything pre-loaded
export const feedbackSyncIntegration = buildFeedbackIntegration({
  lazyLoadIntegration,
  getModalIntegration: () => feedbackModalIntegration,
  getScreenshotIntegration: () => feedbackScreenshotIntegration,
});
