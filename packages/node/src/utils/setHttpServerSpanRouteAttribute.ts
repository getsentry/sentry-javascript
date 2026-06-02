import { getActiveSpan, getRootSpan, SEMANTIC_ATTRIBUTE_SENTRY_OP, spanToJSON } from '@sentry/core';

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
  if (spanToJSON(rootSpan).data[SEMANTIC_ATTRIBUTE_SENTRY_OP] !== 'http.server') {
    return;
  }
  rootSpan.setAttribute('http.route', route);
}
