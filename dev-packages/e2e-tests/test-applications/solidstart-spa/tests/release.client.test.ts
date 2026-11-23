import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('sends the release from the prerendered page with client events', async ({ page }) => {
  const errorPromise = waitForError('solidstart-spa', async errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Uncaught error thrown from Solid Start E2E test app';
  });

  // `/` is the page SPA mode prerenders.
  await page.goto('/');
  await expect(page.locator('meta[name="sentry-release"]')).toHaveAttribute('content', 'test-release');
  await page.getByRole('link', { name: 'Client error' }).click();
  await page.locator('#errorBtn').click();
  const error = await errorPromise;

  expect(error.release).toBe('test-release');
});
