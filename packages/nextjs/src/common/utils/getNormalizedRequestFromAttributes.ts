import {
  HTTP_METHOD,
  HTTP_REQUEST_METHOD,
  HTTP_TARGET,
  URL_FULL,
  URL_PATH,
  URL_QUERY,
} from '@sentry/conventions/attributes';
import type { RequestEventData, SpanAttributes } from '@sentry/core';

/**
 * Builds a partial `normalizedRequest` from OTel HTTP span attributes.
 * Only method, URL, and query string can be derived — headers are not available as span attributes.
 */
export function getNormalizedRequestFromAttributes(attributes: SpanAttributes): RequestEventData | undefined {
  // eslint-disable-next-line typescript/no-deprecated
  const method = attributes[HTTP_REQUEST_METHOD] || attributes[HTTP_METHOD];

  // eslint-disable-next-line typescript/no-deprecated
  const url = attributes[URL_FULL] || attributes[URL_PATH] || attributes[HTTP_TARGET];

  if (typeof method !== 'string' && typeof url !== 'string') {
    return undefined;
  }

  const normalizedRequest: RequestEventData = {};

  if (typeof method === 'string') {
    normalizedRequest.method = method;
  }

  if (typeof url === 'string') {
    normalizedRequest.url = url;

    const queryFromAttribute = attributes[URL_QUERY];
    if (typeof queryFromAttribute === 'string') {
      normalizedRequest.query_string = queryFromAttribute;
    } else {
      const queryIndex = url.indexOf('?');
      if (queryIndex !== -1) {
        normalizedRequest.query_string = url.slice(queryIndex + 1);
      }
    }
  }

  return normalizedRequest;
}
