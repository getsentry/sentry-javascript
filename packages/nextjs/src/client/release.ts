import { WINDOW } from '@sentry/react';
import { RELEASE_SERVER_TIMING_NAME } from '../common/utils/releaseServerTiming';

/**
 * Reads the release from the `Server-Timing` header of the document response, which `withSentryConfig` adds with
 * `release.inject: false`.
 */
export function getServerTimingRelease(): string | undefined {
  // The cast is required for the declaration build, which resolves `getEntriesByType('navigation')`
  // to `PerformanceEntry[]` without `serverTiming`.
  const navigation = WINDOW.performance?.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  const description = navigation?.serverTiming?.find(entry => entry.name === RELEASE_SERVER_TIMING_NAME)?.description;
  if (!description) {
    return undefined;
  }
  try {
    return decodeURIComponent(description);
  } catch {
    return undefined;
  }
}
