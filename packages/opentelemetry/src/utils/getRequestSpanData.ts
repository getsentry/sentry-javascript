import type { Span } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';
import type { SanitizedRequestData } from '@sentry/types';
import { getSanitizedUrlString, parseUrl } from '@sentry/utils';

import { spanHasAttributes } from './spanTypes';

/**
 * Get sanitizied request data from an OTEL span.
 */
export function getRequestSpanData(span: Span | ReadableSpan): Partial<SanitizedRequestData> {
  // The base `Span` type has no `attributes`, so we need to guard here against that
  if (!spanHasAttributes(span)) {
    return {};
  }

  const data: Partial<SanitizedRequestData> = {
    url: span.attributes[SEMATTRS_HTTP_URL] as string | undefined,
    'http.method': span.attributes[SEMATTRS_HTTP_METHOD] as string | undefined,
  };

  // Default to GET if URL is set but method is not
  if (!data['http.method'] && data.url) {
    data['http.method'] = 'GET';
  }

  try {
    const urlStr = span.attributes[SEMATTRS_HTTP_URL];
    if (typeof urlStr === 'string') {
      const url = parseUrl(urlStr);

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
