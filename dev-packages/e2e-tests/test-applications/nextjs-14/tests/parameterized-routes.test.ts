import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create a parameterized transaction when the `app` directory is used', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.transaction === '/parameterized/:one' && transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/parameterized/cappuccino`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    breadcrumbs: expect.arrayContaining([
      {
        category: 'navigation',
        data: { from: '/parameterized/cappuccino', to: '/parameterized/cappuccino' },
        timestamp: expect.any(Number),
      },
    ]),
    contexts: {
      react: { version: expect.any(String) },
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'route',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.app_router_instrumentation',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    environment: 'qa',
    request: {
      headers: expect.any(Object),
      url: expect.stringMatching(/\/parameterized\/cappuccino$/),
    },
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: '/parameterized/:one',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});

test('should create a static transaction when the `app` directory is used and the route is not parameterized', async ({
  page,
}) => {
  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.transaction === '/parameterized/static' && transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/parameterized/static`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    breadcrumbs: expect.arrayContaining([
      {
        category: 'navigation',
        data: { from: '/parameterized/static', to: '/parameterized/static' },
        timestamp: expect.any(Number),
      },
    ]),
    contexts: {
      react: { version: expect.any(String) },
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'url',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.app_router_instrumentation',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    environment: 'qa',
    request: {
      headers: expect.any(Object),
      url: expect.stringMatching(/\/parameterized\/static$/),
    },
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: '/parameterized/static',
    transaction_info: { source: 'url' },
    type: 'transaction',
  });
});

test('should create a partially parameterized transaction when the `app` directory is used', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.transaction === '/parameterized/:one/beep' && transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/parameterized/cappuccino/beep`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    breadcrumbs: expect.arrayContaining([
      {
        category: 'navigation',
        data: { from: '/parameterized/cappuccino/beep', to: '/parameterized/cappuccino/beep' },
        timestamp: expect.any(Number),
      },
    ]),
    contexts: {
      react: { version: expect.any(String) },
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'route',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.app_router_instrumentation',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    environment: 'qa',
    request: {
      headers: expect.any(Object),
      url: expect.stringMatching(/\/parameterized\/cappuccino\/beep$/),
    },
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: '/parameterized/:one/beep',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});

test('should create a nested parameterized transaction when the `app` directory is used', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.transaction === '/parameterized/:one/beep/:two' &&
      transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/parameterized/cappuccino/beep/espresso`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    breadcrumbs: expect.arrayContaining([
      {
        category: 'navigation',
        data: { from: '/parameterized/cappuccino/beep/espresso', to: '/parameterized/cappuccino/beep/espresso' },
        timestamp: expect.any(Number),
      },
    ]),
    contexts: {
      react: { version: expect.any(String) },
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'route',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.app_router_instrumentation',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    environment: 'qa',
    request: {
      headers: expect.any(Object),
      url: expect.stringMatching(/\/parameterized\/cappuccino\/beep\/espresso$/),
    },
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: '/parameterized/:one/beep/:two',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});
