import { getTraceMetaTags } from '@sentry/core';
import { injectIntoHead } from './headTagInjector';
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
  return injectIntoHead(body, traceMetaTags);
}
