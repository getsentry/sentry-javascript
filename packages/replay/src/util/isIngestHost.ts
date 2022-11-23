import { getCurrentHub } from '@sentry/core';

import { isInternal } from './isInternal';

/**
 * Checks is `targetHost` is a Sentry ingestion host
 */
export function isIngestHost(targetHost: string): boolean {
  const { protocol, host } = getCurrentHub().getClient()?.getDsn() || {};

  // XXX: Special case when this integration is used by Sentry on `sentry.io`
  // We would like to capture network requests made to our ingest endpoints for debugging
  if (isInternal()) {
    return false;
  }

  return targetHost.startsWith(`${protocol}://${host}`);
}
