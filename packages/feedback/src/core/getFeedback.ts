import { getClient } from '@sentry/core';
import type { feedbackIntegration } from './integration';

/**
 * This is a small utility to get a type-safe instance of the Feedback integration.
 */
export function getFeedback(): ReturnType<typeof feedbackIntegration> | undefined {
  const client = getClient();
  return client && client.getIntegrationByName<ReturnType<typeof feedbackIntegration>>('Feedback');
}
