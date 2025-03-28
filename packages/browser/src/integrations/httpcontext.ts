import { defineIntegration, getLocationHref } from '@sentry/core';
import { WINDOW } from '../helpers';

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

      // grab as much info as exists and add it to the event
      const url = event.request?.url || getLocationHref();
      const { referrer } = WINDOW.document || {};
      const { userAgent } = WINDOW.navigator || {};

      const headers = {
        ...event.request?.headers,
        ...(referrer && { Referer: referrer }),
        ...(userAgent && { 'User-Agent': userAgent }),
      };
      const request = {
        ...event.request,
        ...(url && { url }),
        headers,
      };

      event.request = request;
    },
  };
});
