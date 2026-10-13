import type { Integration } from '@sentry/core';
import { consoleSandbox } from '@sentry/core';
import { FAKE_FUNCTION } from './common';

const FEEDBACK_INTEGRATION_METHODS = ['attachTo', 'createForm', 'createWidget', 'remove'] as const;

type FeedbackSpecificMethods = Record<(typeof FEEDBACK_INTEGRATION_METHODS)[number], () => void>;

interface FeedbackIntegration extends Integration, FeedbackSpecificMethods {}

/**
 * This is a shim for the Feedback integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove feedback
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
export const feedbackIntegrationShim = Object.assign(
  (_options: unknown): FeedbackIntegration => {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn('You are using feedbackIntegration() even though this bundle does not include feedback.');
    });

    return {
      name: 'Feedback',
      ...FEEDBACK_INTEGRATION_METHODS.reduce((acc, method) => {
        acc[method] = FAKE_FUNCTION;
        return acc;
      }, {} as FeedbackSpecificMethods),
    };
  },
  {
    _isShim: true,
  },
);
