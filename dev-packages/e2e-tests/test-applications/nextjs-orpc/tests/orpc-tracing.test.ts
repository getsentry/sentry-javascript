import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

const ORPC_SEGMENT_NAME = 'POST /rpc/[[...rest]]';

test('should trace orpc server component', async ({ page }) => {
  // The server component calls `planet.list` over HTTP while rendering, so the RPC span belongs to
  // the same trace as the pageload. `collectStreamedSpans` evaluates one trace at a time, so requiring
  // the pageload and the RPC spans together is what asserts the SSR request propagated its trace.
  const spansPromise = collectStreamedSpans('nextjs-orpc', spans => {
    return (
      spans.some(span => span.name === '/' && getSpanOp(span) === 'pageload' && span.is_segment) &&
      spans.some(span => span.name === ORPC_SEGMENT_NAME && span.is_segment) &&
      spans.some(span => span.name === 'ORPC Middleware')
    );
  });

  await page.goto('/');
  const orpcSpans = await spansPromise;

  const pageloadSpan = orpcSpans.find(span => span.name === '/' && getSpanOp(span) === 'pageload' && span.is_segment)!;
  const orpcSpan = orpcSpans.find(span => span.name === ORPC_SEGMENT_NAME && span.is_segment)!;

  expect(pageloadSpan.parent_span_id).toEqual(expect.any(String));
  expect(pageloadSpan.span_id).toEqual(expect.any(String));
  expect(pageloadSpan.trace_id).toEqual(expect.any(String));
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });

  // `orpcSpan` comes from the same trace as the pageload, so its presence is the trace assertion.
  expect(orpcSpan.parent_span_id).toEqual(expect.any(String));
  expect(orpcSpan.span_id).toEqual(expect.any(String));
  expect(orpcSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.kind': { value: 'server', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    'next.span_name': { value: 'POST /rpc/[[...rest]]/route', type: 'string' },
    'next.span_type': { value: 'BaseServer.handleRequest', type: 'string' },
    'http.method': { value: 'POST', type: 'string' },
    'http.target': { value: '/rpc/planet/list', type: 'string' },
    'next.rsc': { value: false, type: 'boolean' },
    'http.route': { value: '/rpc/[[...rest]]', type: 'string' },
    'next.route': { value: '/rpc/[[...rest]]', type: 'string' },
    'http.status_code': { value: 200, type: 'integer' },
  });

  expect(orpcSpans.map(span => span.name)).toContain('ORPC Middleware');
});

test('should trace orpc client component', async ({ page }) => {
  // Awaiting the navigation and RPC spans separately could pair spans from different traces. One
  // `collectStreamedSpans` evaluates a single trace at a time, so requiring both together keeps them
  // on the same trace and makes the `trace_id` assertion below meaningful.
  const spansPromise = collectStreamedSpans('nextjs-orpc', spans => {
    return (
      spans.some(span => span.name === '/client' && getSpanOp(span) === 'navigation' && span.is_segment) &&
      spans.some(
        span =>
          span.name === ORPC_SEGMENT_NAME &&
          span.is_segment &&
          span.attributes['http.target']?.value === '/rpc/planet/find',
      ) &&
      spans.some(span => span.name === 'ORPC Middleware')
    );
  });

  await page.goto('/');
  await page.waitForTimeout(500);
  await page.getByRole('link', { name: 'Client' }).click();

  const orpcSpans = await spansPromise;
  const navigationSpan = orpcSpans.find(
    span => span.name === '/client' && getSpanOp(span) === 'navigation' && span.is_segment,
  )!;
  const orpcSpan = orpcSpans.find(
    span =>
      span.name === ORPC_SEGMENT_NAME &&
      span.is_segment &&
      span.attributes['http.target']?.value === '/rpc/planet/find',
  )!;

  expect(navigationSpan.span_id).toEqual(expect.any(String));
  expect(navigationSpan.trace_id).toEqual(expect.any(String));
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.previous_trace': { value: expect.any(String), type: 'string' },
  });

  expect(orpcSpan.parent_span_id).toEqual(expect.any(String));
  expect(orpcSpan.span_id).toEqual(expect.any(String));
  expect(orpcSpan.trace_id).toBe(navigationSpan.trace_id);
  expect(orpcSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.kind': { value: 'server', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    'next.span_name': { value: 'POST /rpc/[[...rest]]/route', type: 'string' },
    'next.span_type': { value: 'BaseServer.handleRequest', type: 'string' },
    'http.method': { value: 'POST', type: 'string' },
    'http.target': { value: '/rpc/planet/find', type: 'string' },
    'next.rsc': { value: false, type: 'boolean' },
    'http.route': { value: '/rpc/[[...rest]]', type: 'string' },
    'next.route': { value: '/rpc/[[...rest]]', type: 'string' },
    'http.status_code': { value: 200, type: 'integer' },
  });

  expect(orpcSpans.map(span => span.name)).toContain('ORPC Middleware');
});
