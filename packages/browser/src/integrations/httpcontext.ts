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
  };
});
