import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';

// A pages-router API route sees both Next.js's own `BaseServer.handleRequest` OTEL span and the span
// created by `wrapApiHandlerWithSentry`. Exactly one of them must be sent for a request, never both.
// This guards against regressing back to duplicate segment spans for the same API route.
test('Sends exactly one segment span for a pages-router API route', async ({ request }) => {
  const apiRouteSegmentSpans: string[] = [];

  // Accumulate every matching span and assert on the total after a grace period. This predicate never
  // returns true, so the promise never resolves; we just let it collect while we wait out the grace period.
  void waitForStreamedSpans('nextjs-pages-dir', spans => {
    for (const span of spans) {
      if (span.name === 'GET /api/endpoint' && span.is_segment) {
        apiRouteSegmentSpans.push(span.trace_id);
      }
    }
    return false;
  });

  const response = await request.get('/api/endpoint');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  await new Promise(resolve => setTimeout(resolve, 6000));

  expect(apiRouteSegmentSpans).toHaveLength(1);
});

test('Sends a well-formed span for a node-runtime pages-router API route', async ({ request }) => {
  const spanPromise = waitForStreamedSpan('nextjs-pages-dir', span => {
    return span.name === 'GET /api/endpoint' && span.is_segment;
  });

  const response = await request.get('/api/endpoint');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const span = await spanPromise;

  expect(getSpanOp(span)).toBe('http.server');
  expect(span.status).toBe('ok');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(span.attributes['http.route']?.value).toBe('/api/endpoint');
});
