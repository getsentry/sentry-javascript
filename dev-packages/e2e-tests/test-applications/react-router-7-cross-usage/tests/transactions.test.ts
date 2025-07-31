import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a pageload transaction with a parameterized URL', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-7-cross-usage', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/projects/123/views/234/567`);

  const rootSpan = await transactionPromise;

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v7',
      },
    },
    transaction: '/projects/:projectId/views/:viewId/:detailId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a pageload transaction with a parameterized URL - alternative route', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-7-cross-usage', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/projects/234/old-views/234/567`);

  const rootSpan = await transactionPromise;

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(rootSpan).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v7',
      },
    },
    transaction: '/projects/:projectId/old-views/:viewId/:detailId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('react-router-7-cross-usage', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('react-router-7-cross-usage', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  const pageloadTxn = await pageloadTxnPromise;

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v7',
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'route',
    },
  });

  const linkElement = page.locator('id=navigation');

  const [_, navigationTxn] = await Promise.all([linkElement.click(), navigationTxnPromise]);

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouter_v7',
      },
    },
    transaction: '/projects/:projectId/views/:viewId/:detailId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a navigation transaction with a parameterized URL - alternative route', async ({ page }) => {
  const pageloadTxnPromise = waitForTransaction('react-router-7-cross-usage', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const navigationTxnPromise = waitForTransaction('react-router-7-cross-usage', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'navigation';
  });

  await page.goto(`/`);
  const pageloadTxn = await pageloadTxnPromise;

  expect(pageloadTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter_v7',
      },
    },
    transaction: '/',
    transaction_info: {
      source: 'route',
    },
  });

  const linkElement = page.locator('id=old-navigation');

  const [_, navigationTxn] = await Promise.all([linkElement.click(), navigationTxnPromise]);

  expect((await page.innerHTML('#root')).includes('Details')).toBe(true);
  expect(navigationTxn).toMatchObject({
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.react.reactrouter_v7',
      },
    },
    transaction: '/projects/:projectId/old-views/:viewId/:detailId',
    transaction_info: {
      source: 'route',
    },
  });
});

test('sends a pageload transaction for lazy route', async ({ page }) => {
  const transactionPromise = waitForTransaction('react-router-7-cross-usage', async transactionEvent => {
    console.debug('Lazy route transaction event', transactionEvent);
    return (
      !!transactionEvent?.transaction &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/lazy/inner-lazy/inner-inner-lazy'
    );
  });

  // Try to navigate to the full nested path
  await page.goto('/lazy/level-1/123/456/789');

  console.debug('Navigated to lazy route');
  console.debug('ROOT', await page.innerHTML('#root'));

  const event = await transactionPromise;

  expect(event.transaction).toBe('/lazy/inner-lazy/inner-inner-lazy');
  expect(event.type).toBe('transaction');
  expect(event.contexts?.trace?.op).toBe('pageload');
});
