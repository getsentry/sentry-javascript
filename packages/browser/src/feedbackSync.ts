import {
  buildFeedbackIntegration,
  feedbackModalIntegration,
  feedbackScreenshotIntegration,
} from '@sentry-internal/feedback';
import { lazyLoadIntegration } from './utils/lazyLoadIntegration';

/** Add a widget to capture user feedback to your application. */
export const feedbackSyncIntegration = buildFeedbackIntegration({
  lazyLoadIntegration,
  getModalIntegration: () => feedbackModalIntegration,
  getScreenshotIntegration: () => feedbackScreenshotIntegration,
});
