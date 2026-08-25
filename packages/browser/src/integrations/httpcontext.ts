import {
  _INTERNAL_filterKeyValueData,
  defineIntegration,
  safeSetSpanJSONAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
} from '@sentry/core/browser';
import { getHttpRequestData, WINDOW } from '../helpers';
import { filterCollectedUrl } from '@sentry/core';
import { URL_FULL } from '@sentry/conventions/attributes';

/**
 * Collects information about HTTP request headers and
 * attaches them to the event.
 */
export const httpContextIntegration = defineIntegration(() => {
  return {
    name: 'HttpContext' as const,
    preprocessEvent(event, _hint, client) {
      // if none of the information we want exists, don't bother
      if (!WINDOW.navigator && !WINDOW.location && !WINDOW.document) {
        return;
      }

      const { url, headers: collectedHeaders } = getHttpRequestData();

      // We only filter the headers we collected ourselves, so headers the user set are left alone. Going by key
      // means we also catch these headers when `browserTracingIntegration` already put them on the event.
      const behavior = client.getDataCollectionOptions().httpHeaders.request;
      const userHeaders = Object.entries(event.request?.headers ?? {}).filter(([key]) => !(key in collectedHeaders));

      const headers = {
        ..._INTERNAL_filterKeyValueData(collectedHeaders, behavior),
        ...Object.fromEntries(userHeaders),
      };

      event.request = {
        // The URL isn't gated by `dataCollection`, same as on the server.
        url,
        ...event.request,
        ...(Object.keys(headers).length > 0 ? { headers } : { headers: undefined }),
      };
    },
    processSegmentSpan(span, client) {
      const spanOp = span.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP];

      // if none of the information we want exists, don't bother
      if (!WINDOW.navigator && !WINDOW.location && !WINDOW.document) {
        return;
      }

      const reqData = getHttpRequestData();

      // `httpHeadersToSpanAttributes` would also work here, but its cookie and array handling never runs for these
      // two headers and costs every browser bundle ~400B gzip.
      const headers = _INTERNAL_filterKeyValueData(
        reqData.headers,
        client.getDataCollectionOptions().httpHeaders.request,
      );

      safeSetSpanJSONAttributes(span, {
        // Coerce empty string to undefined so the helper's nullish check drops it,
        // rather than writing an empty `url.full` attribute onto the span.
        [URL_FULL]: spanOp !== 'http.client' ? filterCollectedUrl(reqData.url) : undefined,
        'http.request.header.user_agent': headers['User-Agent'],
        'http.request.header.referer': headers['Referer'],
      });
    },
  };
});
