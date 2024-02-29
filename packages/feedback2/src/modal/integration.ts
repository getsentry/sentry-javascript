import { defineIntegration } from '@sentry/core';
import type { IntegrationFn, IntegrationFnResult } from '@sentry/types';
import { createDialog } from './createDialog';

interface PublicFeedback2ModalIntegration {
  createDialog: typeof createDialog;
}

const INTEGRATION_NAME = 'Feedback2Modal';

export type IFeedback2ModalIntegration = IntegrationFnResult & PublicFeedback2ModalIntegration;

export const _feedback2ModalIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createDialog,
  };
}) satisfies IntegrationFn;

export const feedback2ModalIntegration = defineIntegration(_feedback2ModalIntegration);
