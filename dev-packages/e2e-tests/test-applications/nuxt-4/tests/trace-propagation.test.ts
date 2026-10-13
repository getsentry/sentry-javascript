import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('continues an incoming trace', async ({ request }) => {
  const traceId = crypto.randomUUID().replace(/-/g, '');
  const parentSpanId = traceId.slice(0, 16);

  const segmentSpanPromise = waitForStreamedSpan('nuxt-4', span => span.trace_id === traceId && span.is_segment);

  await request.get('/test-param/4321', {
    headers: {
      'sentry-trace': `${traceId}-${parentSpanId}-1`,
      baggage: `sentry-trace_id=${traceId},sentry-sample_rate=1,sentry-sampled=true`,
    },
  });

  const segmentSpan = await segmentSpanPromise;

  expect(getSpanOp(segmentSpan)).toBe('http.server');
  expect(segmentSpan.name).toBe('GET /test-param/:param()');
  expect(segmentSpan.parent_span_id).toBe(parentSpanId);
});

test('adds sentry-trace and baggage headers to an outgoing fetch', async ({ request }) => {
  // Exact-match API routes keep a method-only segment name under h3 v1, so the segment is selected via `url.path`.
  const segmentSpanPromise = waitForStreamedSpan(
    'nuxt-4',
    span => span.is_segment && span.attributes['url.path']?.value === '/api/outgoing-fetch',
  );
  const fetchSpanPromise = waitForStreamedSpan(
    'nuxt-4',
    span => getSpanOp(span) === 'http.client' && String(span.attributes['url.full']?.value).endsWith('/api/headers'),
  );

  const response = await request.get('/api/outgoing-fetch');
  const receivedHeaders = await response.json();

  const segmentSpan = await segmentSpanPromise;
  const fetchSpan = await fetchSpanPromise;

  expect(getSpanOp(segmentSpan)).toBe('http.server');
  expect(fetchSpan.trace_id).toBe(segmentSpan.trace_id);
  expect(fetchSpan.parent_span_id).toBe(segmentSpan.span_id);
  expect(receivedHeaders.sentryTrace).toBe(`${segmentSpan.trace_id}-${fetchSpan.span_id}-1`);
  expect(receivedHeaders.baggage).toContain(`sentry-trace_id=${segmentSpan.trace_id}`);
});
