import { HTTP_METHOD, HTTP_REQUEST_METHOD, HTTP_ROUTE, SENTRY_OP } from '@sentry/conventions/attributes';
import { getActiveSpan, getRootSpan, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, spanToJSON } from '@sentry/core';

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

  const attributes = spanToJSON(rootSpan).attributes;
  if (attributes[SENTRY_OP] !== 'http.server') {
    return;
  }

  // eslint-disable-next-line typescript/no-deprecated
  const method = attributes[HTTP_REQUEST_METHOD] || attributes[HTTP_METHOD] || 'GET';
  rootSpan.setAttribute(HTTP_ROUTE, route);
  rootSpan.updateName(`${method} ${route}`);
  rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
}
