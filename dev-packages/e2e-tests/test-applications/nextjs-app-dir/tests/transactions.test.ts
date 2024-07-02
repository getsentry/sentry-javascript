import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const packageJson = require('../package.json');

test('Sends a pageload transaction', async ({ page }) => {
  const pageloadTransactionEventPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: '/',
      tags: { runtime: 'browser' },
      transaction_info: { source: 'url' },
      type: 'transaction',
      contexts: {
        react: {
          version: expect.any(String),
        },
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          op: 'pageload',
          origin: 'auto.pageload.nextjs.app_router_instrumentation',
          data: expect.objectContaining({
            'sentry.op': 'pageload',
            'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
            'sentry.sample_rate': 1,
            'sentry.source': 'url',
          }),
        },
      },
      request: {
        headers: {
          'User-Agent': expect.any(String),
        },
        url: 'http://localhost:3030/',
      },
    }),
  );
});

test('Should send a transaction for instrumented server actions', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);
  test.skip(!isNaN(nextjsMajor) && nextjsMajor < 14, 'only applies to nextjs apps >= version 14');

  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'serverAction/myServerAction';
  });

  await page.goto('/server-action');
  await page.getByText('Run Action').click();

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent.extra).toMatchObject({
    'server_action_form_data.some-text-value': 'some-default-value',
    server_action_result: {
      city: 'Vienna',
    },
  });

  expect(Object.keys(transactionEvent.request?.headers || {}).length).toBeGreaterThan(0);
});

test('Should set not_found status for server actions calling notFound()', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);
  test.skip(!isNaN(nextjsMajor) && nextjsMajor < 14, 'only applies to nextjs apps >= version 14');

  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'serverAction/notFoundServerAction';
  });

  await page.goto('/server-action');
  await page.getByText('Run NotFound Action').click();

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent.contexts?.trace?.status).toBe('not_found');
});

test('Will not include spans in pageload transaction with faulty timestamps for slow loading pages', async ({
  page,
}) => {
  const pageloadTransactionEventPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/very-slow-component'
    );
  });

  await page.goto('/very-slow-component');

  const pageLoadTransaction = await pageloadTransactionEventPromise;

  expect(pageLoadTransaction.spans?.filter(span => span.timestamp! < span.start_timestamp)).toHaveLength(0);
});
