import { addNonEnumerableProperty, getTraceMetaTags } from '@sentry/core';
import { injectHtmlIntoHeadStream } from '@sentry/server-utils';
import type { ResponseMiddleware } from '@solidjs/start/middleware';
import type { FetchEvent } from '@solidjs/start/server';

export type ResponseMiddlewareResponse = Parameters<ResponseMiddleware>[1] & {
  __sentry_wrapped__?: boolean;
};

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

    response.body = injectHtmlIntoHeadStream(response.body as ReadableStream<Uint8Array | string>, getTraceMetaTags());
  };
}
