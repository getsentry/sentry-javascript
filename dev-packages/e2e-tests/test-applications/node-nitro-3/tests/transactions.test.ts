import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';
import { HTTP_ROUTE, SENTRY_ORIGIN, SENTRY_SEGMENT_NAME_SOURCE, URL_PATH } from '@sentry/conventions/attributes';
import { HANDLER, HTTP_SERVER, MIDDLEWARE } from '@sentry/conventions/op';

const APP_NAME = 'node-nitro-3';

test('sends one `http.server` segment span per request, named after the route', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    span => span.attributes[URL_PATH]?.value === '/api/test-param/123',
  );

  await request.get('/api/test-param/123');

  const spans = await spansPromise;
  const segmentSpans = spans.filter(span => span.is_segment);
  expect(segmentSpans).toHaveLength(1);

  const segmentSpan = segmentSpans[0]!;
  expect(segmentSpan.name).toBe('GET /api/test-param/:id');
  expect(getSpanOp(segmentSpan)).toBe(HTTP_SERVER);
  expect(segmentSpan.attributes[HTTP_ROUTE]?.value).toBe('/api/test-param/:id');
  expect(segmentSpan.attributes[SENTRY_SEGMENT_NAME_SOURCE]?.value).toBe('route');
  expect(segmentSpan.attributes['url.path.parameter.id']?.value).toBe('123');
});

test('creates h3 spans from the tracing channels the module turned on', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    span => span.attributes[URL_PATH]?.value === '/api/test-static',
  );

  await request.get('/api/test-static');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;
  const h3Spans = spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.http.nitro.h3');

  expect(segmentSpan.name).toBe('GET /api/test-static');
  expect(h3Spans.map(span => [getSpanOp(span), span.name])).toEqual([
    [MIDDLEWARE, 'GET /api/test-static'],
    [HANDLER, 'GET /api/test-static'],
  ]);
  h3Spans.forEach(span => expect(span.parent_span_id).toBe(segmentSpan.span_id));
});
