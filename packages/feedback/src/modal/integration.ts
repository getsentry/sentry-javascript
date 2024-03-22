import { defineIntegration } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/types';
import { createDialog } from './createDialog';

interface PublicFeedbackModalIntegration {
  createDialog: typeof createDialog;
}

const INTEGRATION_NAME = 'FeedbackModal';

export type IFeedbackModalIntegration = Integration & PublicFeedbackModalIntegration;

export const _feedbackModalIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createDialog,
  };
}) satisfies IntegrationFn;

export const feedbackModalIntegration = defineIntegration(_feedbackModalIntegration);
