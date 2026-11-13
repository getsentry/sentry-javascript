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

  // Resolved now, while the request's async context is still active. Runtimes like workerd run
  // stream callbacks outside of it, where there is no client and no trace data.
  const traceMetaTags = getTraceMetaTags();
  const injector = createHeadTagInjector(() => traceMetaTags);

  const reader = body.getReader();
  const encoder = new TextEncoder();
  // A single streaming decoder carries incomplete multi-byte sequences across chunk
  // boundaries. A fresh, non-streaming decoder per chunk would flush a split character
  // as U+FFFD, corrupting the response (see https://github.com/whatwg/encoding/issues/184).
  const decoder = new TextDecoder();

  // Not a TransformStream: workerd only supports a custom transformer from compatibility date
  // 2024-11-11, and Hydrogen's MiniOxygen runs with an older one.
  return new ReadableStream({
    async pull(controller) {
      // `pull` is not called again until a chunk is enqueued, so keep reading while text is held back.
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          const rest = injector.push(decoder.decode()) + injector.flush();
          if (rest) {
            controller.enqueue(encoder.encode(rest));
          }
          controller.close();
          return;
        }

        const html = value instanceof Uint8Array ? decoder.decode(value, { stream: true }) : String(value);
        const out = injector.push(html);

        if (out) {
          controller.enqueue(encoder.encode(out));
          return;
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
