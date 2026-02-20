import { expect, test } from '@playwright/test';

test('Server-Timing header contains sentry-trace on page load', async ({ page }) => {
  const responsePromise = page.waitForResponse(
    response =>
      response.url().endsWith('/') && response.status() === 200 && response.request().resourceType() === 'document',
  );

  await page.goto('/');

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');
});
