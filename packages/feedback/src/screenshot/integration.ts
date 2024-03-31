import type { FeedbackCreateInputElement, Integration, IntegrationFn } from '@sentry/types';
import { createInput } from './createInput';

interface PublicFeedbackScreenshotIntegration {
  createInput: FeedbackCreateInputElement;
}

export type FeedbackScreenshotIntegration = Integration & PublicFeedbackScreenshotIntegration;

export const feedbackScreenshotIntegration = ((): FeedbackScreenshotIntegration => {
  return {
    name: 'FeedbackScreenshot',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createInput,
  };
}) satisfies IntegrationFn;
