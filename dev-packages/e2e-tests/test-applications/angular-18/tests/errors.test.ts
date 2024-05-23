import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';

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
    transaction: '/home/',
  });
});

test('assigns the correct transaction value after a navigation', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const errorPromise = waitForError('angular-17', async errorEvent => {
    return !errorEvent.type;
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  await page.waitForTimeout(5000);

  await page.locator('#navLink').click();

  const [_, error] = await Promise.all([page.locator('#userErrorBtn').click(), errorPromise]);

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error thrown from user page',
          mechanism: {
            type: 'angular',
            handled: false,
          },
        },
      ],
    },
    transaction: '/users/:id/',
  });
});
