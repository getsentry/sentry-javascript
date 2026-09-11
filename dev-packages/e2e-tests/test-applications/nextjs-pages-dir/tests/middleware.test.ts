import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should create a span for middleware', async ({ request }) => {
  const middlewareSpanPromise = waitForStreamedSpan('nextjs-pages-dir', span => {
    return span.name === 'middleware GET' && span.is_segment;
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareSpan = await middlewareSpanPromise;

  expect(middlewareSpan.status).toBe('ok');
  expect(getSpanOp(middlewareSpan)).toBe('middleware');
  expect(middlewareSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Faulty middlewares', async ({ request }) => {
  const middlewareSpanPromise = waitForStreamedSpan('nextjs-pages-dir', span => {
    return span.name === 'middleware GET' && span.is_segment;
  });

  const errorEventPromise = waitForError('nextjs-pages-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Middleware Error';
  });

  request.get('/api/endpoint-behind-faulty-middleware', { headers: { 'x-should-throw': '1' } }).catch(() => {
    // Noop
  });

  await test.step('should record spans', async () => {
    const middlewareSpan = await middlewareSpanPromise;
    expect(middlewareSpan.status).toBe('error');
    expect(getSpanOp(middlewareSpan)).toBe('middleware');
    expect(middlewareSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
  });

  await test.step('should record exceptions', async () => {
    const errorEvent = await errorEventPromise;

    // Assert that isolation scope works properly
    expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
    expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
    expect(errorEvent.transaction).toBe('middleware GET');
  });
});

test('Should trace outgoing fetch requests inside middleware', async ({ request }) => {
  // The fetch span is a child of the middleware segment span, which ends last, so accumulate until
  // the segment arrives.
  const spansPromise = collectStreamedSpans(
    'nextjs-pages-dir',
    spans =>
      spans.some(span => span.name === 'middleware GET' && span.is_segment) &&
      spans.some(span => getSpanOp(span) === 'http.client'),
  );

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-make-request': '1' } }).catch(() => {
    // Noop
  });

  const spans = await spansPromise;
  const fetchSpan = spans.find(span => getSpanOp(span) === 'http.client')!;

  // `http.client` span names are low cardinality under span streaming, so the name is the method and
  // host rather than the full URL. The URL itself is still asserted below via `url.full`.
  expect(fetchSpan.name).toBe('GET localhost');
  expect(fetchSpan.status).toBe('ok');
  expect(fetchSpan.parent_span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(fetchSpan.attributes).toMatchObject({
    'http.request.method': { value: 'GET', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    type: { value: 'fetch', type: 'string' },
    'url.full': { value: 'http://localhost:3030/', type: 'string' },
    'url.domain': { value: 'localhost', type: 'string' },
    'server.address': { value: 'localhost', type: 'string' },
    'server.port': { value: 3030, type: 'integer' },
    'sentry.op': { value: 'http.client', type: 'string' },
    'sentry.origin': { value: 'auto.http.wintercg_fetch', type: 'string' },
  });
});
