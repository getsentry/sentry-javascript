import type { FeedbackScreenshotIntegration, IntegrationFn } from '@sentry/types';
import { createInput } from './createInput';

export const feedbackScreenshotIntegration = ((): FeedbackScreenshotIntegration => {
  return {
    name: 'FeedbackScreenshot',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createInput,
  };
}) satisfies IntegrationFn;
