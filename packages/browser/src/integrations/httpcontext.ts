import {
  defineIntegration,
  httpHeadersToSpanAttributes,
  safeSetSpanAttributes,
  SEMANTIC_ATTRIBUTE_URL_FULL,
} from '@sentry/core';
import { getHttpRequestData, WINDOW } from '../helpers';

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

      if (client.getOptions().traceLifecycle === 'stream') {
        client.on('processSpan', (span, { readOnlySpan }) => {
          if (readOnlySpan.is_segment) {
            const { url, headers } = getHttpRequestData();

            const attributeHeaders = httpHeadersToSpanAttributes(headers);

            safeSetSpanAttributes(
              span,
              {
                [SEMANTIC_ATTRIBUTE_URL_FULL]: url,
                ...attributeHeaders,
              },
              readOnlySpan.attributes,
            );
          }
        });
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
