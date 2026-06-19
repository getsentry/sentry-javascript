import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a pageload transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('remix-hydrogen', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
});

test('Sends a navigation transaction to Sentry', async ({ page }) => {
  // Wait for the initial pageload transaction first. This ensures the client SDK and
  // Remix router are fully hydrated before we click the link. Clicking before hydration
  // completes makes the `<Link>` behave like a plain anchor, triggering a full page
  // navigation (a `pageload` transaction) instead of a client-side `navigation` one,
  // which makes this test flaky.
  const pageloadTransactionPromise = waitForTransaction('remix-hydrogen', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/';
  });

  const transactionPromise = waitForTransaction('remix-hydrogen', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === '/user/:id';
  });

  await page.goto('/');

  await pageloadTransactionPromise;

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent).toMatchObject({
    transaction: '/user/:id',
  });
});

test('Renders `sentry-trace` and `baggage` meta tags for the root route', async ({ page }) => {
  await page.goto('/');

  const sentryTraceMetaTag = await page.waitForSelector('meta[name="sentry-trace"]', {
    state: 'attached',
  });
  const baggageMetaTag = await page.waitForSelector('meta[name="baggage"]', {
    state: 'attached',
  });

  expect(sentryTraceMetaTag).toBeTruthy();
  expect(baggageMetaTag).toBeTruthy();
});

test('Renders `sentry-trace` and `baggage` meta tags for a sub-route', async ({ page }) => {
  await page.goto('/user/123');

  const sentryTraceMetaTag = await page.waitForSelector('meta[name="sentry-trace"]', {
    state: 'attached',
  });
  const baggageMetaTag = await page.waitForSelector('meta[name="baggage"]', {
    state: 'attached',
  });

  expect(sentryTraceMetaTag).toBeTruthy();
  expect(baggageMetaTag).toBeTruthy();
});
