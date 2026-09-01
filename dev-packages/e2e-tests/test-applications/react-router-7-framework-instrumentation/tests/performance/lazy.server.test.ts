import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// Known React Router limitation: route.lazy hooks only work in Data Mode (createBrowserRouter).
// Framework Mode uses bundler code-splitting which doesn't trigger the lazy hook.
// See: https://github.com/remix-run/react-router/blob/main/decisions/0002-lazy-route-modules.md
// Using test.fail() to auto-detect when React Router fixes this upstream.
test.describe('server - instrumentation API lazy loading', () => {
  test.fail('should instrument lazy route loading with instrumentation API origin', async ({ page }) => {
    const spansPromise = collectStreamedSpans(APP_NAME, spans => {
      return spans.some(span => span.name === 'GET /performance/lazy-route' && span.is_segment);
    });

    await page.goto(`/performance/lazy-route`);

    const spans = await spansPromise;

    // Verify the lazy route content is rendered
    await expect(page.locator('#lazy-route-title')).toBeVisible();
    await expect(page.locator('#lazy-route-content')).toHaveText('This route was lazily loaded');

    const segmentSpan = spans.find(span => span.name === 'GET /performance/lazy-route' && span.is_segment)!;

    expect(segmentSpan.span_id).toEqual(expect.any(String));
    expect(segmentSpan.trace_id).toEqual(expect.any(String));
    expect(getSpanOp(segmentSpan)).toBe('http.server');
    expect(segmentSpan.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.react_router.instrumentation_api', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
    });

    const lazySpan = spans.find(span => span.attributes['code.function.name']?.value === 'lazy');

    expect(lazySpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      name: 'Lazy Route Load',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
    });

    expect(lazySpan!.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.function.react_router.instrumentation_api', type: 'string' },
      'sentry.op': { value: 'function', type: 'string' },
      'code.function.name': { value: 'lazy', type: 'string' },
    });
  });

  test('should include loader span after lazy loading completes', async ({ page }) => {
    const spansPromise = collectStreamedSpans(APP_NAME, spans => {
      return spans.some(span => span.name === 'GET /performance/lazy-route' && span.is_segment);
    });

    await page.goto(`/performance/lazy-route`);

    const spans = await spansPromise;

    // Find the loader span that runs after lazy loading
    const loaderSpan = spans.find(span => span.attributes['code.function.name']?.value === 'loader');

    expect(loaderSpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      name: '/performance/lazy-route',
    });

    expect(loaderSpan!.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.function.react_router.instrumentation_api', type: 'string' },
      'sentry.op': { value: 'function', type: 'string' },
      'code.function.name': { value: 'loader', type: 'string' },
    });
  });

  test.fail('should have correct span ordering: lazy before loader', async ({ page }) => {
    const spansPromise = collectStreamedSpans(APP_NAME, spans => {
      return spans.some(span => span.name === 'GET /performance/lazy-route' && span.is_segment);
    });

    await page.goto(`/performance/lazy-route`);

    const spans = await spansPromise;

    const lazySpan = spans.find(span => span.attributes['code.function.name']?.value === 'lazy');
    const loaderSpan = spans.find(span => span.attributes['code.function.name']?.value === 'loader');

    expect(lazySpan).toBeDefined();
    expect(loaderSpan).toBeDefined();

    // Lazy span should start before or at the same time as loader
    // (lazy loading must complete before loader can run)
    expect(lazySpan!.start_timestamp).toBeLessThanOrEqual(loaderSpan!.start_timestamp);
  });
});
