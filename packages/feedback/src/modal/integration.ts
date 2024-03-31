import type { Integration, IntegrationFn } from '@sentry/types';
import { createDialog } from './createDialog';

interface PublicFeedbackModalIntegration {
  createDialog: typeof createDialog;
}

export type FeedbackModalIntegration = Integration & PublicFeedbackModalIntegration;

export const feedbackModalIntegration = ((): FeedbackModalIntegration => {
  return {
    name: 'FeedbackModal',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createDialog,
  };
}) satisfies IntegrationFn;
