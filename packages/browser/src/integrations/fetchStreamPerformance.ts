import type { IntegrationFn, Span } from '@sentry/core';
import {
  addFetchEndInstrumentationHandler,
  addFetchInstrumentationHandler,
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';

const responseToStreamSpan = new WeakMap<object, Span>();

export const fetchStreamPerformanceIntegration = defineIntegration(() => {
  return {
    name: 'FetchStreamPerformance',

    setup() {
      addFetchEndInstrumentationHandler(handlerData => {
        if (handlerData.response) {
          const streamSpan = responseToStreamSpan.get(handlerData.response);
          if (streamSpan && handlerData.endTimestamp) {
            streamSpan.end(handlerData.endTimestamp);
          }
        }
      });

      addFetchInstrumentationHandler(handlerData => {
        if (handlerData.endTimestamp && handlerData.response) {
          const url = handlerData.fetchData?.url;
          const method = handlerData.fetchData?.method;

          const streamSpan = startInactiveSpan({
            name: `${method} ${url}`,
            op: 'http.client.stream',
            startTime: handlerData.endTimestamp,
            attributes: {
              url,
              'http.method': method,
              type: 'fetch',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client.stream',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser.stream',
            },
          });

          responseToStreamSpan.set(handlerData.response, streamSpan);
        }
      });
    },
  };
}) satisfies IntegrationFn;
