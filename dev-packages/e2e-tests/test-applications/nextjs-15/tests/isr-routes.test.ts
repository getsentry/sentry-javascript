import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('should remove sentry-trace and baggage meta tags on ISR dynamic route page load', async ({ page }) => {
  // Navigate to ISR page
  await page.goto('/isr-test/laptop');

  // Wait for page to be fully loaded
  await expect(page.locator('#isr-product-id')).toHaveText('laptop');

  // Check that sentry-trace and baggage meta tags are removed for ISR pages
  await expect(page.locator('meta[name="sentry-trace"]')).toHaveCount(0);
  await expect(page.locator('meta[name="baggage"]')).toHaveCount(0);
});

test('should remove sentry-trace and baggage meta tags on ISR static route', async ({ page }) => {
  // Navigate to ISR static page
  await page.goto('/isr-test/static');

  // Wait for page to be fully loaded
  await expect(page.locator('#isr-static-marker')).toHaveText('static-isr');

  // Check that sentry-trace and baggage meta tags are removed for ISR pages
  await expect(page.locator('meta[name="sentry-trace"]')).toHaveCount(0);
  await expect(page.locator('meta[name="baggage"]')).toHaveCount(0);
});

test('should remove meta tags for different ISR dynamic route values', async ({ page }) => {
  // Test with 'phone' (one of the pre-generated static params)
  await page.goto('/isr-test/phone');
  await expect(page.locator('#isr-product-id')).toHaveText('phone');

  await expect(page.locator('meta[name="sentry-trace"]')).toHaveCount(0);
  await expect(page.locator('meta[name="baggage"]')).toHaveCount(0);

  // Test with 'tablet'
  await page.goto('/isr-test/tablet');
  await expect(page.locator('#isr-product-id')).toHaveText('tablet');

  await expect(page.locator('meta[name="sentry-trace"]')).toHaveCount(0);
  await expect(page.locator('meta[name="baggage"]')).toHaveCount(0);
});

test('should create unique traces for ISR pages on each visit', async ({ page }) => {
  const traceIds: string[] = [];

  // Load the same ISR page 5 times to ensure cached HTML meta tags are consistently removed
  for (let i = 0; i < 5; i++) {
    const spanPromise = waitForStreamedSpan('nextjs-15', span => {
      return span.name === '/isr-test/:product' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    if (i === 0) {
      await page.goto('/isr-test/laptop');
    } else {
      await page.reload();
    }

    const span = await spanPromise;
    const traceId = span.trace_id;

    expect(traceId).toBeDefined();
    expect(traceId).toMatch(/[a-f0-9]{32}/);
    traceIds.push(traceId!);
  }

  // Verify all 5 page loads have unique trace IDs (no reuse of cached/stale meta tags)
  const uniqueTraceIds = new Set(traceIds);
  expect(uniqueTraceIds.size).toBe(5);
});

test('ISR route should be identified correctly in the route manifest', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === '/isr-test/:product' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/isr-test/laptop');
  const span = await spanPromise;

  // Verify the span is properly parameterized
  expect(span.name).toBe('/isr-test/:product');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});
