import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('idleTimeout: Captures all activity with increased timeout', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction.includes('deep')
    );
  });

  // High idleTimeout (5000ms) ensures transaction captures all lazy loading activity
  await page.goto('/?idleTimeout=5000');

  const navigationLink = page.locator('id=navigation-to-deep');
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const event = await transactionPromise;

  expect(event.transaction).toBe('/deep/level2/level3/:id');
  expect(event.contexts?.trace?.data?.['sentry.source']).toBe('route');
  expect(event.contexts?.trace?.data?.['sentry.idle_span_finish_reason']).toBe('idleTimeout');

  // Transaction should wait for full idle timeout (5+ seconds)
  const duration = event.timestamp! - event.start_timestamp;
  expect(duration).toBeGreaterThan(5.0);
  expect(duration).toBeLessThan(7.0);
});

test('idleTimeout: Finishes prematurely with low timeout', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'navigation' &&
      transactionEvent.transaction.includes('deep')
    );
  });

  // Very low idleTimeout (50ms) -- transaction finishes quickly but still gets parameterized route name
  await page.goto('/?idleTimeout=50');

  const navigationLink = page.locator('id=navigation-to-deep');
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();

  const event = await transactionPromise;

  expect(event.contexts?.trace?.data?.['sentry.idle_span_finish_reason']).toBe('idleTimeout');
  expect(event.transaction).toBe('/deep/level2/level3/:id');
  expect(event.contexts?.trace?.data?.['sentry.source']).toBe('route');

  // Transaction should finish quickly (< 200ms)
  const duration = event.timestamp! - event.start_timestamp;
  expect(duration).toBeLessThan(0.2);
});

test('idleTimeout: Pageload on deeply nested route', async ({ page }) => {
  const pageloadPromise = waitForTransaction('react-router-7-lazy-routes', async transactionEvent => {
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction.includes('deep')
    );
  });

  // Direct pageload to deeply nested route (not navigation)
  await page.goto('/deep/level2/level3/12345');

  const pageloadEvent = await pageloadPromise;

  expect(pageloadEvent.transaction).toBe('/deep/level2/level3/:id');
  expect(pageloadEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
  expect(pageloadEvent.contexts?.trace?.data?.['sentry.idle_span_finish_reason']).toBe('idleTimeout');
});
