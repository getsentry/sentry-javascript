import type { Span } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_URL_FULL,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_URL,
} from '@opentelemetry/semantic-conventions';
import { parseStringToURLObject, getSanitizedUrlStringFromUrlObject } from '@sentry/core';
import type { SanitizedRequestData } from '@sentry/core';

import { spanHasAttributes } from './spanTypes';

/**
 * Get sanitizied request data from an OTEL span.
 */
export function getRequestSpanData(span: Span | ReadableSpan): Partial<SanitizedRequestData> {
  // The base `Span` type has no `attributes`, so we need to guard here against that
  if (!spanHasAttributes(span)) {
    return {};
  }

  // eslint-disable-next-line deprecation/deprecation
  const maybeUrlAttribute = (span.attributes[ATTR_URL_FULL] || span.attributes[SEMATTRS_HTTP_URL]) as
    | string
    | undefined;

  const data: Partial<SanitizedRequestData> = {
    url: maybeUrlAttribute,
    // eslint-disable-next-line deprecation/deprecation
    'http.method': (span.attributes[ATTR_HTTP_REQUEST_METHOD] || span.attributes[SEMATTRS_HTTP_METHOD]) as
      | string
      | undefined,
  };

  // Default to GET if URL is set but method is not
  if (!data['http.method'] && data.url) {
    data['http.method'] = 'GET';
  }

  try {
    if (typeof maybeUrlAttribute === 'string') {
      const parsedUrl = parseStringToURLObject(maybeUrlAttribute);
      if (parsedUrl) {
        data.url = getSanitizedUrlStringFromUrlObject(parsedUrl);
        if (parsedUrl.search) {
          data['http.query'] = parsedUrl.search;
        }
        if (parsedUrl.hash) {
          data['http.fragment'] = parsedUrl.hash;
        }
      }
    }
  } catch {
    // ignore
  }

  return data;
}
