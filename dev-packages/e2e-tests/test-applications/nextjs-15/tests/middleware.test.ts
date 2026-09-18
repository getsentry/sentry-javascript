import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// The `tracesSampler` in `sentry.edge.config.ts` only samples `Middleware.execute` spans when `normalizedRequest`
// is available at sampling time, so this test times out if the request data does not reach the sampler.
test('tracesSampler receives normalizedRequest for edge middleware', async ({ request }) => {
  const middlewareSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'middleware GET' && span.is_segment;
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareSpan = await middlewareSpanPromise;

  expect(getSpanOp(middlewareSpan)).toBe('middleware');
  expect(String(middlewareSpan.attributes['http.target']?.value)).toContain('/api/endpoint-behind-middleware');
  expect(middlewareSpan.attributes['http.request.method']?.value).toBe('GET');
});

// The `tracesSampler` additionally asserts that `normalizedRequest.url` matches the sampled span's own
// `http.target`, so a request leaking into the sampling context of a concurrent one drops that span
// and times this test out.
test('does not leak normalizedRequest between concurrent middleware invocations', async ({ request }) => {
  const firstSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return (
      span.name === 'middleware GET' &&
      span.is_segment &&
      span.attributes['http.target']?.value === '/api/endpoint-behind-middleware'
    );
  });

  const secondSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return (
      span.name === 'middleware GET' &&
      span.is_segment &&
      span.attributes['http.target']?.value === '/api/endpoint-behind-middleware-2'
    );
  });

  await Promise.all([request.get('/api/endpoint-behind-middleware'), request.get('/api/endpoint-behind-middleware-2')]);

  const [firstSpan, secondSpan] = await Promise.all([firstSpanPromise, secondSpanPromise]);

  expect(String(firstSpan.attributes['http.target']?.value)).toContain('/api/endpoint-behind-middleware');
  expect(String(firstSpan.attributes['http.target']?.value)).not.toContain('/api/endpoint-behind-middleware-2');
  expect(String(secondSpan.attributes['http.target']?.value)).toContain('/api/endpoint-behind-middleware-2');
});

// Neither request sends inbound tracing headers, so each is the head of its own distributed trace. If concurrent
// middleware invocations were to share an active span/scope (e.g. a leaked context on a warm edge worker), both
// spans would inherit one trace id and collapse into a single trace - the production contamination we guard
// against here.
test('concurrent middleware invocations without inbound tracing headers get distinct trace ids', async ({
  request,
}) => {
  const firstSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return (
      span.name === 'middleware GET' &&
      span.is_segment &&
      span.attributes['http.target']?.value === '/api/endpoint-behind-middleware'
    );
  });

  const secondSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return (
      span.name === 'middleware GET' &&
      span.is_segment &&
      span.attributes['http.target']?.value === '/api/endpoint-behind-middleware-2'
    );
  });

  await Promise.all([request.get('/api/endpoint-behind-middleware'), request.get('/api/endpoint-behind-middleware-2')]);

  const [firstSpan, secondSpan] = await Promise.all([firstSpanPromise, secondSpanPromise]);

  expect(firstSpan.trace_id).toMatch(/^[a-f0-9]{32}$/);
  expect(secondSpan.trace_id).toMatch(/^[a-f0-9]{32}$/);
  expect(firstSpan.trace_id).not.toBe(secondSpan.trace_id);
});
