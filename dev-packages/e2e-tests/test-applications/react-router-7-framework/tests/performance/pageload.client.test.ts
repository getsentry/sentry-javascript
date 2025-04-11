import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('client - pageload performance', () => {
  test('should send pageload transaction', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance';
    });

    await page.goto(`/performance`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.origin': 'auto.pageload.browser',
            'sentry.op': 'pageload',
            'sentry.source': 'url',
          },
          op: 'pageload',
          origin: 'auto.pageload.browser',
        },
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: '/performance',
      type: 'transaction',
      transaction_info: { source: 'url' },
      measurements: expect.any(Object),
      platform: 'javascript',
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
          { name: 'npm:@sentry/browser', version: expect.any(String) },
        ],
      },
      tags: { runtime: 'browser' },
    });
  });

  // todo: this page is currently not prerendered (see react-router.config.ts)
  test('should send pageload transaction for prerendered pages', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance/static';
    });

    await page.goto(`/performance/static`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      transaction: '/performance/static',
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          data: {
            'sentry.origin': 'auto.pageload.browser',
            'sentry.op': 'pageload',
            'sentry.source': 'url',
          },
          op: 'pageload',
          origin: 'auto.pageload.browser',
        },
      },
    });
  });
});
