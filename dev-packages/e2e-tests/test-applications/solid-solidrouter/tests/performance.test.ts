import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('solid', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const [, pageloadTransaction] = await Promise.all([page.goto('/'), transactionPromise]);

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
  const transactionPromise = waitForTransaction('solid', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);

  const [, navigationTransaction] = await Promise.all([page.locator('#navLink').click(), transactionPromise]);

  expect(navigationTransaction).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.solid.solidrouter',
      },
    },
    transaction: '/user/5',
    transaction_info: {
      source: 'url',
    },
  });
});

test('updates the transaction when using the back button', async ({ page }) => {
  // Solid Router sends a `-1` navigation when using the back button.
  // The sentry solidRouterBrowserTracingIntegration tries to update such
  // transactions with the proper name once the `useLocation` hook triggers.
  const navigationTxnPromise = waitForTransaction('solid', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);

  const [, navigationTxn] = await Promise.all([page.locator('#navLink').click(), navigationTxnPromise]);

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.solid.solidrouter',
      },
    },
    transaction: '/user/5',
    transaction_info: {
      source: 'url',
    },
  });

  const backNavigationTxnPromise = waitForTransaction('solid', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  const [, backNavigationTxn] = await Promise.all([page.goBack(), backNavigationTxnPromise]);

  expect(backNavigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.solid.solidrouter',
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'url',
    },
  });
});
