import type { Integration } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';
import { FAKE_FUNCTION } from './common';

const FEEDBACK_INTEGRATION_METHODS = [
  'openDialog',
  'closeDialog',
  'attachTo',
  'createWidget',
  'removeWidget',
  'getWidget',
  'remove',
] as const;

type FeedbackSpecificMethods = Record<(typeof FEEDBACK_INTEGRATION_METHODS)[number], () => void>;

interface FeedbackIntegration extends Integration, FeedbackSpecificMethods {}

/**
 * This is a shim for the Feedback integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove feedback
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
export function feedbackIntegrationShim(_options: unknown): FeedbackIntegration {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn('You are using feedbackIntegration() even though this bundle does not include feedback.');
  });

  return {
    name: 'Feedback',
    ...(FEEDBACK_INTEGRATION_METHODS.reduce((acc, method) => {
      acc[method] = FAKE_FUNCTION;
      return acc;
    }, {} as FeedbackSpecificMethods) as FeedbackSpecificMethods),
  };
}
