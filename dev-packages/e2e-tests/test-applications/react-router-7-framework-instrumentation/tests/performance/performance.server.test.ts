import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - instrumentation API performance', () => {
  test('should send server transaction on pageload with instrumentation API origin', async ({ page }) => {
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
            'sentry.origin': 'auto.http.react_router.instrumentation_api',
            'sentry.source': 'route',
          },
          op: 'http.server',
          origin: 'auto.http.react_router.instrumentation_api',
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

  test('should send server transaction on parameterized route with instrumentation API origin', async ({ page }) => {
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
            'sentry.origin': 'auto.http.react_router.instrumentation_api',
            'sentry.source': 'route',
          },
          op: 'http.server',
          origin: 'auto.http.react_router.instrumentation_api',
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
    });
  });

  test('should instrument server loader with instrumentation API origin', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/server-loader';
    });

    await page.goto(`/performance/server-loader`);

    const transaction = await txPromise;

    // Find the loader span
    const loaderSpan = transaction?.spans?.find(span => span.data?.['sentry.op'] === 'function.react_router.loader');

    expect(loaderSpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      data: {
        'sentry.origin': 'auto.function.react_router.instrumentation_api',
        'sentry.op': 'function.react_router.loader',
      },
      description: '/performance/server-loader',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      status: 'ok',
      op: 'function.react_router.loader',
      origin: 'auto.function.react_router.instrumentation_api',
    });
  });

  test('should instrument server action with instrumentation API origin', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'POST /performance/server-action';
    });

    await page.goto(`/performance/server-action`);
    await page.getByRole('button', { name: 'Submit' }).click();

    const transaction = await txPromise;

    // Find the action span
    const actionSpan = transaction?.spans?.find(span => span.data?.['sentry.op'] === 'function.react_router.action');

    expect(actionSpan).toMatchObject({
      span_id: expect.any(String),
      trace_id: expect.any(String),
      data: {
        'sentry.origin': 'auto.function.react_router.instrumentation_api',
        'sentry.op': 'function.react_router.action',
      },
      description: '/performance/server-action',
      parent_span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      status: 'ok',
      op: 'function.react_router.action',
      origin: 'auto.function.react_router.instrumentation_api',
    });
  });
});
