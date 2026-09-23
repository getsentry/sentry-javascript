import { getActiveSpan, hasSpansEnabled, isEnabled, spanIsSampled } from '@sentry/core';

/**
 * Returns `false` when a span started now can never be sent: the SDK is disabled or has no DSN,
 * tracing is not configured, or the active span is not sampled.
 *
 * Binding instrumentations call this before they build span data, so that per-call work
 * (query sanitizing, payload sizing, message parsing) is skipped when no span is sent.
 */
export function canRecordSpan(): boolean {
  if (!isEnabled() || !hasSpansEnabled()) {
    return false;
  }

  const activeSpan = getActiveSpan();
  return !activeSpan || spanIsSampled(activeSpan);
}
