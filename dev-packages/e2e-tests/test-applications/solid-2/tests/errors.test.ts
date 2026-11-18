import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

// Unskipped once `@sentry/solid/solid2` lands.
test.skip('captures an uncaught error', async ({ page }) => {
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
            type: 'auto.browser.global_handlers.onerror',
            handled: false,
          },
        },
      ],
    },
  });
});
