import { getClient } from '@sentry/core';
import type { buildFeedbackIntegration } from './integration';

type FeedbackIntegration = ReturnType<typeof buildFeedbackIntegration>;

/**
 * This is a small utility to get a type-safe instance of the Feedback integration.
 */
export function getFeedback(): ReturnType<FeedbackIntegration> | undefined {
  const client = getClient();
  return client?.getIntegrationByName<ReturnType<FeedbackIntegration>>('Feedback');
}
