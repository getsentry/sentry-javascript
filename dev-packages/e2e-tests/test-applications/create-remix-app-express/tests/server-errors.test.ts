import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends a loader error to Sentry', async ({ page }) => {
  const loaderErrorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Loader Error';
  });

  await page.goto('/loader-error');

  const loaderError = await loaderErrorPromise;

  expect(loaderError).toBeDefined();
});
