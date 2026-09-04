import { expect, test } from '@playwright/test';
import {
  collectStreamedSpans,
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForStreamedSpan,
} from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test('Should create a span for middleware', async ({ request }) => {
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

test('Faulty middlewares', async ({ request }) => {
  test.skip(isDevMode, 'Throwing crashes the dev server atm'); // https://github.com/vercel/next.js/issues/85261
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

test('Should trace outgoing fetch requests inside middleware', async ({ request }) => {
  test.skip(isDevMode, 'The fetch requests ends up in a separate tx in dev atm');

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
  expect(fetchSpan.attributes).toMatchObject({
    'http.request.method': { value: 'GET', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    'sentry.kind': { value: 'client', type: 'string' },
    'sentry.op': { value: 'http.client', type: 'string' },
    'sentry.origin': { value: 'auto.http.node_fetch', type: 'string' },
    'server.address': { value: 'localhost', type: 'string' },
    'server.port': { value: 3030, type: 'integer' },
    'url.domain': { value: 'localhost', type: 'string' },
    'url.full': { value: 'http://localhost:3030/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.scheme': { value: 'http', type: 'string' },
  });
});
