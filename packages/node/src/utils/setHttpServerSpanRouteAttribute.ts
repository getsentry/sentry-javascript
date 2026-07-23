import { SENTRY_OP } from '@sentry/conventions/attributes';
import { getActiveSpan, getRootSpan, spanToJSON } from '@sentry/core';

/**
 * Set the `http.route` attribute on the root HTTP server span for the current trace.
 *
 * No-op when there is no active span, no root span, or the root span is not an
 * `http.server` span — so framework instrumentations can call this unconditionally
 * without risking attribute pollution on non-HTTP root spans.
 */
export function setHttpServerSpanRouteAttribute(route: string): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return;
  }
  const rootSpan = getRootSpan(activeSpan);
  if (!rootSpan) {
    return;
  }
  if (spanToJSON(rootSpan).data[SENTRY_OP] !== 'http.server') {
    return;
  }
  rootSpan.setAttribute('http.route', route);
}
