import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('sends an error', async ({ page }) => {
  const errorPromise = waitForError('angular-18', async errorEvent => {
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
          value: 'Error thrown from Angular 18 E2E test app',
          mechanism: {
            type: 'auto.function.angular.error_handler',
            handled: false,
          },
        },
      ],
    },
    transaction: '/home/',
  });
});

test('assigns the correct transaction value after a navigation', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('angular-18', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const errorPromise = waitForError('angular-18', async errorEvent => {
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
            type: 'auto.function.angular.error_handler',
            handled: false,
          },
        },
      ],
    },
    transaction: '/users/:id/',
  });
});
