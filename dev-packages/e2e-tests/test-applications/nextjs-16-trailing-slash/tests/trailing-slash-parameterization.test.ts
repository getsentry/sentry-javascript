import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// These tests verify that pageload transactions are correctly named when
// trailingSlash: true is enabled in next.config.ts, even when a catch-all
// route exists. See: https://github.com/getsentry/sentry-javascript/issues/19241

test('should create a correctly named pageload transaction for a static route', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-16-trailing-slash', async transactionEvent => {
    return (
      transactionEvent.transaction === '/static-page' && transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/static-page`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'url',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.app_router_instrumentation',
      },
    },
    transaction: '/static-page',
    transaction_info: { source: 'url' },
    type: 'transaction',
  });
});

test('should create a correctly named pageload transaction for a parameterized route', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-16-trailing-slash', async transactionEvent => {
    return (
      transactionEvent.transaction === '/parameterized/:param' && transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/parameterized/some-value`);

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
    transaction: '/parameterized/:param',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});

test('should create a correctly named pageload transaction for a static nested route under parameterized', async ({
  page,
}) => {
  const transactionPromise = waitForTransaction('nextjs-16-trailing-slash', async transactionEvent => {
    return (
      transactionEvent.transaction === '/parameterized/static' && transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/parameterized/static`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'url',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.app_router_instrumentation',
      },
    },
    transaction: '/parameterized/static',
    transaction_info: { source: 'url' },
    type: 'transaction',
  });
});

test('should create a correctly named pageload transaction for the catch-all route', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-16-trailing-slash', async transactionEvent => {
    return (
      transactionEvent.transaction === '/:slug*' && transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/some/unmatched/path`);

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
    transaction: '/:slug*',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});

test('should create a correctly named pageload transaction for the home page', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-16-trailing-slash', async transactionEvent => {
    return (
      transactionEvent.transaction === '/' && transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'url',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.app_router_instrumentation',
      },
    },
    transaction: '/',
    transaction_info: { source: 'url' },
    type: 'transaction',
  });
});
