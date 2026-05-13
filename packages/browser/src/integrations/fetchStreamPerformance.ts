import type { IntegrationFn, Span } from '@sentry/core';
import {
  addFetchEndInstrumentationHandler,
  addFetchInstrumentationHandler,
  defineIntegration,
  getSanitizedUrlStringFromUrlObject,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  stripDataUrlContent,
} from '@sentry/core';

const responseToStreamSpan = new WeakMap<object, Span>();
const responseToFallbackTimeout = new WeakMap<object, ReturnType<typeof setTimeout>>();

// Matches the max timeout in `resolveResponse` in packages/core/src/instrument/fetch.ts
const STREAM_RESOLVE_FALLBACK_MS = 90_000;

export const fetchStreamPerformanceIntegration = defineIntegration(() => {
  return {
    name: 'FetchStreamPerformance',

    setup() {
      addFetchEndInstrumentationHandler(handlerData => {
        if (handlerData.response) {
          const streamSpan = responseToStreamSpan.get(handlerData.response);
          if (streamSpan && handlerData.endTimestamp) {
            streamSpan.end(handlerData.endTimestamp);

            const fallbackTimeout = responseToFallbackTimeout.get(handlerData.response);
            if (fallbackTimeout) {
              clearTimeout(fallbackTimeout);
            }
          }
        }
      });

      addFetchInstrumentationHandler(handlerData => {
        if (handlerData.endTimestamp && handlerData.response) {
          const url = handlerData.fetchData?.url || '';
          const method = handlerData.fetchData?.method || 'GET';

          const parsedUrl = parseStringToURLObject(url);
          const sanitizedUrl = url.startsWith('data:')
            ? stripDataUrlContent(url)
            : parsedUrl
              ? getSanitizedUrlStringFromUrlObject(parsedUrl)
              : url;

          const streamSpan = startInactiveSpan({
            name: `${method} ${sanitizedUrl}`,
            startTime: handlerData.endTimestamp,
            attributes: {
              url: stripDataUrlContent(url),
              'http.method': method,
              type: 'fetch',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client.stream',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser.stream',
            },
          });

          responseToStreamSpan.set(handlerData.response, streamSpan);

          const fallbackTimeout = setTimeout(() => {
            if (streamSpan.isRecording()) {
              streamSpan.end();
            }
          }, STREAM_RESOLVE_FALLBACK_MS);

          responseToFallbackTimeout.set(handlerData.response, fallbackTimeout);
        }
      });
    },
  };
}) satisfies IntegrationFn;
