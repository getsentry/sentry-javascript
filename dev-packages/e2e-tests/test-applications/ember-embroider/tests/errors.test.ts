import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('sends an error', async ({ page }) => {
  const errorPromise = waitForError('ember-embroider', async errorEvent => {
    return !errorEvent.type;
  });

  await page.goto(`/`);

  await page.locator('[data-test-button="Throw Generic Javascript Error"]').click();

  const error = await errorPromise;

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'TypeError',
          value: 'this.nonExistentFunction is not a function',
          mechanism: {
            type: 'auto.browser.browserapierrors.addEventListener',
            handled: false,
          },
        },
      ],
    },
    transaction: 'route:index',
  });
});

test('assigns the correct transaction value after a navigation', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('ember-embroider', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const errorPromise = waitForError('ember-embroider', async errorEvent => {
    return !errorEvent.type;
  });

  await page.goto(`/tracing`);
  await pageloadTxnPromise;

  await page.getByText('Errors').click();

  const [_, error] = await Promise.all([
    page.locator('[data-test-button="Throw Generic Javascript Error"]').click(),
    errorPromise,
  ]);

  expect(error).toMatchObject({
    exception: {
      values: [
        {
          type: 'TypeError',
          value: 'this.nonExistentFunction is not a function',
          mechanism: {
            type: 'auto.browser.browserapierrors.addEventListener',
            handled: false,
          },
        },
      ],
    },
    transaction: 'route:index',
  });
});
