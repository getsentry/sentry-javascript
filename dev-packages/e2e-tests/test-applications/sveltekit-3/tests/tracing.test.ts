import { expect, test } from '@playwright/test';
import {
  collectStreamedSpans,
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForStreamedSpan,
} from '@sentry-internal/test-utils';
import { waitForInitialPageload } from './utils';

test('capture a distributed pageload trace', async ({ page }) => {
  const traceSpansPromise = collectStreamedSpans('sveltekit-3', spansOfTrace => {
    const hasClientSegment = spansOfTrace.some(span => span.name === '/users/[id]' && span.is_segment);
    const hasServerSegment = spansOfTrace.some(span => span.name === 'GET /users/[id]' && span.is_segment);
    return hasClientSegment && hasServerSegment;
  });

  const [_, traceSpans] = await Promise.all([
    page.goto('/users/123xyz'),
    traceSpansPromise,
    expect(page.getByText('User id: 123xyz')).toBeVisible(),
  ]);

  const clientSpan = traceSpans.find(span => span.name === '/users/[id]' && span.is_segment)!;
  const serverSpan = traceSpans.find(span => span.name === 'GET /users/[id]' && span.is_segment)!;

  expect(clientSpan.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });

  expect(serverSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });

  expect(traceSpans.length).toBeGreaterThan(5);

  // connected trace
  expect(clientSpan.trace_id).toBe(serverSpan.trace_id);

  const serverKitResolveSpan = traceSpans.find(span => span.name === 'sveltekit.resolve');
  expect(serverKitResolveSpan?.status).toBe('ok');
  expect(serverKitResolveSpan?.attributes).toMatchObject({
    'sentry.op': { value: 'function', type: 'string' },
    'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
  });

  // Sveltekit resolve span is the parent span of the client span
  expect(clientSpan.parent_span_id).toBe(serverKitResolveSpan?.span_id);
});

test('capture a distributed navigation trace', async ({ page }) => {
  const clientNavigationSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    return span.name === '/users' && getSpanOp(span) === 'navigation' && span.is_segment;
  });

  const serverSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    return span.name === 'GET /users' && span.is_segment;
  });

  await waitForInitialPageload(page);

  // navigation to page
  const clickPromise = page.getByText('Route with Server Load').click();

  const [clientSpan, serverSpan, _1, _2] = await Promise.all([
    clientNavigationSpanPromise,
    serverSpanPromise,
    clickPromise,
    expect(page.getByText('Hi everyone')).toBeVisible(),
  ]);

  expect(clientSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });

  expect(serverSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });

  // trace is connected
  expect(clientSpan.trace_id).toBe(serverSpan.trace_id);
});

test('record client-side universal load fetch span and trace', async ({ page }) => {
  await waitForInitialPageload(page);

  // the server span should be created because of the fetch call
  // it should also be part of the trace
  const traceSpansPromise = collectStreamedSpans('sveltekit-3', spansOfTrace => {
    const hasClientSegment = spansOfTrace.some(
      span => span.name === '/universal-load-fetch' && getSpanOp(span) === 'navigation' && span.is_segment,
    );
    const hasServerSegment = spansOfTrace.some(span => span.name === 'GET /api/users' && span.is_segment);
    return hasClientSegment && hasServerSegment;
  });

  // navigation to page
  const clickPromise = page.getByText('Route with fetch in universal load').click();

  const [traceSpans, _1, _2] = await Promise.all([
    traceSpansPromise,
    clickPromise,
    expect(page.getByText('alice')).toBeVisible(),
  ]);

  const clientSpan = traceSpans.find(span => span.name === '/universal-load-fetch' && span.is_segment)!;
  const serverSpan = traceSpans.find(span => span.name === 'GET /api/users' && span.is_segment)!;

  expect(clientSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });

  expect(serverSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });

  // trace is connected
  expect(clientSpan.trace_id).toBe(serverSpan.trace_id);

  const clientFetchSpan = traceSpans.find(span => getSpanOp(span) === 'http.client');

  expect(clientFetchSpan?.name).toBe('GET localhost');
  expect(clientFetchSpan?.parent_span_id).toBe(clientSpan.span_id);
  expect(clientFetchSpan?.attributes).toMatchObject({
    'sentry.op': { value: 'http.client', type: 'string' },
    'sentry.origin': { value: 'auto.http.browser', type: 'string' },
    type: { value: 'fetch', type: 'string' },
    'http.request.method': { value: 'GET', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    'network.protocol.version': { value: '1.1', type: 'string' },
    'network.protocol.name': { value: 'http', type: 'string' },
    'http.request.redirect_start': expect.objectContaining({ value: expect.any(Number) }),
    'http.request.fetch_start': expect.objectContaining({ value: expect.any(Number) }),
    'http.request.domain_lookup_start': expect.objectContaining({ value: expect.any(Number) }),
    'http.request.domain_lookup_end': expect.objectContaining({ value: expect.any(Number) }),
    'http.request.connect_start': expect.objectContaining({ value: expect.any(Number) }),
    'http.request.secure_connection_start': expect.objectContaining({ value: expect.any(Number) }),
    'http.request.connection_end': expect.objectContaining({ value: expect.any(Number) }),
    'http.request.request_start': expect.objectContaining({ value: expect.any(Number) }),
    'http.request.response_start': expect.objectContaining({ value: expect.any(Number) }),
    'http.request.response_end': expect.objectContaining({ value: expect.any(Number) }),
  });
});

