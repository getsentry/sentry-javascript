import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('client - navigation performance', () => {
  test('should create navigation transaction', async ({ page }) => {
    const navigationPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance/ssr';
    });

    await page.goto(`/performance`); // pageload
    await page.waitForTimeout(1000); // give it a sec before navigation
    await page.getByRole('link', { name: 'SSR Page' }).click(); // navigation

    const transaction = await navigationPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.origin': 'auto.navigation.react_router',
            'sentry.op': 'navigation',
            'sentry.source': 'route',
          },
          op: 'navigation',
          origin: 'auto.navigation.react_router',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: '/performance/ssr',
      type: 'transaction',
      transaction_info: { source: 'route' },
      platform: 'javascript',
      request: {
        url: expect.stringContaining('/performance/ssr'),
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
          { name: 'npm:@sentry/browser', version: expect.any(String) },
        ],
      },
      tags: { runtime: 'browser' },
    });
  });

  test('should update navigation transaction for dynamic routes', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance/with/:param';
    });

    await page.goto(`/performance`); // pageload
    await page.waitForTimeout(1000); // give it a sec before navigation
    await page.getByRole('link', { name: 'With Param Page' }).click(); // navigation

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.origin': 'auto.navigation.react_router',
            'sentry.op': 'navigation',
            'sentry.source': 'route',
          },
          op: 'navigation',
          origin: 'auto.navigation.react_router',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: '/performance/with/:param',
      type: 'transaction',
      transaction_info: { source: 'route' },
      platform: 'javascript',
      request: {
        url: expect.stringContaining('/performance/with/sentry'),
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
          { name: 'npm:@sentry/browser', version: expect.any(String) },
        ],
      },
      tags: { runtime: 'browser' },
    });
  });
});
