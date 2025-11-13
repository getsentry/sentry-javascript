import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

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

test('should create unique transactions for ISR pages (not using stale trace IDs)', async ({ page }) => {
  // First navigation - capture the trace ID
  const firstTransactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
    return transactionEvent.transaction === '/isr-test/:product' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/isr-test/laptop');
  const firstTransaction = await firstTransactionPromise;
  const firstTraceId = firstTransaction.contexts?.trace?.trace_id;

  expect(firstTraceId).toBeDefined();
  expect(firstTraceId).toMatch(/[a-f0-9]{32}/);

  // Second navigation to the same ISR route with different param
  const secondTransactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
    return !!(
      transactionEvent.transaction === '/isr-test/:product' &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.request?.url?.includes('/isr-test/phone')
    );
  });

  await page.goto('/isr-test/phone');
  const secondTransaction = await secondTransactionPromise;
  const secondTraceId = secondTransaction.contexts?.trace?.trace_id;

  expect(secondTraceId).toBeDefined();
  expect(secondTraceId).toMatch(/[a-f0-9]{32}/);

  // Verify that each page load gets a NEW trace ID (not reusing cached/stale ones)
  expect(firstTraceId).not.toBe(secondTraceId);
});

test('ISR route should be identified correctly in the route manifest', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
    return transactionEvent.transaction === '/isr-test/:product' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/isr-test/laptop');
  const transaction = await transactionPromise;

  // Verify the transaction is properly parameterized
  expect(transaction).toMatchObject({
    transaction: '/isr-test/:product',
    transaction_info: { source: 'route' },
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
        },
      },
    },
  });
});
