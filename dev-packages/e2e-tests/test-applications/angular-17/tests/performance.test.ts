import { expect, test } from '@playwright/test';
import { waitForTransaction } from '../event-proxy-server';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const rootSpan = await transactionPromise;

  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.angular',
      },
    },
    transaction: '/home/',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  await pageloadTxnPromise;

  await page.waitForTimeout(5000);

  const [_, navigationTxn] = await Promise.all([page.locator('#navLink').click(), navigationTxnPromise]);

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
      },
    },
    transaction: '/users/:id/',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction even if the pageload span is still active', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);

  // immediately navigate to a different route
  const [_, pageloadTxn, navigationTxn] = await Promise.all([
    page.locator('#navLink').click(),
    pageloadTxnPromise,
    navigationTxnPromise,
  ]);

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.angular',
      },
    },
    transaction: '/home/',
    transaction_info: {
      source: 'route',
    },
  });

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.angular',
      },
    },
    transaction: '/users/:id/',
    transaction_info: {
      source: 'route',
    },
  });
});

test('groups redirects within one navigation root span', async ({ page }) => {
  const navigationTxnPromise = waitForTransaction('angular-17', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);

  // immediately navigate to a different route
  const [_, navigationTxn] = await Promise.all([page.locator('#redirectLink').click(), navigationTxnPromise]);

  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.angular',
      },
    },
    transaction: '/users/:id/',
    transaction_info: {
      source: 'route',
    },
  });

  const routingSpan = navigationTxn.spans?.find(span => span.op === 'ui.angular.routing');

  expect(routingSpan).toBeDefined();
  expect(routingSpan?.description).toBe('/redirect1');
});
