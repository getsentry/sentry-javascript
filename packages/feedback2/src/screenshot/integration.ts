import { defineIntegration } from '@sentry/core';
import type { IntegrationFn, IntegrationFnResult } from '@sentry/types';
import { createInput } from './createInput';

interface PublicFeedback2ScreenshotIntegration {
  createInput: typeof createInput;
}

const INTEGRATION_NAME = 'Feedback2Screenshot';

export type IFeedback2ScreenshotIntegration = IntegrationFnResult & PublicFeedback2ScreenshotIntegration;

export const _feedback2ScreenshotIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createInput,
  };
}) satisfies IntegrationFn;

export const feedback2ScreenshotIntegration = defineIntegration(_feedback2ScreenshotIntegration);
