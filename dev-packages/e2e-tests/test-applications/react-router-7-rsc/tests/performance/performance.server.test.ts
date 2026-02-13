import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('RSC - Performance', () => {
  test('should send server transaction on pageload', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, transactionEvent => {
      const isServerTransaction = transactionEvent.contexts?.runtime?.name === 'node';
      const matchesRoute =
        transactionEvent.transaction?.includes('/performance') ||
        transactionEvent.request?.url?.includes('/performance');
      return Boolean(isServerTransaction && matchesRoute && !transactionEvent.request?.url?.includes('/with/'));
    });

    await page.goto(`/performance`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      type: 'transaction',
      transaction: expect.stringMatching(/GET \/performance|GET \*/),
      platform: 'node',
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.op': 'http.server',
            'sentry.origin': expect.stringMatching(/auto\.http\.(otel\.http|react_router\.request_handler)/),
            'sentry.source': expect.stringMatching(/route|url/),
          },
          op: 'http.server',
          origin: expect.stringMatching(/auto\.http\.(otel\.http|react_router\.request_handler)/),
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction_info: { source: expect.stringMatching(/route|url/) },
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
        packages: expect.arrayContaining([
          expect.objectContaining({ name: 'npm:@sentry/react-router', version: expect.any(String) }),
          expect.objectContaining({ name: 'npm:@sentry/node', version: expect.any(String) }),
        ]),
      },
      tags: {
        runtime: 'node',
      },
    });
  });

  test('should send server transaction on parameterized route', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, transactionEvent => {
      const isServerTransaction = transactionEvent.contexts?.runtime?.name === 'node';
      const matchesRoute =
        transactionEvent.transaction?.includes('/performance/with') ||
        transactionEvent.request?.url?.includes('/performance/with/some-param');
      return Boolean(isServerTransaction && matchesRoute);
    });

    await page.goto(`/performance/with/some-param`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      type: 'transaction',
      transaction: expect.stringMatching(/GET \/performance\/with|GET \*/),
      platform: 'node',
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.op': 'http.server',
            'sentry.origin': expect.stringMatching(/auto\.http\.(otel\.http|react_router\.request_handler)/),
            'sentry.source': expect.stringMatching(/route|url/),
          },
          op: 'http.server',
          origin: expect.stringMatching(/auto\.http\.(otel\.http|react_router\.request_handler)/),
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction_info: { source: expect.stringMatching(/route|url/) },
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
        packages: expect.arrayContaining([
          expect.objectContaining({ name: 'npm:@sentry/react-router', version: expect.any(String) }),
          expect.objectContaining({ name: 'npm:@sentry/node', version: expect.any(String) }),
        ]),
      },
      tags: {
        runtime: 'node',
      },
    });
  });
});
