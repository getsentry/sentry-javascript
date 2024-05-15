import type { IntegrationFn } from '@sentry/types';
/**
 * Sentry integration for Remote Configuration
 */
export function remoteConfigIntegration() {}

export const replayIntegration = ((options?: ReplayConfiguration) => {
  // TODO
  return {};
}) satisfies IntegrationFn;
