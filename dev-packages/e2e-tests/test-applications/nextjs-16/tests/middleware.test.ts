import { expect, test } from '@playwright/test';
import {
  collectStreamedSpans,
  collectStreamedSpansUntilSegment,
  getRuntime,
  getSpanOp,
  waitForStreamedSpan,
} from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test('Should create a span for middleware', async ({ request }) => {
  test.skip(getRuntime() === 'cloudflare', 'On Workers the middleware span is a child of the request span');

  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'middleware GET');

  const routeSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'GET /api/endpoint-behind-middleware' && span.is_segment;
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const spans = await spansPromise;
  const middlewareSpan = spans.find(span => span.name === 'middleware GET' && span.is_segment)!;

  expect(middlewareSpan.status).toBe('ok');
  expect(getSpanOp(middlewareSpan)).toBe('middleware');
  expect(middlewareSpan.attributes['sentry.segment.name.source']?.value).toBe('route');

  expect(middlewareSpan.attributes['http.request.method']?.value).toBe('GET');
  expect(String(middlewareSpan.attributes['http.target']?.value)).toContain('/api/endpoint-behind-middleware');

  // The `Middleware.execute` OTEL root span is the only `middleware` span. The build-time
  // `wrapMiddlewareWithSentry` wrapper used to start a second, redundant one nested inside it.
  const nestedMiddlewareSpans = spans.filter(span => getSpanOp(span) === 'middleware' && !span.is_segment);
  expect(nestedMiddlewareSpans).toHaveLength(0);

  // Assert that isolation scope works properly
  expect(middlewareSpan.attributes['isolation_scope.is_default']).toEqual({ value: false, type: 'boolean' });
  expect(middlewareSpan.attributes['isolation_scope.has_proxy_marker']).toEqual({ value: true, type: 'boolean' });

  // Scope data set in middleware must not leak into other requests (e.g. via a shared scope when the middleware
  // runs in a detached context - https://github.com/vercel/next.js/pull/95306). The route handler exposes it
  // via the same attributes.
  const routeSpan = await routeSpanPromise;
  expect(routeSpan.attributes['isolation_scope.is_default']).toEqual({ value: false, type: 'boolean' });
  expect(routeSpan.attributes['isolation_scope.has_proxy_marker']).toEqual({ value: false, type: 'boolean' });
});

// `withSentry` from `@sentry/nextjs/cloudflare` wraps the Worker entry, so middleware runs inside the request's
// `http.server` segment and its span is a child of it rather than a segment of its own.
test('Should create a span for middleware inside the request segment of the Worker', async ({ request }) => {
  test.skip(getRuntime() !== 'cloudflare', 'Only on Workers the request span of `withSentry` is the segment');

  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'GET /api/endpoint-behind-middleware');

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
  test.skip(getRuntime() === 'cloudflare', 'On Workers the middleware span is a child of the request span');
  const middlewareSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'middleware GET' && span.is_segment;
  });

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-throw': '1' } }).catch(() => {
    // Noop
  });

  await test.step('should record spans', async () => {
    const middlewareSpan = await middlewareSpanPromise;
    expect(middlewareSpan.status).toBe('error');
    expect(getSpanOp(middlewareSpan)).toBe('middleware');
    expect(middlewareSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
  });

  // TODO: proxy errors currently not reported via onRequestError
  // await test.step('should record exceptions', async () => { ... });
});

test('Faulty middlewares inside the request segment of the Worker', async ({ request }) => {
  test.skip(getRuntime() !== 'cloudflare', 'Only on Workers the request span of `withSentry` is the segment');
  // The middleware throws, so the request span of `withSentry` keeps the middleware name, like the middleware segment
  // of Node.js.
  const spansPromise = collectStreamedSpans(
    'nextjs-16',
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

  // Only Node.js has the undici diagnostics channel. On the other runtimes the fetch integration of the runtime
  // SDK creates this span, which has no `sentry.kind`, `url.path` and `url.scheme`.
  const isNode = getRuntime() === 'node';

  // In some builds (especially webpack) the fetch span is not a child of the middleware segment but a
  // segment of its own, so this waits for either. `http.client` span names are low cardinality under
  // span streaming, hence `GET localhost` rather than the full URL.
  const spansPromise = collectStreamedSpans('nextjs-16', spans =>
    spans.some(span => getSpanOp(span) === 'http.client' && span.name === 'GET localhost'),
  );

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-make-request': '1' } }).catch(() => {
    // Noop
  });

  const spans = await spansPromise;
  const fetchSpan = spans.find(span => getSpanOp(span) === 'http.client' && span.name === 'GET localhost')!;

  expect(fetchSpan.status).toBe('ok');
  expect(fetchSpan.attributes['http.request.method']?.value).toBe('GET');
  expect(fetchSpan.attributes['http.response.status_code']?.value).toBe(200);
  expect(fetchSpan.attributes['sentry.op']?.value).toBe('http.client');
  expect(fetchSpan.attributes['sentry.origin']?.value).toBe(isNode ? 'auto.http.node_fetch' : 'auto.http.fetch');
  expect(fetchSpan.attributes['server.address']?.value).toBe('localhost');
  expect(fetchSpan.attributes['server.port']?.value).toBe(3030);
  expect(fetchSpan.attributes['url.domain']?.value).toBe('localhost');
  expect(fetchSpan.attributes['url.full']?.value).toBe('http://localhost:3030/');
  expect(fetchSpan.attributes['sentry.kind']?.value).toBe(isNode ? 'client' : undefined);
  expect(fetchSpan.attributes['url.path']?.value).toBe(isNode ? '/' : undefined);
  expect(fetchSpan.attributes['url.scheme']?.value).toBe(isNode ? 'http' : undefined);
});
