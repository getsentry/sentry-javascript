import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

// TODO: Skipped until the Cloudflare Workers edge middleware setup emits middleware spans reliably.
test.skip('tracesSampler receives normalizedRequest for edge middleware', async ({ request }) => {
  const middlewareSpanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
    return span.name === 'middleware GET' && span.is_segment;
  });

  await request.get('/api/endpoint-behind-middleware');

  const middlewareSpan = await middlewareSpanPromise;

  expect(String(middlewareSpan.attributes['http.target']?.value)).toContain('/api/endpoint-behind-middleware');
  expect(middlewareSpan.attributes['http.request.method']?.value).toBe('GET');
});

// TODO: Middleware tests need SDK adjustments for Cloudflare Workers edge runtime
test.skip('Should create a span for middleware', async ({ request }) => {
  const middlewareSpanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
    return span.name === 'middleware GET' && span.is_segment;
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareSpan = await middlewareSpanPromise;

  expect(middlewareSpan.status).toBe('ok');
  expect(getSpanOp(middlewareSpan)).toBe('middleware');
  expect(middlewareSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
});

// TODO: Middleware tests need SDK adjustments for Cloudflare Workers edge runtime
test.skip('Faulty middlewares', async ({ request }) => {
  test.skip(isDevMode, 'Throwing crashes the dev server atm'); // https://github.com/vercel/next.js/issues/85261
  const middlewareSpanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
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
});

// TODO: Middleware tests need SDK adjustments for Cloudflare Workers edge runtime
test.skip('Should trace outgoing fetch requests inside middleware', async ({ request }) => {
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
