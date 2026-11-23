import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('captures an uncaught error', async ({ page }) => {
  const errorPromise = waitForError('solid-2', errorEvent => {
    return !errorEvent.type && errorEvent.exception?.values?.[0]?.value === 'Error thrown from Solid 2 E2E test app';
  });

  await page.goto('/');
  await page.locator('#errorBtn').click();

  expect(await errorPromise).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error thrown from Solid 2 E2E test app',
          mechanism: {
            // Solid 2 attaches event handlers with `addEventListener`, which the browser SDK wraps.
            type: 'auto.browser.browserapierrors.addEventListener',
            handled: false,
          },
        },
      ],
    },
  });
});
