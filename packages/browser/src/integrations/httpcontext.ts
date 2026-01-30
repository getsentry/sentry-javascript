import {
  defineIntegration,
  hasSpanStreamingEnabled,
  httpHeadersToSpanAttributes,
  safeSetSpanJSONAttributes,
  SEMANTIC_ATTRIBUTE_URL_FULL,
} from '@sentry/core';
import { getHttpRequestData, WINDOW } from '../helpers';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean | undefined;

/**
 * Collects information about HTTP request headers and
 * attaches them to the event.
 */
export const httpContextIntegration = defineIntegration(() => {
  const inBrowserEnvironment = WINDOW.navigator || WINDOW.location || WINDOW.document;

  return {
    name: 'HttpContext',
    setup(client) {
      if (!inBrowserEnvironment) {
        return;
      }

      if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
        if (hasSpanStreamingEnabled(client)) {
          client.on('processSegmentSpan', spanJSON => {
            const { url, headers } = getHttpRequestData();

            const attributeHeaders = httpHeadersToSpanAttributes(headers);

            safeSetSpanJSONAttributes(spanJSON, {
              [SEMANTIC_ATTRIBUTE_URL_FULL]: url,
              ...attributeHeaders,
            });
          });
        }
      }
    },
    preprocessEvent(event) {
      // if none of the information we want exists, don't bother
      if (!inBrowserEnvironment) {
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
