import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('sends an error', async ({ page }) => {
  const errorPromise = waitForError('solidjs', async errorEvent => {
    return !errorEvent.type;
  });

  await Promise.all([page.goto(`/`), page.locator('#errorBtn').click()]);

  const error = await errorPromise;

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error thrown from SolidJS E2E test app',
          mechanism: {
            type: 'onerror',
            handled: false,
          },
        },
      ],
    },
    transaction: '/',
  });
});
