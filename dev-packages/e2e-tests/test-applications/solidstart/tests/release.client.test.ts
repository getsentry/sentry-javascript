import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('sends the release that the server adds to the page with client events', async ({ page }) => {
  const errorPromise = waitForError('solidstart', async errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Uncaught error thrown from Solid Start E2E test app';
  });

  await page.goto('/client-error');
  await expect(page.locator('meta[name="sentry-release"]')).toHaveAttribute('content', 'test-release');
  await page.locator('#errorBtn').click();
  const error = await errorPromise;

  expect(error.release).toBe('test-release');
});
