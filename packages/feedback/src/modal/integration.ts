import type { FeedbackModalIntegration, IntegrationFn } from '@sentry/types';
import { createDialog } from './createDialog';

export const feedbackModalIntegration = ((): FeedbackModalIntegration => {
  return {
    name: 'FeedbackModal',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createDialog,
  };
}) satisfies IntegrationFn;
