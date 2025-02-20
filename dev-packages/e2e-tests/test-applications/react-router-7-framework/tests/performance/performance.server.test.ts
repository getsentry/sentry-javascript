import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('servery - performance', () => {
  test('should send server transaction on pageload', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      // todo: should be GET /performance
      return transactionEvent.transaction === 'GET *';
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
            'sentry.origin': 'auto.http.otel.http',
            'sentry.source': 'route',
          },
          op: 'http.server',
          origin: 'auto.http.otel.http',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      // todo: should be GET /performance
      transaction: 'GET *',
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
      // todo: should be GET /performance/with/:param
      return transactionEvent.transaction === 'GET *';
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
            'sentry.origin': 'auto.http.otel.http',
            'sentry.source': 'route',
          },
          op: 'http.server',
          origin: 'auto.http.otel.http',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      // todo: should be GET /performance/with/:param
      transaction: 'GET *',
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
});
