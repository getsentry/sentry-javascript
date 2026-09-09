import { defineIntegration, safeSetSpanJSONAttributes } from '@sentry/core/browser';
import { getHttpRequestData, WINDOW } from '../helpers';
import { HTTP_REQUEST_HEADER_KEY_BASE, SENTRY_OP, URL_FULL, USER_AGENT_ORIGINAL } from '@sentry/conventions/attributes';

/**
 * Collects information about HTTP request headers and
 * attaches them to the event.
 */
export const httpContextIntegration = defineIntegration(() => {
  return {
    name: 'HttpContext' as const,
    preprocessEvent(event) {
      // if none of the information we want exists, don't bother
      if (!WINDOW.navigator && !WINDOW.location && !WINDOW.document) {
        return;
      }

      const reqData = getHttpRequestData();
      const headers = {
        ...reqData.headers,
        ...event.request?.headers,
      };

      event.request = {
        ...reqData,
        ...event.request,
        headers,
      };
    },

    processSpan(span) {
      // if none of the information we want exists, don't bother
      if (!WINDOW.navigator && !WINDOW.location && !WINDOW.document) {
        return;
      }

      const reqData = getHttpRequestData();

      safeSetSpanJSONAttributes(span, {
        // This attribute is used by the "Filter out events from legacy browsers and crawlers" features on the Sentry backend.
        // Therefore, it's set on every span.
        [USER_AGENT_ORIGINAL]: reqData.headers['User-Agent'],

        // These attributes, we only need on the segment span (analogous to the `request` context for events)
        ...(span.is_segment && {
          // Coerce empty string to undefined so the helper's nullish check drops it,
          // rather than writing an empty `url.full` attribute onto the span.
          [URL_FULL]: span.attributes?.[SENTRY_OP] !== 'http.client' ? reqData.url : undefined,
          [`${HTTP_REQUEST_HEADER_KEY_BASE}.referer`]: reqData.headers['Referer'],
        }),
      });
    },
  };
});
