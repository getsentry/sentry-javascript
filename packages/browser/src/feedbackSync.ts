import {
  buildFeedbackIntegration,
  feedbackModalIntegration,
  feedbackScreenshotIntegration,
} from '@sentry-internal/feedback';

/** Add a widget to capture user feedback to your application. */
export const feedbackSyncIntegration: ReturnType<typeof buildFeedbackIntegration> = buildFeedbackIntegration({
  getModalIntegration: () => feedbackModalIntegration,
  getScreenshotIntegration: () => feedbackScreenshotIntegration,
});
