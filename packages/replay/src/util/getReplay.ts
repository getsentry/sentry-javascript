import { getClient } from '@sentry/core';
import type { replayIntegration } from '../integration';

/**
 * This is a small utility to get a type-safe instance of the Replay integration.
 */
// eslint-disable-next-line deprecation/deprecation
export function getReplay(): ReturnType<typeof replayIntegration> | undefined {
  const client = getClient();
  return (
    client && client.getIntegrationByName && client.getIntegrationByName<ReturnType<typeof replayIntegration>>('Replay')
  );
}
