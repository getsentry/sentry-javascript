import { _INTERNAL_filterKeyValueData, defineIntegration, safeSetSpanJSONAttributes } from '@sentry/core';
import { getHttpRequestData, WINDOW } from '../helpers';
import { filterCollectedUrl } from '@sentry/core';
import { HTTP_REQUEST_HEADER_KEY_BASE, SENTRY_OP, URL_FULL, USER_AGENT_ORIGINAL } from '@sentry/conventions/attributes';

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

    processSpan(span, client) {
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
        // This attribute is used by the "Filter out events from legacy browsers and crawlers" features on the Sentry backend.
        // Therefore, it's set on every span.
        [USER_AGENT_ORIGINAL]: headers['User-Agent'],

        // These attributes, we only need on the segment span (analogous to the `request` context for events)
        ...(span.is_segment && {
          // Coerce empty string to undefined so the helper's nullish check drops it,
          // rather than writing an empty `url.full` attribute onto the span.
          [URL_FULL]: span.attributes?.[SENTRY_OP] !== 'http.client' ? filterCollectedUrl(reqData.url) : undefined,
          [`${HTTP_REQUEST_HEADER_KEY_BASE}.referer`]: headers['Referer'],
        }),
      });
    },
  };
});
