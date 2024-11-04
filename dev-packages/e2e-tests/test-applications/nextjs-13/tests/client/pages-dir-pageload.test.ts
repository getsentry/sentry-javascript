import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create a pageload transaction when the `pages` directory is used', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === '/[param]/pages-pageload' && transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/foo/pages-pageload`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    breadcrumbs: expect.arrayContaining([
      {
        category: 'navigation',
        data: { from: '/foo/pages-pageload', to: '/foo/pages-pageload' },
        timestamp: expect.any(Number),
      },
    ]),
    contexts: {
      react: { version: expect.any(String) },
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.pages_router_instrumentation',
          'sentry.source': 'route',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.pages_router_instrumentation',
        span_id: expect.any(String),
        trace_id: expect.any(String),
      },
    },
    environment: 'qa',
    request: {
      headers: expect.any(Object),
      url: expect.stringMatching(/\/foo\/pages-pageload$/),
    },
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: '/[param]/pages-pageload',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});

test('should create a pageload transaction with correct name when an error occurs in getServerSideProps', async ({
  page,
}) => {
  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === '/[param]/error-getServerSideProps' &&
      transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/something/error-getServerSideProps`, { waitUntil: 'networkidle' });

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    contexts: {
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.pages_router_instrumentation',
          'sentry.source': 'route',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.pages_router_instrumentation',
      },
    },
    transaction: '/[param]/error-getServerSideProps',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });

  // Ensure the transaction name is not '/_error'
  expect(transaction.transaction).not.toBe('/_error');
});
