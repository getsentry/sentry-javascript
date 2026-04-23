import { defineIntegration } from '@sentry/core';
import { getHttpRequestData, WINDOW } from '../helpers';

/**
 * Collects information about HTTP request headers and
 * attaches them to the event.
 */
export const httpContextIntegration = defineIntegration(() => {
  return {
    name: 'HttpContext',
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
    processSegmentSpan(span) {
      // if none of the information we want exists, don't bother
      if (!WINDOW.navigator && !WINDOW.location && !WINDOW.document) {
        return;
      }

      const reqData = getHttpRequestData();

      span.attributes = {
        'url.full': reqData.url,
        'http.request.header.user_agent': reqData.headers['User-Agent'],
        'http.request.header.referer': reqData.headers['Referer'],
        ...span.attributes,
      };
    },
  };
});
