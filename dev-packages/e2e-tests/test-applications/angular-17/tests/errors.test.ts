import { expect, test } from '@playwright/test';
import { waitForError } from '../event-proxy-server';

test('sends an error', async ({ page }) => {
  const errorPromise = waitForError('angular-17', async errorEvent => {
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
          value: 'Error thrown from Angular 17 E2E test app',
          mechanism: {
            type: 'angular',
            handled: false,
          },
        },
      ],
    },
  });
});
