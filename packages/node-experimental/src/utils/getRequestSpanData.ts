import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { SanitizedRequestData } from '@sentry/types';
import { getSanitizedUrlString, parseUrl } from '@sentry/utils';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'http';

import type { OtelSpan } from '../types';

/**
 * Get sanitizied request data from an OTEL span.
 */
export function getRequestSpanData(
  span: OtelSpan,
  _request: ClientRequest | IncomingMessage,
  _response: IncomingMessage | ServerResponse,
): SanitizedRequestData {
  const data: SanitizedRequestData = {
    url: span.attributes[SemanticAttributes.HTTP_URL] as string,
    'http.method': (span.attributes[SemanticAttributes.HTTP_METHOD] as string) || 'GET',
  };

  try {
    const urlStr = span.attributes[SemanticAttributes.HTTP_URL];
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
