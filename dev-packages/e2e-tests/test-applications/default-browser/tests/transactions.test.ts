import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('default-browser', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const errorEventPromise = waitForError('default-browser', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'I am an error!';
  });

  await page.goto('/');
  const transactionEvent = await transactionPromise;

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('I am an error!');

  expect(errorEvent.transaction).toEqual('/');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: transactionEvent.contexts?.trace?.trace_id,
    span_id: expect.not.stringContaining(transactionEvent.contexts?.trace?.span_id || ''),
  });
});

test('sends a navigation transaction', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  const pageLoadTransactionPromise = waitForTransaction('default-browser', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTransactionPromise = waitForTransaction('default-browser', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  await pageLoadTransactionPromise;

  const linkElement = page.locator('id=navigation-link');

  await linkElement.click();

  const navigationTransaction = await navigationTransactionPromise;

  expect(navigationTransaction).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.browser',
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'url',
    },
  });
});
