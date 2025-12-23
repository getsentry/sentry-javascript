import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - performance', () => {
  test('should send server transaction on pageload', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance';
    });

    await page.goto(`/performance`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.react_router.request_handler',
            'sentry.source': 'route',
          },
          op: 'http.server',
          origin: 'auto.http.react_router.request_handler',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: 'GET /performance',
      type: 'transaction',
      transaction_info: { source: 'route' },
      platform: 'node',
      request: {
        url: expect.stringContaining('/performance'),
        headers: expect.any(Object),
      },
      event_id: expect.any(String),
      environment: 'qa',
      sdk: {
        integrations: expect.arrayContaining([expect.any(String)]),
        name: 'sentry.javascript.react-router',
        version: expect.any(String),
        packages: [
          { name: 'npm:@sentry/react-router', version: expect.any(String) },
          { name: 'npm:@sentry/node', version: expect.any(String) },
        ],
      },
      tags: {
        runtime: 'node',
      },
    });
  });

  test('should send server transaction on parameterized route', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/with/:param';
    });

    await page.goto(`/performance/with/some-param`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.react_router.request_handler',
            'sentry.source': 'route',
          },
          op: 'http.server',
          origin: 'auto.http.react_router.request_handler',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: 'GET /performance/with/:param',
      type: 'transaction',
      transaction_info: { source: 'route' },
      platform: 'node',
      request: {
        url: expect.stringContaining('/performance/with/some-param'),
        headers: expect.any(Object),
      },
      event_id: expect.any(String),
      environment: 'qa',
      sdk: {
        integrations: expect.arrayContaining([expect.any(String)]),
        name: 'sentry.javascript.react-router',
        version: expect.any(String),
        packages: [
          { name: 'npm:@sentry/react-router', version: expect.any(String) },
          { name: 'npm:@sentry/node', version: expect.any(String) },
        ],
      },
      tags: {
        runtime: 'node',
      },
    });
  });

  // This does not work on Node 20.19, sadly
  test.skip('should automatically instrument server loader', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/server-loader.data';
    });

    await page.goto(`/performance`); // initial ssr pageloads do not contain .data requests
    await page.waitForTimeout(500); // quick breather before navigation
    await page.getByRole('link', { name: 'Server Loader' }).click(); // this will actually trigger a .data request

    const transaction = await txPromise;

    expect(transaction?.spans?.[transaction.spans?.length - 1]).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      data: {
        'sentry.origin': 'auto.http.react_router',
        'sentry.op': 'function.react_router.loader',
      },
      description: 'Executing Server Loader',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      status: 'ok',
      op: 'function.react_router.loader',
      origin: 'auto.http.react_router',
    });
  });

  // This does not work on Node 20.19, sadly
  test.skip('should automatically instrument server action', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'POST /performance/server-action.data';
    });

    await page.goto(`/performance/server-action`);
    await page.getByRole('button', { name: 'Submit' }).click(); // this will trigger a .data request

    const transaction = await txPromise;

    expect(transaction?.spans?.[transaction.spans?.length - 1]).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      data: {
        'sentry.origin': 'auto.http.react_router',
        'sentry.op': 'function.react_router.action',
      },
      description: 'Executing Server Action',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      status: 'ok',
      op: 'function.react_router.action',
      origin: 'auto.http.react_router',
    });
  });
});
