import { HTTP_REQUEST_METHOD, SENTRY_OP, URL_DOMAIN, URL_FULL } from '@sentry/conventions/attributes';
import { HTTP_CLIENT_STREAM } from '@sentry/conventions/op';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  addFetchEndInstrumentationHandler,
  addFetchInstrumentationHandler,
  defineIntegration,
  getSanitizedUrlStringFromUrlObject,
  getUrlDomain,
  hasSpanStreamingEnabled,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  stripDataUrlContent,
  filterCollectedUrl,
} from '@sentry/core';
import { startInactiveSpan } from '@sentry/core/browser';
import { WINDOW } from '../helpers';

const responseToStreamSpan = new WeakMap<object, Span>();
const responseToFallbackTimeout = new WeakMap<object, ReturnType<typeof setTimeout>>();

// Matches the max timeout in `resolveResponse` in packages/core/src/instrument/fetch.ts
const STREAM_RESOLVE_FALLBACK_MS = 90_000;

const STREAMING_CONTENT_TYPES = ['text/event-stream', 'application/x-ndjson', 'application/stream+json'];

/**
 * Tracks streamed fetch response bodies by creating an `http.client.stream` sibling span.
 *
 * The regular `http.client` span ends when response headers arrive. This integration adds
 * a span that starts at header arrival and ends when the body fully resolves:
 *
 * ```
 * --------- pageload --------------------------------
 *     -- http.client --
 *                       -- http.client.stream -------
 * ```
 */
export const fetchStreamPerformanceIntegration = defineIntegration(() => {
  return {
    name: 'FetchStreamPerformance' as const,

    setup(client) {
      // End the stream span when the response body finishes resolving
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
        // Only create the stream span once headers have arrived
        if (handlerData.endTimestamp && handlerData.response) {
          // Only create stream spans for responses that are likely streamed:
          // 1. No content-length header (streamed responses don't know the size upfront)
          // 2. Content-type is a known streaming type (avoids false positives on HTTP/2
          //    where content-length is often omitted even for regular responses)
          const contentType = handlerData.response.headers?.get('content-type') || '';
          if (
            handlerData.response.headers?.get('content-length') ||
            !STREAMING_CONTENT_TYPES.some(t => contentType.startsWith(t))
          ) {
            return;
          }

          const url = handlerData.fetchData?.url || '';
          const method = handlerData.fetchData?.method || 'GET';

          const parsedUrl = parseStringToURLObject(url);
          const sanitizedUrl = url.startsWith('data:')
            ? stripDataUrlContent(url)
            : parsedUrl
              ? getSanitizedUrlStringFromUrlObject(parsedUrl)
              : url;

          // `http.client.stream` follows the same name rules as `http.client`.
          const domain = getUrlDomain(url, WINDOW.location?.origin);
          const streamedName = domain ? `${method} ${domain}` : method;
          const streamSpan = startInactiveSpan({
            name: hasSpanStreamingEnabled(client) ? streamedName : `${method} ${sanitizedUrl}`,
            startTime: handlerData.endTimestamp,
            attributes: {
              [URL_FULL]: filterCollectedUrl(stripDataUrlContent(url)),
              [URL_DOMAIN]: domain,
              [HTTP_REQUEST_METHOD]: method,
              type: 'fetch',
              [SENTRY_OP]: HTTP_CLIENT_STREAM,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser.stream',
            },
          });

          responseToStreamSpan.set(handlerData.response, streamSpan);

          // prevent the span from leaking indefinitely if the body never resolves
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
