import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getRuntime } from '@sentry-internal/test-utils';

test('Continues an incoming trace in the segment of the request', async ({ request }) => {
  // On Workers the segment is the request span of `withSentry`, on the other runtimes the request span of Next.js.
  const segmentOrigin = getRuntime() === 'cloudflare' ? 'auto.http.cloudflare' : 'auto';
  const traceId = crypto.randomUUID().replace(/-/g, '');
  const parentSpanId = traceId.slice(0, 16);

  const spansPromise = collectStreamedSpans(
    'nextjs-16',
    spans =>
      spans.some(span => span.trace_id === traceId && span.is_segment) &&
      spans.some(
        span => span.trace_id === traceId && span.name === 'render route (app) /parameterized/[one]/beep/[two]',
      ),
  );

  await request.get('/parameterized/1337/beep/42', {
    headers: {
      'sentry-trace': `${traceId}-${parentSpanId}-1`,
      baggage: `sentry-trace_id=${traceId},sentry-sample_rate=1,sentry-sampled=true`,
    },
  });

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.trace_id === traceId && span.is_segment)!;
  const renderSpan = spans.find(
    span => span.trace_id === traceId && span.name === 'render route (app) /parameterized/[one]/beep/[two]',
  )!;

  expect(spans.filter(span => span.trace_id === traceId && span.is_segment)).toEqual([segmentSpan]);
  expect(segmentSpan.parent_span_id).toBe(parentSpanId);
  expect(segmentSpan.attributes['sentry.origin']?.value).toBe(segmentOrigin);
  expect(segmentSpan.name).toBe('GET /parameterized/[one]/beep/[two]');
  expect(renderSpan.attributes['sentry.segment.id']?.value).toBe(segmentSpan.span_id);
});
