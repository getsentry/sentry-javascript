import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('sends an error', async ({ page }) => {
  const errorPromise = waitForError('solid', async errorEvent => {
    return !errorEvent.type && errorEvent.exception?.values?.[0]?.value === 'Error thrown from Solid E2E test app';
  });

  await Promise.all([page.goto(`/`), page.locator('#errorBtn').click()]);

  const error = await errorPromise;

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error thrown from Solid E2E test app',
          mechanism: {
            type: 'auto.browser.global_handlers.onerror',
            handled: false,
          },
        },
      ],
    },
    transaction: '/',
  });
});
