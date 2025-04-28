import { addNonEnumerableProperty, getTraceMetaTags } from '@sentry/core';
import type { ResponseMiddleware } from '@solidjs/start/middleware';
import type { FetchEvent } from '@solidjs/start/server';

export type ResponseMiddlewareResponse = Parameters<ResponseMiddleware>[1] & {
  __sentry_wrapped__?: boolean;
};

function addMetaTagToHead(html: string): string {
  const metaTags = getTraceMetaTags();

  if (!metaTags) {
    return html;
  }

  const content = `<head>\n${metaTags}\n`;
  return html.replace('<head>', content);
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

    const body = response.body as NodeJS.ReadableStream;
    const decoder = new TextDecoder();
    response.body = new ReadableStream({
      start: async controller => {
        for await (const chunk of body) {
          const html = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
          const modifiedHtml = addMetaTagToHead(html);
          controller.enqueue(new TextEncoder().encode(modifiedHtml));
        }
        controller.close();
      },
    });
  };
}
