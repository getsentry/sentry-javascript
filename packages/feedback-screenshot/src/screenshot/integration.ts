import type { Integration, IntegrationFn } from '@sentry/types';

export interface FeedbackScreenshotIntegration extends Integration {
  createInput: unknown;
}

export const feedbackScreenshotIntegration = (() => {
  return {
    name: 'FeedbackScreenshot',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    createInput: () => {}, // TODO(ryan953): port this over from packages/feedback/src/screenshot
  };
}) satisfies IntegrationFn;
