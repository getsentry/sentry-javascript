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
            'sentry.origin': 'auto.http.react-router.request-handler',
            'sentry.source': 'route',
          },
          op: 'http.server',
          origin: 'auto.http.react-router.request-handler',
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
            'sentry.origin': 'auto.http.react-router.request-handler',
            'sentry.source': 'route',
          },
          op: 'http.server',
          origin: 'auto.http.react-router.request-handler',
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

  test('should automatically instrument server loader', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/server-loader.data';
    });

    await page.goto('/performance'); // initial ssr pageloads do not contain .data requests
    await page.getByRole('link', { name: 'Server Loader' }).click(); // this will actually trigger a .data request

    const transaction = await txPromise;

    expect(transaction).toEqual(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
            op: 'http.server',
            origin: 'auto.http.react-router.server',
            parent_span_id: expect.any(String),
            status: 'ok',
            data: expect.objectContaining({
              'http.method': 'GET',
              'http.response.status_code': 200,
              'http.status_code': 200,
              'http.status_text': 'OK',
              'http.target': '/performance/server-loader.data',
              'http.url': 'http://localhost:3030/performance/server-loader.data',
              'sentry.op': 'http.server',
              'sentry.origin': 'auto.http.react-router.server',
              'sentry.source': 'url',
              url: 'http://localhost:3030/performance/server-loader.data',
            }),
          },
        }),
        transaction: 'GET /performance/server-loader.data',
        type: 'transaction',
        transaction_info: { source: 'url' },
        platform: 'node',
      }),
    );

    // ensure we do not have a stray, bogus route attribute
    expect(transaction.contexts?.trace?.data?.['http.route']).not.toBeDefined();

    expect(transaction.spans).toContainEqual({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      data: {
        'sentry.op': 'function.react-router.loader',
        'sentry.origin': 'auto.http.react-router.server',
      },
      description: 'Executing Server Loader',
      op: 'function.react-router.loader',
      origin: 'auto.http.react-router.server',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
    });
  });

  test('should automatically instrument server action', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'POST /performance/server-action.data';
    });

    await page.goto(`/performance/server-action`);
    await page.getByRole('button', { name: 'Submit' }).click(); // this will trigger a .data request

    const transaction = await txPromise;

    expect(transaction).toEqual(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
            op: 'http.server',
            origin: 'auto.http.react-router.server',
            parent_span_id: expect.any(String),
            status: 'ok',
            data: expect.objectContaining({
              'http.method': 'POST',
              'http.response.status_code': 200,
              'http.status_code': 200,
              'http.status_text': 'OK',
              'http.target': '/performance/server-action.data',
              'http.url': 'http://localhost:3030/performance/server-action.data',
              'sentry.op': 'http.server',
              'sentry.origin': 'auto.http.react-router.server',
              'sentry.source': 'url',
              url: 'http://localhost:3030/performance/server-action.data',
            }),
          },
        }),
        transaction: 'POST /performance/server-action.data',
        type: 'transaction',
        transaction_info: { source: 'url' },
        platform: 'node',
      }),
    );
    // ensure we do not have a stray, bogus route attribute
    expect(transaction.contexts?.trace?.data?.['http.route']).not.toBeDefined();

    expect(transaction.spans).toContainEqual({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      data: {
        'sentry.op': 'function.react-router.action',
        'sentry.origin': 'auto.http.react-router.server',
      },
      description: 'Executing Server Action',
      op: 'function.react-router.action',
      origin: 'auto.http.react-router.server',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
    });
  });
});
