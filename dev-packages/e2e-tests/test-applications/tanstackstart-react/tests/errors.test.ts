import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends client-side error to Sentry', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    console.log('errorEvent', errorEvent);
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry Test Error';
  });

  await page.goto(`/`);

  await expect(page.locator('button')).toContainText('Break the world');

  await page.locator('button').click();
  console.log('clicked button');

  const errorEvent = await errorEventPromise;
  console.log('errorEvent', errorEvent);

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Test Error',
          mechanism: {
            handled: false,
          },
        },
      ],
    },
  });

  expect(errorEvent.transaction).toBe('/');
});
