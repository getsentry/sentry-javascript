import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create consistent parameterized transaction for default locale (no prefix)', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent.transaction === '/:locale/i18n-test' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  // Visit route without locale prefix (simulating default locale behavior)
  const response = await page.goto(`/i18n-test`);

  // Ensure page loaded successfully
  expect(response?.status()).toBe(200);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'route',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.app_router_instrumentation',
      },
    },
    transaction: '/:locale/i18n-test',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});

test('should create consistent parameterized transaction for non-default locale (with prefix)', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent.transaction === '/:locale/i18n-test' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  // Visit route with locale prefix (simulating non-default locale)
  const response = await page.goto(`/ar/i18n-test`);

  // Ensure page loaded successfully
  expect(response?.status()).toBe(200);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'route',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.app_router_instrumentation',
      },
    },
    transaction: '/:locale/i18n-test',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});
