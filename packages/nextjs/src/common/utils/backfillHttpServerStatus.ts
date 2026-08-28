import { HTTP_RESPONSE_STATUS_CODE, HTTP_STATUS_CODE } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { getSpanStatusFromHttpCode, SPAN_STATUS_OK, spanToStaticSpanJSON } from '@sentry/core';

/**
 * Derive the span status of a Next.js `http.server` root span from its HTTP response status code.
 *
 * Next.js instruments some requests only via its own OTel spans (e.g. turbopack builds, where the
 * route-handler wrapper that would otherwise call `setHttpStatus` is not applied). We used to infer the
 * status from the response code at span end; since that inference was removed, derive it here instead.
 *
 * Only runs when the span status is still `ok`, so an error status set by a wrapper or error handler is
 * never overridden. No-ops when there is no numeric response code or the code maps to `ok`.
 */
export function backfillHttpServerStatus(span: Span): void {
  const spanJSON = spanToStaticSpanJSON(span);

  if (spanJSON.status !== 'ok') {
    return;
  }

  const attributes = spanJSON.data;
  // eslint-disable-next-line typescript/no-deprecated
  const code = attributes[HTTP_RESPONSE_STATUS_CODE] ?? attributes[HTTP_STATUS_CODE];
  if (typeof code !== 'number') {
    return;
  }

  const spanStatus = getSpanStatusFromHttpCode(code);
  if (spanStatus.code !== SPAN_STATUS_OK) {
    span.setStatus(spanStatus);
  }
}
