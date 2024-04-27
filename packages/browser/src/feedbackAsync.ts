import { buildFeedbackIntegration } from '@sentry-internal/feedback';
import { lazyLoadIntegration } from './utils/lazyLoadIntegration';

/**
 * An integration to add user feedback to your application,
 * while loading most of the code lazily only when it's needed.
 */
export const feedbackAsyncIntegration = buildFeedbackIntegration({
  lazyLoadIntegration,
});
