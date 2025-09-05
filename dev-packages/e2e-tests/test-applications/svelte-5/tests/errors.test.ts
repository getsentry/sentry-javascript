import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('sends an error', async ({ page }) => {
  const errorPromise = waitForError('svelte-5', async errorEvent => {
    return !errorEvent.type;
  });

  await page.goto(`/`);

  await page.locator('#errorBtn').click();

  const error = await errorPromise;

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error thrown from Svelte 5 E2E test app',
          mechanism: {
            type: 'auto.browser.browserapierrors.addEventListener',
            handled: false,
          },
        },
      ],
    },
    transaction: '/',
  });
});
