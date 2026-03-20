import { getTraceData, SENTRY_BAGGAGE_KEY_PREFIX } from '@sentry/core';

/**
 * Creates a new `RequestInit` with `sentry-trace` and `baggage` headers
 * injected from the current active span / scope.
 *
 * Existing headers on `input` or `init` are preserved; Sentry headers are
 * only added when they are not already present.
 */
export function addTraceHeaders(input: RequestInfo | URL, init?: RequestInit): RequestInit {
  const traceData = getTraceData();
  const sentryTrace = traceData['sentry-trace'];
  const baggage = traceData.baggage;

  if (!sentryTrace) {
    return init || {};
  }

  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));

  if (!headers.has('sentry-trace')) {
    headers.set('sentry-trace', sentryTrace);
  }

  if (baggage) {
    const existing = headers.get('baggage');
    if (!existing) {
      headers.set('baggage', baggage);
    } else if (!existing.split(',').some(entry => entry.trim().startsWith(SENTRY_BAGGAGE_KEY_PREFIX))) {
      headers.set('baggage', `${existing},${baggage}`);
    }
  }

  return { ...init, headers };
}
