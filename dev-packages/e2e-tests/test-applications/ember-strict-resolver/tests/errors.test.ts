import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('sends an error', async ({ page }) => {
  const errorPromise = waitForError('ember-strict-resolver', async errorEvent => {
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
  const pageloadTxnPromise = waitForTransaction('ember-strict-resolver', async transactionEvent => {
    return !!transactionEvent.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const errorPromise = waitForError('ember-strict-resolver', async errorEvent => {
    return !errorEvent.type;
  });

  await page.goto(`/tracing`);
  await pageloadTxnPromise;

  await page.getByText('Home').click();

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

test('captures Ember error', async ({ page }) => {
  const errorPromise = waitForError('ember-strict-resolver', event => {
    return event.exception?.values?.[0]?.value?.includes('EmberError') ?? false;
  });

  await page.goto('/');
  await page.locator('[data-test-button="Throw EmberError"]').click();

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toContain('EmberError');
});
