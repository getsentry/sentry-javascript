import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a pageload transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-v2-non-vite', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === 'routes/_index';
  });

  await page.goto('/');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      // No manifest available (legacy app without the Sentry Vite plugin), so source falls back to 'route'
      // and url.template uses the route id instead of a parameterized URL path.
      'sentry.source': 'route',
      'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/$/),
      'url.path': '/',
      'url.template': 'routes/_index',
    }),
  );
});

test('Sends a navigation transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-v2-non-vite', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === 'routes/user.$id';
  });

  await page.goto('/');

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      'sentry.source': 'route',
      'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/user\/5$/),
      'url.path': '/user/5',
      'url.template': 'routes/user.$id',
    }),
  );
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
