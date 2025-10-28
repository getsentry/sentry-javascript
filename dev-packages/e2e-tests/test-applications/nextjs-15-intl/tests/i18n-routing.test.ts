import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create consistent parameterized transaction for default locale without prefix', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-15-intl', async transactionEvent => {
    return transactionEvent.transaction === '/:locale/i18n-test' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/i18n-test`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    transaction: '/:locale/i18n-test',
    transaction_info: { source: 'route' },
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
        },
      },
    },
  });
});

test('should create consistent parameterized transaction for non-default locale with prefix', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-15-intl', async transactionEvent => {
    return transactionEvent.transaction === '/:locale/i18n-test' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/ar/i18n-test`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    transaction: '/:locale/i18n-test',
    transaction_info: { source: 'route' },
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
        },
      },
    },
  });
});

test('should parameterize locale root page correctly for default locale without prefix', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-15-intl', async transactionEvent => {
    return transactionEvent.transaction === '/:locale' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    transaction: '/:locale',
    transaction_info: { source: 'route' },
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
        },
      },
    },
  });
});

test('should parameterize locale root page correctly for non-default locale with prefix', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-15-intl', async transactionEvent => {
    return transactionEvent.transaction === '/:locale' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/fr`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    transaction: '/:locale',
    transaction_info: { source: 'route' },
    contexts: {
      trace: {
        data: {
          'sentry.source': 'route',
        },
      },
    },
  });
});
