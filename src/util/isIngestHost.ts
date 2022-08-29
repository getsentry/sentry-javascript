import { getCurrentHub } from '@sentry/core';

/**
 * Checks is `targetHost` is a Sentry ingestion host
 */
export function isIngestHost(targetHost: string) {
  const { protocol, host } = getCurrentHub().getClient()?.getDsn() || {};

  return targetHost.startsWith(`${protocol}://${host}`);
}
