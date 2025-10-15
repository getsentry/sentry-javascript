import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create consistent parameterized transaction for i18n routes - locale: en', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent.transaction === '/:locale/i18n-test' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/en/i18n-test`);

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

test('should create consistent parameterized transaction for i18n routes - locale: ar', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent.transaction === '/:locale/i18n-test' && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto(`/ar/i18n-test`);

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
