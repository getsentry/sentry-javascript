import { HTTP_METHOD, HTTP_REQUEST_METHOD, HTTP_URL, URL_FULL } from '@sentry/conventions/attributes';
import type { SanitizedRequestData, Span } from '@sentry/core';
import { getSanitizedUrlString, parseUrl, spanToJSON } from '@sentry/core';

/**
 * Get sanitized request data from a span.
 */
export function getRequestSpanData(span: Span): Partial<SanitizedRequestData> {
  const attributes = spanToJSON(span).data;

  // eslint-disable-next-line typescript/no-deprecated
  const maybeUrlAttribute = (attributes[URL_FULL] || attributes[HTTP_URL]) as string | undefined;

  const data: Partial<SanitizedRequestData> = {
    url: maybeUrlAttribute,
    // eslint-disable-next-line typescript/no-deprecated
    'http.method': (attributes[HTTP_REQUEST_METHOD] || attributes[HTTP_METHOD]) as string | undefined,
  };

  // Default to GET if URL is set but method is not
  if (!data['http.method'] && data.url) {
    data['http.method'] = 'GET';
  }

  try {
    if (typeof maybeUrlAttribute === 'string') {
      const url = parseUrl(maybeUrlAttribute);

      data.url = getSanitizedUrlString(url);

      if (url.search) {
        data['http.query'] = url.search;
      }
      if (url.hash) {
        data['http.fragment'] = url.hash;
      }
    }
  } catch {
    // ignore
  }

  return data;
}
