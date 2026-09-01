import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - instrumentation API middleware', () => {
  test('should instrument server middleware with instrumentation API origin', async ({ page }) => {
    const spansPromise = collectStreamedSpans(APP_NAME, spans => {
      return spans.some(span => span.name === 'GET /performance/with-middleware' && span.is_segment);
    });

    await page.goto(`/performance/with-middleware`);

    const spans = await spansPromise;

    // Verify the middleware route content is rendered
    await expect(page.locator('#middleware-route-title')).toBeVisible();
    await expect(page.locator('#middleware-route-content')).toHaveText('This route has middleware');

    const segmentSpan = spans.find(span => span.name === 'GET /performance/with-middleware' && span.is_segment)!;

    expect(segmentSpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      is_segment: true,
    });

    expect(getSpanOp(segmentSpan)).toBe('http.server');
    expect(segmentSpan.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.react_router.instrumentation_api', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
    });

    const middlewareSpan = spans.find(span => span.attributes['code.function.name']?.value === 'middleware');

    expect(middlewareSpan).toBeDefined();
    expect(middlewareSpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
    });

    expect(middlewareSpan!.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.function.react_router.instrumentation_api', type: 'string' },
      'sentry.op': { value: 'middleware', type: 'string' },
      'code.function.name': { value: 'middleware', type: 'string' },
      'react_router.route.id': { value: 'routes/performance/with-middleware', type: 'string' },
      'http.route': { value: '/performance/with-middleware', type: 'string' },
      'react_router.middleware.index': { value: 0, type: 'integer' },
    });

    // Middleware name is available via the instrumentation API patching of createRequestHandler
    expect(middlewareSpan!.attributes['react_router.middleware.name']?.value).toBe('authMiddleware');
    expect(middlewareSpan!.name).toBe('middleware authMiddleware');
  });

  test('should have middleware span run before loader span', async ({ page }) => {
    const spansPromise = collectStreamedSpans(APP_NAME, spans => {
      return spans.some(span => span.name === 'GET /performance/with-middleware' && span.is_segment);
    });

    await page.goto(`/performance/with-middleware`);

    const spans = await spansPromise;

    const middlewareSpan = spans.find(span => span.attributes['code.function.name']?.value === 'middleware');
    const loaderSpan = spans.find(span => span.attributes['code.function.name']?.value === 'loader');

    expect(middlewareSpan).toBeDefined();
    expect(loaderSpan).toBeDefined();

    // Middleware should start before loader
    expect(middlewareSpan!.start_timestamp).toBeLessThanOrEqual(loaderSpan!.start_timestamp);
  });

  test('should track multiple middlewares with correct indices', async ({ page }) => {
    const spansPromise = collectStreamedSpans(APP_NAME, spans => {
      return spans.some(span => span.name === 'GET /performance/multi-middleware' && span.is_segment);
    });

    await page.goto(`/performance/multi-middleware`);

    const spans = await spansPromise;

    await expect(page.locator('#multi-middleware-title')).toBeVisible();
    await expect(page.locator('#multi-middleware-content')).toHaveText('This route has 3 middlewares');

    const middlewareSpans = spans.filter(span => span.attributes['code.function.name']?.value === 'middleware');

    expect(middlewareSpans).toHaveLength(3);

    const sortedSpans = [...middlewareSpans].sort(
      (a, b) =>
        Number(a.attributes['react_router.middleware.index']?.value ?? 0) -
        Number(b.attributes['react_router.middleware.index']?.value ?? 0),
    );

    expect(sortedSpans.map(span => span.attributes['react_router.middleware.index']?.value)).toEqual([0, 1, 2]);
    expect(sortedSpans.map(span => span.attributes['react_router.middleware.name']?.value)).toEqual([
      'multiAuthMiddleware',
      'multiLoggingMiddleware',
      'multiValidationMiddleware',
    ]);
  });
});
