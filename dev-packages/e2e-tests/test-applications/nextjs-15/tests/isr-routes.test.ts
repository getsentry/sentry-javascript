import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const isProductionBuild = process.env.TEST_ENV === 'production' || process.env.TEST_ENV === 'prod-turbopack';

test('does not carry trace meta tags on an ISR dynamic route', async ({ page }) => {
  // The dev server renders ISR pages for every request, so there the trace tags are fresh and kept.
  test.skip(!isProductionBuild, 'ISR pages are only prerendered in production builds');

  // Navigate to ISR page
  await page.goto('/isr-test/laptop');

  // Wait for page to be fully loaded
  await expect(page.locator('#isr-product-id')).toHaveText('laptop');

  // The shell was prerendered, and a prerender writes no trace tags
  await expect(page.locator('meta[name="sentry-trace"]')).toHaveCount(0);
  await expect(page.locator('meta[name="baggage"]')).toHaveCount(0);
});

test('does not carry trace meta tags on an ISR static route', async ({ page }) => {
  // The dev server renders ISR pages for every request, so there the trace tags are fresh and kept.
  test.skip(!isProductionBuild, 'ISR pages are only prerendered in production builds');

  // Navigate to ISR static page
  await page.goto('/isr-test/static');

  // Wait for page to be fully loaded
  await expect(page.locator('#isr-static-marker')).toHaveText('static-isr');

  // The shell was prerendered, and a prerender writes no trace tags
  await expect(page.locator('meta[name="sentry-trace"]')).toHaveCount(0);
  await expect(page.locator('meta[name="baggage"]')).toHaveCount(0);
});

test('does not carry trace meta tags for different ISR dynamic route values', async ({ page }) => {
  // The dev server renders ISR pages for every request, so there the trace tags are fresh and kept.
  test.skip(!isProductionBuild, 'ISR pages are only prerendered in production builds');

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

  // Load the same ISR page 5 times: the cached HTML carries no trace tag, so every visit starts its own trace
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

  // Verify all 5 page loads have unique trace IDs (no trace replayed from the cached HTML)
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
