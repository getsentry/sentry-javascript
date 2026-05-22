import type { Span, WebFetchHeaders } from '@sentry/core';
import { getClient, httpHeadersToSpanAttributes, winterCGHeadersToDict } from '@sentry/core';

/**
 * Extracts HTTP request headers as span attributes and optionally applies them to a span.
 */
export function addHeadersAsAttributes(
  headers: WebFetchHeaders | Headers | Record<string, string | string[] | undefined> | undefined,
  span?: Span,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  const client = getClient();
  const { httpHeaders } = client?.getDataCollectionOptions() ?? { httpHeaders: { request: false, response: false } };

  if (httpHeaders.request === false) {
    return {};
  }

  const headersDict: Record<string, string | string[] | undefined> =
    headers instanceof Headers || (typeof headers === 'object' && 'get' in headers)
      ? winterCGHeadersToDict(headers as Headers)
      : headers;

  const headerAttributes = httpHeadersToSpanAttributes(headersDict, httpHeaders.request === true);

  if (span) {
    span.setAttributes(headerAttributes);
  }

  return headerAttributes;
}