test('captures a navigation span directly after pageload', async ({ page }) => {
  const clientPageloadSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationTraceSpansPromise = collectStreamedSpansUntilSegment(
    'sveltekit-3',
    span => getSpanOp(span) === 'navigation',
  );

  await waitForInitialPageload(page, { route: '/' });

  const navigationClickPromise = page.locator('#routeWithParamsLink').click();

  const [pageloadSpan, navigationTraceSpans, _] = await Promise.all([
    clientPageloadSpanPromise,
    navigationTraceSpansPromise,
    navigationClickPromise,
  ]);

  expect(pageloadSpan.name).toBe('/');
  expect(pageloadSpan.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
  });

  const navigationSpan = navigationTraceSpans.find(span => getSpanOp(span) === 'navigation' && span.is_segment)!;

  expect(navigationSpan.name).toBe('/users/[id]');
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.sveltekit', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.sveltekit.navigation.from': { value: '/', type: 'string' },
    'sentry.sveltekit.navigation.to': { value: '/users/[id]', type: 'string' },
    'sentry.sveltekit.navigation.type': { value: 'link', type: 'string' },
  });

  const routingSpans = navigationTraceSpans.filter(span => getSpanOp(span) === 'router');
  expect(routingSpans).toHaveLength(1);

  const routingSpan = routingSpans[0]!;
  expect(routingSpan.name).toBe('Router');
  expect(routingSpan.parent_span_id).toBe(navigationSpan.span_id);
  expect(routingSpan.attributes).toMatchObject({
    'sentry.op': { value: 'router', type: 'string' },
    'sentry.origin': { value: 'auto.ui.sveltekit', type: 'string' },
    'sentry.sveltekit.navigation.from': { value: '/', type: 'string' },
    'sentry.sveltekit.navigation.to': { value: '/users/[id]', type: 'string' },
    'sentry.sveltekit.navigation.type': { value: 'link', type: 'string' },
  });
});

test('captures one navigation span per redirect', async ({ page }) => {
  const collectNavigationTrace = (route: string) =>
    collectStreamedSpansUntilSegment('sveltekit-3', span => getSpanOp(span) === 'navigation' && span.name === route);

  const redirect1TraceSpansPromise = collectNavigationTrace('/redirect1');
  const redirect2TraceSpansPromise = collectNavigationTrace('/redirect2');
  const redirect3TraceSpansPromise = collectNavigationTrace('/users/[id]');

  await waitForInitialPageload(page, { route: '/' });

  const navigationClickPromise = page.locator('#redirectLink').click();

  const [redirect1TraceSpans, redirect2TraceSpans, redirect3TraceSpans, _] = await Promise.all([
    redirect1TraceSpansPromise,
    redirect2TraceSpansPromise,
    redirect3TraceSpansPromise,
    navigationClickPromise,
  ]);

  const expectNavigationTrace = (traceSpans: typeof redirect1TraceSpans, route: string) => {
    const navigationSpan = traceSpans.find(span => getSpanOp(span) === 'navigation' && span.is_segment)!;

    expect(navigationSpan.name).toBe(route);
    expect(navigationSpan.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.navigation.sveltekit', type: 'string' },
      'sentry.op': { value: 'navigation', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.sveltekit.navigation.type': { value: 'link', type: 'string' },
      'sentry.sveltekit.navigation.from': { value: '/', type: 'string' },
      'sentry.sveltekit.navigation.to': { value: route, type: 'string' },
      'sentry.sample_rate': { value: 1, type: 'integer' },
    });

    const routingSpans = traceSpans.filter(span => getSpanOp(span) === 'router');
    expect(routingSpans).toHaveLength(1);

    const routingSpan = routingSpans[0]!;
    expect(routingSpan.name).toBe('Router');
    expect(routingSpan.parent_span_id).toBe(navigationSpan.span_id);
    expect(routingSpan.attributes).toMatchObject({
      'sentry.op': { value: 'router', type: 'string' },
      'sentry.origin': { value: 'auto.ui.sveltekit', type: 'string' },
      'sentry.sveltekit.navigation.from': { value: '/', type: 'string' },
      'sentry.sveltekit.navigation.to': { value: route, type: 'string' },
      'sentry.sveltekit.navigation.type': { value: 'link', type: 'string' },
    });
  };

  expectNavigationTrace(redirect1TraceSpans, '/redirect1');
  expectNavigationTrace(redirect2TraceSpans, '/redirect2');
  expectNavigationTrace(redirect3TraceSpans, '/users/[id]');
});
