import type { Span } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { HTTP_METHOD, HTTP_REQUEST_METHOD, HTTP_URL, URL_FULL } from '@sentry/conventions/attributes';
import type { SanitizedRequestData } from '@sentry/core';
import { getSanitizedUrlString, parseUrl } from '@sentry/core';
import { spanHasAttributes } from './spanTypes';

/**
 * Get sanitizied request data from an OTEL span.
 */
export function getRequestSpanData(span: Span | ReadableSpan): Partial<SanitizedRequestData> {
  // The base `Span` type has no `attributes`, so we need to guard here against that
  if (!spanHasAttributes(span)) {
    return {};
  }

  // eslint-disable-next-line typescript/no-deprecated
  const maybeUrlAttribute = (span.attributes[URL_FULL] || span.attributes[HTTP_URL]) as string | undefined;

  const data: Partial<SanitizedRequestData> = {
    url: maybeUrlAttribute,
    // eslint-disable-next-line typescript/no-deprecated
    'http.method': (span.attributes[HTTP_REQUEST_METHOD] || span.attributes[HTTP_METHOD]) as string | undefined,
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
