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

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.browser',
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'url',
    },
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
