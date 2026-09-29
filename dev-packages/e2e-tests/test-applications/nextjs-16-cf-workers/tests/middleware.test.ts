import { expect, test } from '@playwright/test';
import { collectStreamedSpans, collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

// `withSentry` from `@sentry/nextjs/cloudflare` wraps the Worker entry, so middleware runs inside the request's
// `http.server` segment and its span is a child of it rather than a segment of its own.
test('Should create a span for middleware inside the request segment', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16-cf-workers', 'GET /api/endpoint-behind-middleware');

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;
  const middlewareSpan = spans.find(span => span.name === 'middleware GET')!;

  expect(spans.filter(span => getSpanOp(span) === 'middleware')).toEqual([middlewareSpan]);
  expect(segmentSpan.attributes['url.path']?.value).toBe('/api/endpoint-behind-middleware');
  expect(segmentSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(segmentSpan.attributes['isolation_scope.is_default']).toEqual({ value: false, type: 'boolean' });
  expect(middlewareSpan.is_segment).toBe(false);
  expect(middlewareSpan.parent_span_id).toBe(segmentSpan.span_id);
  expect(middlewareSpan.status).toBe('ok');
  expect(getSpanOp(middlewareSpan)).toBe('middleware');
});

test('Faulty middlewares', async ({ request }) => {
  test.skip(isDevMode, 'Throwing crashes the dev server atm'); // https://github.com/vercel/next.js/issues/85261
  // The middleware throws, so the request span of `withSentry` keeps the middleware name, like the middleware segment
  // of Node.js.
  const spansPromise = collectStreamedSpans(
    'nextjs-16-cf-workers',
    spans =>
      spans.some(span => span.is_segment && span.name === 'middleware GET') &&
      spans.some(span => !span.is_segment && span.name === 'middleware GET'),
  );

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-throw': '1' } }).catch(() => {
    // Noop
  });

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;
  const middlewareSpan = spans.find(span => !span.is_segment && span.name === 'middleware GET')!;

  expect(segmentSpan.status).toBe('error');
  expect(segmentSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(middlewareSpan.parent_span_id).toBe(segmentSpan.span_id);
  expect(middlewareSpan.status).toBe('error');
  expect(getSpanOp(middlewareSpan)).toBe('middleware');
});

test('Should trace outgoing fetch requests inside middleware', async ({ request }) => {
  test.skip(isDevMode, 'The fetch requests ends up in a separate tx in dev atm');

  // `http.client` span names are low cardinality under span streaming, hence `GET localhost` rather
  // than the full URL.
  const spansPromise = collectStreamedSpans('nextjs-16-cf-workers', spans =>
    spans.some(span => getSpanOp(span) === 'http.client' && span.name === 'GET localhost'),
  );

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-make-request': '1' } }).catch(() => {
    // Noop
  });

  const spans = await spansPromise;
  const fetchSpan = spans.find(span => getSpanOp(span) === 'http.client' && span.name === 'GET localhost')!;

  expect(fetchSpan.status).toBe('ok');
  expect(fetchSpan.attributes).toMatchObject({
    'http.request.method': { value: 'GET', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    'url.full': { value: 'http://localhost:3030/', type: 'string' },
  });
});
