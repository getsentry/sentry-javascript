import { getTraceMetaTags } from '@sentry/core';

export * from '../client';

export { wrapSentryHandleRequest } from '../server/wrapSentryHandleRequest';

/**
 * Injects Sentry trace meta tags into the HTML response by transforming the ReadableStream.
 * This enables distributed tracing by adding trace context to the HTML document head.
 * @param body - ReadableStream containing the HTML response body to modify
 * @returns A new ReadableStream with Sentry trace meta tags injected into the head section
 */
export function injectTraceMetaTags(body: ReadableStream): ReadableStream {
  const headClosingTag = '</head>';

  const reader = body.getReader();
  const encoder = new TextEncoder();
  // A single streaming decoder carries incomplete multi-byte sequences across chunk
  // boundaries. A fresh, non-streaming decoder per chunk would flush a split character
  // as U+FFFD, corrupting the response (see https://github.com/whatwg/encoding/issues/184).
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();

      if (done) {
        controller.close();
        return;
      }

      const html = value instanceof Uint8Array ? decoder.decode(value, { stream: true }) : String(value);

      if (html.includes(headClosingTag)) {
        const modifiedHtml = html.replace(headClosingTag, `${getTraceMetaTags()}${headClosingTag}`);

        controller.enqueue(encoder.encode(modifiedHtml));
        return;
      }

      controller.enqueue(encoder.encode(html));
    },
  });

  return stream;
}
