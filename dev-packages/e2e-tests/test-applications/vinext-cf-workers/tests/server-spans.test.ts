import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('Sends the Next.js spans of a page in the request span of the Worker', async ({ request }) => {
  const spansPromise = collectStreamedSpans(
    'vinext-cf-workers',
    spans =>
      spans.some(span => span.is_segment && span.name === 'GET /parameterized/[id]') &&
      spans.some(span => span.name === 'render route (app) /parameterized/[id]'),
  );

  await request.get('/parameterized/42');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;
  const renderSpan = spans.find(span => span.name === 'render route (app) /parameterized/[id]')!;

  expect(spans.filter(span => span.is_segment)).toEqual([segmentSpan]);
  expect(spans.filter(span => getSpanOp(span) === 'http.server')).toEqual([segmentSpan]);
  expect(segmentSpan.name).toBe('GET /parameterized/[id]');
  expect(segmentSpan.attributes['sentry.op']?.value).toBe('http.server');
  expect(segmentSpan.attributes['sentry.origin']?.value).toBe('auto.http.cloudflare');
  expect(segmentSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(segmentSpan.attributes['http.route']?.value).toBe('/parameterized/[id]');
  expect(segmentSpan.attributes['http.response.status_code']?.value).toBe(200);
  expect(renderSpan.attributes['sentry.segment.id']?.value).toBe(segmentSpan.span_id);
});

test('Sends the Next.js spans of a route handler in the request span of the Worker', async ({ request }) => {
  const spansPromise = collectStreamedSpans(
    'vinext-cf-workers',
    spans =>
      spans.some(span => span.is_segment && span.name === 'GET /api/hello') &&
      spans.some(span => span.name === 'executing api route (app) /api/hello'),
  );

  await request.get('/api/hello');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;
  const handlerSpan = spans.find(span => span.name === 'executing api route (app) /api/hello')!;

  expect(spans.filter(span => span.is_segment)).toEqual([segmentSpan]);
  expect(spans.filter(span => getSpanOp(span) === 'http.server')).toEqual([segmentSpan]);
  expect(segmentSpan.name).toBe('GET /api/hello');
  expect(segmentSpan.attributes['sentry.origin']?.value).toBe('auto.http.cloudflare');
  expect(segmentSpan.attributes['http.route']?.value).toBe('/api/hello');
  expect(segmentSpan.attributes['http.response.status_code']?.value).toBe(200);
  expect(handlerSpan.attributes['sentry.segment.id']?.value).toBe(segmentSpan.span_id);
});

test('Continues an incoming trace in the request span of the Worker', async ({ request }) => {
  const traceId = crypto.randomUUID().replace(/-/g, '');
  const parentSpanId = traceId.slice(0, 16);

  const spansPromise = collectStreamedSpans(
    'vinext-cf-workers',
    spans =>
      spans.some(span => span.trace_id === traceId && span.is_segment) &&
      spans.some(span => span.trace_id === traceId && span.name === 'render route (app) /parameterized/[id]'),
  );

  await request.get('/parameterized/42', {
    headers: {
      'sentry-trace': `${traceId}-${parentSpanId}-1`,
      baggage: `sentry-trace_id=${traceId},sentry-sample_rate=1,sentry-sampled=true`,
    },
  });

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.trace_id === traceId && span.is_segment)!;
  const renderSpan = spans.find(
    span => span.trace_id === traceId && span.name === 'render route (app) /parameterized/[id]',
  )!;

  expect(spans.filter(span => span.trace_id === traceId && span.is_segment)).toEqual([segmentSpan]);
  expect(segmentSpan.parent_span_id).toBe(parentSpanId);
  expect(segmentSpan.attributes['sentry.origin']?.value).toBe('auto.http.cloudflare');
  expect(renderSpan.attributes['sentry.segment.id']?.value).toBe(segmentSpan.span_id);
});
