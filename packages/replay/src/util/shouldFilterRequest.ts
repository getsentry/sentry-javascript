import { getCurrentHub, isSentryRequestUrl } from '@sentry/core';

import type { ReplayContainer } from '../types';

/**
 * Check whether a given request URL should be filtered out. This is so we
 * don't log Sentry ingest requests.
 */
export function shouldFilterRequest(replay: ReplayContainer, url: string): boolean {
  // If we enabled the `traceInternals` experiment, we want to trace everything
  if (__DEBUG_BUILD__ && replay.getOptions()._experiments.traceInternals) {
    return false;
  }

  return isSentryRequestUrl(url, getCurrentHub());
}
