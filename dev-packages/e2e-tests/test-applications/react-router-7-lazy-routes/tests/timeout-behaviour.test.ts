import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('lazyRouteTimeout: Routes load within timeout window', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name.includes('deep');
  });

  // Route takes ~900ms, timeout allows 1050ms (50 + 1000)
  // Routes will load in time → parameterized name
  await page.goto('/?idleTimeout=50&timeout=1000');

  const navigationLink = page.locator('id=navigation-to-deep');
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const span = await spanPromise;

  // Should get full parameterized route
  expect(span.name).toBe('/deep/level2/level3/:id');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(span.attributes['sentry.idle_span_finish_reason']?.value).toBe('idleTimeout');
});

test('lazyRouteTimeout: Infinity timeout always waits for routes', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name.includes('deep');
  });

  // Infinity timeout → waits as long as possible (capped at finalTimeout to prevent indefinite hangs)
  await page.goto('/?idleTimeout=50&timeout=Infinity');

  const navigationLink = page.locator('id=navigation-to-deep');
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const span = await spanPromise;

  // Should wait for routes to load (up to finalTimeout) and get full route
  expect(span.name).toBe('/deep/level2/level3/:id');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(span.attributes['sentry.idle_span_finish_reason']?.value).toBe('idleTimeout');
});

test('idleTimeout: Captures all activity with increased timeout', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name.includes('deep');
  });

  // High idleTimeout (5000ms) ensures the span captures all lazy loading activity
  await page.goto('/?idleTimeout=5000');

  const navigationLink = page.locator('id=navigation-to-deep');
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const span = await spanPromise;

  expect(span.name).toBe('/deep/level2/level3/:id');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(span.attributes['sentry.idle_span_finish_reason']?.value).toBe('idleTimeout');

  // The span should wait for the full idle timeout (5+ seconds)
  const duration = span.end_timestamp - span.start_timestamp;
  expect(duration).toBeGreaterThan(5.0);
  expect(duration).toBeLessThan(7.0);
});

test('idleTimeout: Finishes prematurely with low timeout', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name.includes('deep');
  });

  // Very low idleTimeout (50ms) and lazyRouteTimeout (100ms)
  // The span finishes quickly, but still gets a parameterized route name
  await page.goto('/?idleTimeout=50&timeout=100');

  const navigationLink = page.locator('id=navigation-to-deep');
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const span = await spanPromise;

  expect(span.attributes['sentry.idle_span_finish_reason']?.value).toBe('idleTimeout');
  expect(span.name).toBe('/deep/level2/level3/:id');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');

  // The span should finish quickly (< 200ms)
  const duration = span.end_timestamp - span.start_timestamp;
  expect(duration).toBeLessThan(0.2);
});

test('idleTimeout: Pageload on deeply nested route', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name.includes('deep');
  });

  // Direct pageload to deeply nested route (not navigation)
  await page.goto('/deep/level2/level3/12345');

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('/deep/level2/level3/:id');
  expect(pageloadSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(pageloadSpan.attributes['sentry.idle_span_finish_reason']?.value).toBe('idleTimeout');
});
