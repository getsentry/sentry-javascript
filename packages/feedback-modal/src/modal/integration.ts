import type { Integration, IntegrationFn } from '@sentry/types';

export interface FeedbackModalIntegration extends Integration {
  createDialog: unknown;
}

export const feedbackModalIntegration = ((): FeedbackModalIntegration => {
  return {
    name: 'FeedbackModal',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    createDialog: () => {}, // TODO(ryan953): port this over from packages/feedback/src/modal
  };
}) satisfies IntegrationFn;
