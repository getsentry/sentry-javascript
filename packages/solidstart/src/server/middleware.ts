import { addNonEnumerableProperty, getTraceMetaTags } from '@sentry/core';
import { injectHtmlIntoHeadStream } from '@sentry/server-utils';
import type { ResponseMiddleware } from '@solidjs/start/middleware';
import type { FetchEvent } from '@solidjs/start/server';

export type ResponseMiddlewareResponse = Parameters<ResponseMiddleware>[1] & {
  __sentry_wrapped__?: boolean;
};

// Brand that h3 v2 puts on the prototype of its `HTTPResponse` class. SolidStart 2 passes an
// `HTTPResponse` as `response.body`, with the rendered HTML stream in its `body` field.
const H3_HTTP_RESPONSE_BRAND = Symbol.for('h3.HTTPResponse');

function isH3HttpResponse(value: unknown): value is { body: unknown } {
  return typeof value === 'object' && value !== null && H3_HTTP_RESPONSE_BRAND in value;
}

/**
 * Returns an `onBeforeResponse` solid start middleware handler that adds tracing data as
 * <meta> tags to a page on pageload to enable distributed tracing.
 */
export function sentryBeforeResponseMiddleware() {
  return async function onBeforeResponse(event: FetchEvent, response: ResponseMiddlewareResponse) {
    if (!response.body || response.__sentry_wrapped__) {
      return;
    }

    // Ensure we don't double-wrap, in case a user has added the middleware twice
    // e.g. once manually, once via the wizard
    addNonEnumerableProperty(response, '__sentry_wrapped__', true);

    const contentType = event.response.headers.get('content-type');
    const isPageloadRequest = contentType?.startsWith('text/html');

    if (!isPageloadRequest) {
      return;
    }

    // SolidStart 2 ignores a replaced `response.body` and sends the `HTTPResponse` it holds, so
    // the stream is replaced on that object instead.
    const target = isH3HttpResponse(response.body) ? response.body : response;

    // Strings from the `sync` and `async` render modes are sent unchanged.
    if (target.body instanceof ReadableStream) {
      target.body = injectHtmlIntoHeadStream(target.body, getTraceMetaTags(), {
        skipIfHeadContains: '"sentry-trace"',
      });
    }
  };
}
