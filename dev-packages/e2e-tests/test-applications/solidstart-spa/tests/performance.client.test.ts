import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('solidstart-spa', async transactionEvent => {
    return transactionEvent?.transaction === '/' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');
  const pageloadTransaction = await transactionPromise;

  expect(pageloadTransaction).toMatchObject({
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
  const transactionPromise = waitForTransaction('solidstart-spa', async transactionEvent => {
    return transactionEvent?.transaction === '/users/5' && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  await page.locator('#navLink').click();
  const navigationTransaction = await transactionPromise;

  expect(navigationTransaction).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.solidstart.solidrouter',
      },
    },
    transaction: '/users/5',
    transaction_info: {
      source: 'url',
    },
  });
});

test('updates the transaction when using the back button', async ({ page }) => {
  // Solid Router sends a `-1` navigation when using the back button.
  // The sentry solidRouterBrowserTracingIntegration tries to update such
  // transactions with the proper name once the `useLocation` hook triggers.
  const navigationTxnPromise = waitForTransaction('solidstart-spa', async transactionEvent => {
    return transactionEvent?.transaction === '/users/6' && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/back-navigation`);
  await page.locator('#navLink').click();
  const navigationTxn = await navigationTxnPromise;

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.solidstart.solidrouter',
      },
    },
    transaction: '/users/6',
    transaction_info: {
      source: 'url',
    },
  });

  const backNavigationTxnPromise = waitForTransaction('solidstart-spa', async transactionEvent => {
    return (
      transactionEvent?.transaction === '/back-navigation' && transactionEvent.contexts?.trace?.op === 'navigation'
    );
  });

  await page.goBack();
  const backNavigationTxn = await backNavigationTxnPromise;

  expect(backNavigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.solidstart.solidrouter',
      },
    },
    transaction: '/back-navigation',
    transaction_info: {
      source: 'url',
    },
  });
});
