import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('sends an error', async ({ page }) => {
  const errorPromise = waitForError('vue-3', async errorEvent => {
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
          value: 'This is a Vue test error',
          mechanism: {
            type: 'auto.function.vue.error_handler',
            handled: false,
          },
        },
      ],
    },
    transaction: '/',
  });
});

test('sends an error with a parameterized transaction name', async ({ page }) => {
  const errorPromise = waitForError('vue-3', async errorEvent => {
    return !errorEvent.type;
  });

  await page.goto(`/users-error/456`);

  await page.locator('#userErrorBtn').click();

  const error = await errorPromise;

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'This is a Vue test error',
          mechanism: {
            type: 'auto.function.vue.error_handler',
            handled: false,
          },
        },
      ],
    },
    transaction: '/users-error/:id',
  });
});
