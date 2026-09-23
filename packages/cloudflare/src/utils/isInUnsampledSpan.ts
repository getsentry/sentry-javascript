import { getActiveSpan, spanIsSampled } from '@sentry/core';

/**
 * Returns `true` when an active span exists and is not sampled. Returns `false` when there is no active span.
 */
export function isInUnsampledSpan(): boolean {
  const activeSpan = getActiveSpan();
  return !!activeSpan && !spanIsSampled(activeSpan);
}
