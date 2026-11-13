import { expect, test } from '@playwright/test';
import { HTTP_CLIENT, HTTP_SERVER } from '@sentry/conventions/op';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isViteServer, NITRO_ONLY } from './isViteServer';

test.skip(isViteServer, NITRO_ONLY);

test('continues an incoming trace in the server segment and its events', async ({ request }) => {
  const traceId = crypto.randomUUID().replace(/-/g, '');
  const parentSpanId = traceId.slice(0, 16);

  const segmentPromise = waitForStreamedSpan('nuxt-4', span => span.is_segment && span.trace_id === traceId);
  const eventPromise = waitForError('nuxt-4', event => event.message === 'trace continuation');

  await request.get('/api/trace-continuation', {
    headers: {
      'sentry-trace': `${traceId}-${parentSpanId}-1`,
      baggage: `sentry-trace_id=${traceId},sentry-sample_rate=1,sentry-sampled=true`,
    },
  });

  const [segment, event] = await Promise.all([segmentPromise, eventPromise]);

  expect(getSpanOp(segment)).toBe(HTTP_SERVER);
  expect(segment.parent_span_id).toBe(parentSpanId);
  expect(segment.attributes['url.path']?.value).toBe('/api/trace-continuation');
  expect(event.contexts?.trace?.trace_id).toBe(traceId);
  expect(event.contexts?.trace?.span_id).toBe(segment.span_id);
});

test('propagates the trace to an outgoing `fetch` request', async ({ request }) => {
  const isOutgoingSegment = (span: SerializedStreamedSpan) =>
    span.is_segment && span.attributes['url.path']?.value === '/api/outgoing-fetch';
  const isIncomingSegment = (span: SerializedStreamedSpan) =>
    span.is_segment && span.attributes['url.path']?.value === '/api/echo-headers';
  const isHttpClientSpan = (span: SerializedStreamedSpan) =>
    getSpanOp(span) === HTTP_CLIENT && String(span.attributes['url.full']?.value).endsWith('/api/echo-headers');

  // Both segments and the http.client span in between share one trace, and `collectStreamedSpans`
  // evaluates one trace at a time, so requiring all three keeps them paired.
  const spansPromise = collectStreamedSpans(
    'nuxt-4',
    spans => spans.some(isOutgoingSegment) && spans.some(isIncomingSegment) && spans.some(isHttpClientSpan),
  );

  const headers = await (await request.get('/api/outgoing-fetch')).json();

  const spans = await spansPromise;
  const outgoingSegment = spans.find(isOutgoingSegment)!;
  const incomingSegment = spans.find(isIncomingSegment)!;
  const httpClientSpan = spans.find(isHttpClientSpan)!;

  expect(httpClientSpan.parent_span_id).toBe(outgoingSegment.span_id);
  expect(incomingSegment.parent_span_id).toBe(httpClientSpan.span_id);
  expect(headers['sentry-trace']).toBe(`${outgoingSegment.trace_id}-${httpClientSpan.span_id}-1`);
  expect(headers.baggage).toContain(`sentry-trace_id=${outgoingSegment.trace_id}`);
  expect(headers.baggage).toContain('sentry-sampled=true');
});
