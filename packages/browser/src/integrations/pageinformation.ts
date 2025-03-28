import { defineIntegration, getLocationHref } from '@sentry/core';
import { WINDOW } from '../helpers';

/**
 * Collects information about the current page and attaches it as context to the event.
 */
export const pageInformationIntegration = defineIntegration(() => {
  return {
    // TODO(v10): Update name to "PageInformation"
    name: 'HttpContext',
    preprocessEvent(event) {
      // if none of the information we want exists, don't bother
      if (!WINDOW.navigator && !WINDOW.location && !WINDOW.document) {
        return;
      }

      const href = getLocationHref();

      // grab as much info as exists and add it to the event
      const url = event.request?.url || href;
      const request = {
        ...(url && { url }),
      };
      event.request = request;

      event.contexts = event.contexts || {};
      event.contexts.page = {
        href: href || undefined,
        referrer: WINDOW.document.referrer,
        user_agent: WINDOW.navigator.userAgent,
      };
    },
  };
});

/**
 * Collects information about the current page and attaches it as context to the event.
 *
 * @deprecated This integration was renamed to `pageInformationIntegration`, which should be used instead.
 */
export const httpContextIntegration = pageInformationIntegration;
