import { getTraceMetaTags } from '@sentry/core';
import { createHeadTagInjector } from './headTagInjector';
import { isPrerenderRequest } from './serverBuild';

/**
 * Injects Sentry trace meta tags into the HTML response by transforming the ReadableStream.
 * This enables distributed tracing by adding trace context to the HTML document head.
 * @param body - ReadableStream containing the HTML response body to modify
 * @returns A new ReadableStream with Sentry trace meta tags injected into the head section
 */
export function injectTraceMetaTags(body: ReadableStream): ReadableStream {
  if (isPrerenderRequest()) {
    return body;
  }

  const encoder = new TextEncoder();
  // A single streaming decoder carries incomplete multi-byte sequences across chunk
  // boundaries. A fresh, non-streaming decoder per chunk would flush a split character
  // as U+FFFD, corrupting the response (see https://github.com/whatwg/encoding/issues/184).
  const decoder = new TextDecoder();
  // Resolved now, while the request's async context is still active. Runtimes like workerd run
  // stream transforms outside of it, where there is no client and no trace data.
  const traceMetaTags = getTraceMetaTags();
  const injector = createHeadTagInjector(() => traceMetaTags);

  return body.pipeThrough(
    new TransformStream<unknown, Uint8Array>({
      transform(value, controller) {
        const html = value instanceof Uint8Array ? decoder.decode(value, { stream: true }) : String(value);
        const out = injector.push(html);
        if (out) {
          controller.enqueue(encoder.encode(out));
        }
      },
      flush(controller) {
        const out = injector.push(decoder.decode()) + injector.flush();
        if (out) {
          controller.enqueue(encoder.encode(out));
        }
      },
    }),
  );
}
